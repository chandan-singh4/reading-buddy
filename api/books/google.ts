/**
 * A thin, signed-in proxy to the Google Books API.
 *
 * ## Why this endpoint exists at all
 *
 * Only to hold the key. `GOOGLE_BOOKS_KEY` must never reach the browser — a
 * `VITE_` prefix would compile it into every visitor's JavaScript, where it is
 * one "view source" away from being spent by strangers against this project's
 * quota.
 *
 * **And that is all it does.** Deciding whether a result is really the book on
 * the shelf is the hard part and the part that can be quietly wrong, so it does
 * not live here: `api/` is built separately from `web/` and cannot share code
 * with it, which means nothing in this file can have a test. The judgment lives
 * in `web/src/catalogue/`, where it is measured against the reader's real
 * library. This function forwards questions and reports what came back.
 *
 * ## The one rule about failure
 *
 * An upstream failure is reported as a failure. It is never flattened into "no
 * such book" — a 429 that reads as "Google has no record of this" would be
 * written into the database as a fact, and one rate-limited afternoon would
 * permanently mark half the shelf as missing from the catalogue. This is not
 * hypothetical: the first probe written against this API reported exactly that,
 * and it was a quota error. So upstream status codes are passed through, and the
 * client stores nothing unless it got an answer.
 *
 * ## Sign-in is required, and not for privacy
 *
 * Nothing here is secret — it is a public catalogue. The session check is a
 * spend control: without it, this URL is an open, unmetered proxy to a quota
 * this project pays for in rate limits.
 */

export const config = { runtime: 'edge' }

/** Three candidates is enough for the guard to find the right one, or none. */
const MAX_RESULTS = 5

/** One book's worth of volumes per request. A backfill is a loop, not a flood. */
const MAX_IDS = 5

/** Covers are small. Anything this size is not a thumbnail and is not ours. */
const MAX_COVER_BYTES = 4 * 1024 * 1024

const GOOGLE = 'https://www.googleapis.com/books/v1'

type Body =
  | { op: 'search'; q: string }
  | { op: 'volumes'; ids: string[] }
  | { op: 'cover'; url: string }

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })
}

/**
 * Same allowlist as `api/r2/sign.ts`. In production the app and this function
 * share an origin; this matters only for `vercel dev` beside the Vite server.
 */
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

/** Mirrors `supabaseOrigin` in `api/r2/sign.ts` — see the note there. */
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

/**
 * Ask Google, and hand back both the status and the body.
 *
 * The status is the point. A 429 and an empty result set are opposite answers
 * that are trivially easy to conflate, and conflating them writes a network
 * problem into the database as a fact about a book.
 */
async function ask(path: string, key: string): Promise<{ status: number; body: unknown }> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${GOOGLE}${path}${separator}key=${encodeURIComponent(key)}`, {
    headers: { accept: 'application/json' },
  })

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { status: response.status, body }
}

/**
 * Fetch a cover image's bytes.
 *
 * Through here rather than straight from the browser because Google's image
 * hosts send no CORS headers, so a page cannot read the bytes itself — and bytes
 * are what we want. A stored URL would be a picture that disappears when the
 * link rots and is missing whenever the phone is offline.
 *
 * The URL is checked against Google's own image hosts before it is fetched.
 * Without that this is an open redirector: hand it any address and this function
 * will dutifully fetch it from inside our infrastructure and hand back the body.
 */
const COVER_HOSTS = new Set(['books.google.com', 'books.googleusercontent.com'])

async function cover(raw: string, origin: string | null): Promise<Response> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return json({ error: 'Not a URL.' }, 400, origin)
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return json({ error: 'Not a cover image.' }, 400, origin)
  }
  if (!COVER_HOSTS.has(url.hostname)) {
    return json({ error: 'Not a cover image.' }, 400, origin)
  }

  const response = await fetch(url.toString())
  if (!response.ok) return json({ error: 'No cover.' }, response.status, origin)

  const type = response.headers.get('content-type') ?? ''
  // Google serves an HTML "image not available" page on some volumes, and a
  // book whose cover is a 404 page looks worse than one with no cover at all.
  if (!type.startsWith('image/')) return json({ error: 'Not an image.' }, 415, origin)

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_COVER_BYTES) {
    return json({ error: 'Cover too large.' }, 413, origin)
  }

  return new Response(bytes, {
    status: 200,
    headers: { 'content-type': type, ...corsHeaders(origin) },
  })
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405, origin)
  }

  const key = process.env.GOOGLE_BOOKS_KEY?.trim()
  if (!key) {
    // Said plainly rather than as a 500 — on a fresh deploy this is nearly
    // always a missing Environment Variable, and naming it saves an hour.
    return json({ error: 'Google Books is not configured on the server.' }, 503, origin)
  }

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token || !(await signedIn(token))) {
    return json({ error: 'Not signed in.' }, 401, origin)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, origin)
  }

  if (body.op === 'cover') {
    if (typeof body.url !== 'string') return json({ error: 'No URL.' }, 400, origin)
    return cover(body.url, origin)
  }

  if (body.op === 'search') {
    if (typeof body.q !== 'string' || !body.q.trim()) {
      return json({ error: 'No query.' }, 400, origin)
    }

    const query = `/volumes?q=${encodeURIComponent(body.q)}&maxResults=${MAX_RESULTS}`
    const { status, body: result } = await ask(query, key)
    // Upstream status passed straight through: see the note about 429s.
    return json(status === 200 ? result : { error: 'Google Books said no.' }, status, origin)
  }

  if (body.op === 'volumes') {
    const ids = Array.isArray(body.ids) ? body.ids : []
    if (ids.length === 0) return json({ volumes: [] }, 200, origin)
    if (ids.length > MAX_IDS) return json({ error: `At most ${MAX_IDS} ids.` }, 400, origin)
    if (!ids.every((id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id))) {
      return json({ error: 'Bad id.' }, 400, origin)
    }

    // The second hop, and the reason this endpoint has a `volumes` operation at
    // all. A search result is a stub: `pageCount` 0, no publisher, one coarse
    // category. Everything worth storing appears only when the volume is
    // fetched by its own id — measured on Breath, 0 pages from the search and
    // 280 from the volume.
    const answers = await Promise.all(ids.map((id) => ask(`/volumes/${id}`, key)))

    // One bad answer fails the batch. A partial result would be indistinguishable
    // from "these volumes have no data", which is the confusion this whole file
    // is arranged to avoid.
    const failed = answers.find((answer) => answer.status !== 200)
    if (failed) return json({ error: 'Google Books said no.' }, failed.status, origin)

    return json({ volumes: answers.map((answer) => answer.body) }, 200, origin)
  }

  return json({ error: 'Unknown operation.' }, 400, origin)
}
