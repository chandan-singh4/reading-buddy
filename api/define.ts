/**
 * The dictionary relay: two Merriam-Webster keys, and nothing else.
 *
 * ## What this does and does not do
 *
 * It holds the keys, checks there is a session behind the request, asks MW's
 * two references at once, and hands both answers back **exactly as MW sent
 * them**. It does not parse, reshape, or decide anything about the content.
 * That all happens in `web/src/reader/dictionary.ts`, for two reasons: the
 * parsed entry is what the app caches, so the parser has to be a plain function
 * of the raw response rather than something behind a network call; and the test
 * suite lives on the web side, so a parser here would be the one part of the
 * feature nothing could test.
 *
 * ## Why a session is required for a free public dictionary
 *
 * The same reason as `api/books/google.ts`. Nothing here is secret — it is a
 * dictionary — but without the check this URL is an open, unmetered proxy to a
 * quota measured in a thousand lookups a day. The check is a spend control, not
 * a privacy one.
 *
 * ## Terms
 *
 * MW's free tier is non-commercial and forbids redistribution and bulk
 * pre-fetching. This endpoint therefore answers one word at a time and is only
 * ever called by a reader tapping a word. The app caches what it looked up so a
 * word is fetched once; that is a reader's own copy of what they read, not a
 * dataset.
 */

export const config = { runtime: 'edge' }

/** A word, not a sentence. Anything longer is a mis-tap or a mistake. */
const MAX_WORD = 60

/**
 * MW answers in well under a second. Past this the reader has already given up,
 * and the panel's own offline line is a better answer than a longer wait.
 */
const TIMEOUT_MS = 8_000

const MW = 'https://www.dictionaryapi.com/api/v3/references'

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })
}

/** The same allowlist as the other endpoints — see `api/books/google.ts`. */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (!origin || !allowed.includes(origin)) return {}

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

function supabaseOrigin(): string | undefined {
  const raw = process.env.SUPABASE_URL?.trim()
  if (!raw) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return raw
  }
}

/** Whether the caller has a real session. Their id is not needed — only that they have one. */
async function signedIn(token: string): Promise<boolean> {
  const supabaseUrl = supabaseOrigin()
  const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !supabaseKey) return false

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, authorization: `Bearer ${token}` },
  })
  return response.ok
}

/** What came back from one reference, status and all. */
interface Answer {
  status: number
  body: unknown
}

/**
 * Ask one reference.
 *
 * The status travels with the body because the two say opposite things that are
 * easy to conflate. MW answers a word it does not have with `200` and a list of
 * spellings; it answers a spent quota with `429` and no body at all. Flattening
 * either into "no result" would write "this word does not exist" over what was
 * really a rate limit.
 */
async function ask(reference: string, word: string, key: string): Promise<Answer> {
  const url = `${MW}/${reference}/json/${encodeURIComponent(word)}?key=${encodeURIComponent(key)}`

  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: stop.signal })
    if (!response.ok) return { status: response.status, body: null }
    return { status: 200, body: await response.json().catch(() => null) }
  } catch {
    return { status: 504, body: null }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405, origin)
  }

  const collegiateKey = process.env.MW_COLLEGIATE_KEY?.trim()
  const thesaurusKey = process.env.MW_THESAURUS_KEY?.trim()
  if (!collegiateKey) {
    return json({ error: 'the dictionary relay has no key' }, 500, origin)
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await signedIn(token))) {
    return json({ error: 'sign in to use the dictionary' }, 401, origin)
  }

  let body: { word?: unknown }
  try {
    body = (await request.json()) as { word?: unknown }
  } catch {
    return json({ error: 'unreadable request' }, 400, origin)
  }

  const word = typeof body.word === 'string' ? body.word.trim().toLowerCase() : ''
  if (!word || word.length > MAX_WORD) {
    return json({ error: 'ask for one word' }, 400, origin)
  }

  /*
   * Both at once. The thesaurus is optional in a way the dictionary is not: a
   * deployment with only the one key still defines words, and simply never
   * shows the synonym chips.
   */
  const [collegiate, thesaurus] = await Promise.all([
    ask('collegiate', word, collegiateKey),
    thesaurusKey
      ? ask('thesaurus', word, thesaurusKey)
      : Promise.resolve<Answer>({ status: 404, body: null }),
  ])

  /*
   * A spent quota is the reader's answer, not a footnote inside a 200.
   *
   * The panel says something quite different for "the dictionary is out of
   * lookups for today" than for "no such word", and it can only tell them apart
   * if the status survives the trip.
   */
  if (collegiate.status !== 200) {
    return json({ error: 'the dictionary could not be reached' }, collegiate.status, origin)
  }

  return json(
    {
      word,
      collegiate: collegiate.body,
      // A thesaurus that failed is a missing section, never a failed lookup.
      thesaurus: thesaurus.status === 200 ? thesaurus.body : null,
    },
    200,
    origin,
  )
}
