/**
 * The list of models the reader may pick from, across every provider we hold a
 * key for.
 *
 * ## Why this is fetched and never hardcoded
 *
 * The free roster churns weekly. Models are delisted without warning, and a
 * list baked into the bundle would slowly become a menu of things that no
 * longer answer. So the roster is read live from every provider each time the
 * cache goes cold.
 *
 * ## Three providers, one shape
 *
 * OpenRouter, Groq and Gemini all speak the OpenAI chat-completions shape —
 * Gemini through its compatibility layer at `/v1beta/openai`. That is what
 * makes three providers affordable: the relay's request body is the same for
 * all three, and only the base URL and the key change. Each row carries the
 * `source` it came from, because the relay needs it to route and the picker
 * shows it as a column.
 *
 * A provider we hold no key for contributes nothing and costs nothing. A
 * provider whose roster call fails drops its rows and lets the others through —
 * losing one column is much better than losing the picker.
 *
 * ## Two filters, and then the probe
 *
 * **Shape**: text in, text out, big enough context. This throws away the image,
 * speech, robotics and deep-research models that share these rosters. On
 * OpenRouter it also means free (`pricing` both zero) and tool-capable, asked
 * for with `?supported_parameters=tools`.
 *
 * Tool-capability matters beyond the one feature. "Still true?" needs a model
 * that can search, but it also has to hold on *failover*. If the chain falls
 * through to a model that cannot call a tool, search silently stops happening
 * and the answer looks the same as one that searched.
 *
 * **Free** means something different on each provider, which is worth saying
 * plainly. On OpenRouter it is a price of zero. On Groq and Gemini there is no
 * per-model price to read — the free tier is a property of the account, and
 * every model is billed at its listed rate once you add a card. So the roster
 * cannot tell us what is free there. The probe below can.
 *
 * ## The probe, and why it does not simply delete what fails
 *
 * A listed model is not a usable one. Gemini lists Pro, and Pro answers 429 on
 * a free key forever. OpenRouter lists gated models that answer 403. Those rows
 * are worse than useless in a picker: the reader chooses one and gets nothing
 * back, with no way to tell a bad choice from a broken app.
 *
 * So every surviving row gets a one-token question before it is offered. But a
 * single failed probe is *not* enough to delete a model, and that was measured
 * rather than assumed. Probing the same 56 models twice, a few minutes apart,
 * disagreed on three of them: `nemotron-3-ultra-550b` was fine and then 502,
 * `poolside/laguna-s-2.1` was 429 and then fine, `stealth/ox-alpha` was fine and
 * then timed out. Deleting on one failure would have thrown away three good
 * models for being busy in the second we happened to ask.
 *
 * The two cases are told apart by what the failure says:
 *
 *   - **400, 403, 404 — gone for good.** A retired alias, a gated model, a
 *     wrong-shaped one. Retrying will never change the answer. The row is
 *     dropped.
 *   - **429 carrying `limit: 0` — gone for good.** This is Gemini's way of
 *     saying the free tier grants this model no quota at all, which is exactly
 *     what Pro does. A real "you are going too fast" 429 names a limit above
 *     zero, so the number is what separates them.
 *   - **Anything else — busy, not dead.** Kept, and marked `busy`. The picker
 *     ranks these last and the chain steps past them.
 *
 * ## What this endpoint deliberately does not do
 *
 * It does not decide which models are any good for reading, or what order they
 * go in. That judgment is real, and it is wrong often enough to need tests —
 * and nothing in `api/` can have one, because this folder is built separately
 * from `web/`. So this hands back everything that answers, tagged with where it
 * came from, and `web/src/reader/models.ts` does the choosing where it can be
 * measured.
 */

export const config = { runtime: 'edge' }

/** Which provider a row came from. The picker draws one column per source. */
type Source = 'gemini' | 'openrouter' | 'groq'

interface Row {
  id: string
  name: string
  /** Passed through so the client can judge fitness. Trimmed — it can be long. */
  description: string
  contextLength: number
  source: Source
  /** True when the probe found it alive but unwilling. Ranked last, not hidden. */
  busy?: boolean
  /** True for the paid Claude row, which is added by hand. */
  paid?: boolean
}

/**
 * How long a roster stays fresh at the edge.
 *
 * An hour. The list changes weekly, so this is not about staleness — it is
 * about not asking three providers, and running 37 probes, once per lamp
 * opening for an answer that has not moved.
 */
const CACHE_SECONDS = 3600

/**
 * The whole probe's budget, and one probe's.
 *
 * Six seconds, measured rather than guessed: 37 models answered in 6.0s flat
 * when asked in parallel for a single token. An earlier version asked for five
 * tokens with a 15-second cap and took 56 seconds, which no edge function will
 * sit through — the width was never the problem, the per-request ceiling was.
 *
 * A probe that does not finish inside the budget counts as busy, never as dead.
 * A slow answer is the least reliable signal here and must not delete a row.
 */
const PROBE_MS = 6000

/** Text in, text out, or it is not a tutor. */
const NOT_A_TUTOR =
  /image|tts|audio|speech|whisper|orpheus|lyria|robotics|computer-use|deep-research|antigravity|nano-banana|omni|guard|embedding|rerank/i

/**
 * The smallest context we will offer.
 *
 * A tutor is handed a passage, a task module and the whole conversation so far.
 * Anything smaller starts dropping the beginning of a thread mid-explanation,
 * which reads as the tutor losing its place.
 */
const MIN_CONTEXT = 16_000

const ENDPOINTS: Record<Source, { roster: string; chat: string }> = {
  openrouter: {
    roster: 'https://openrouter.ai/api/v1/models?supported_parameters=tools',
    chat: 'https://openrouter.ai/api/v1/chat/completions',
  },
  groq: {
    roster: 'https://api.groq.com/openai/v1/models',
    chat: 'https://api.groq.com/openai/v1/chat/completions',
  },
  gemini: {
    roster: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    chat: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
}

function keyFor(source: Source): string | undefined {
  const named = {
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  }[source]
  return named?.trim() || undefined
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (!origin || !allowed.includes(origin)) return {}

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
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

async function signedIn(token: string): Promise<boolean> {
  const url = supabaseOrigin()
  const key = process.env.SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return false

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  })
  return response.ok
}

function free(pricing: unknown): boolean {
  const cost = pricing as { prompt?: unknown; completion?: unknown } | null
  return Number(cost?.prompt) === 0 && Number(cost?.completion) === 0
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 300) : ''
}

/** OpenRouter: free, tool-capable, and shaped like a tutor. */
async function openrouterRoster(key: string): Promise<Row[]> {
  const response = await fetch(ENDPOINTS.openrouter.roster, {
    headers: { authorization: `Bearer ${key}` },
  })
  if (!response.ok) throw new Error(`OpenRouter answered ${response.status}`)

  const payload = (await response.json()) as { data?: Record<string, unknown>[] }

  return (payload.data ?? [])
    .filter((row) => typeof row.id === 'string' && free(row.pricing))
    .map((row) => ({
      id: row.id as string,
      name: typeof row.name === 'string' ? row.name : (row.id as string),
      description: trim(row.description),
      contextLength: Number(row.context_length) || 0,
      source: 'openrouter' as const,
    }))
    .filter((row) => !NOT_A_TUTOR.test(`${row.id} ${row.name}`))
    .filter((row) => row.contextLength === 0 || row.contextLength >= MIN_CONTEXT)
}

/**
 * Groq: tool-capable and shaped like a tutor.
 *
 * `supported_features` is Groq's own answer to the question OpenRouter answers
 * with `?supported_parameters=tools`, so the same guarantee holds on failover.
 * Price is not consulted — see the note on "free" at the top of this file.
 */
async function groqRoster(key: string): Promise<Row[]> {
  const response = await fetch(ENDPOINTS.groq.roster, {
    headers: { authorization: `Bearer ${key}` },
  })
  if (!response.ok) throw new Error(`Groq answered ${response.status}`)

  const payload = (await response.json()) as { data?: Record<string, unknown>[] }

  return (payload.data ?? [])
    .filter((row) => typeof row.id === 'string' && row.active !== false)
    .filter((row) => (row.supported_features as string[] | undefined)?.includes('tools'))
    .map((row) => ({
      id: row.id as string,
      name: typeof row.name === 'string' ? row.name : (row.id as string),
      description: trim(row.description),
      contextLength: Number(row.context_window) || 0,
      source: 'groq' as const,
    }))
    .filter((row) => !NOT_A_TUTOR.test(`${row.id} ${row.name}`))
    .filter((row) => row.contextLength >= MIN_CONTEXT)
}

/**
 * Gemini: the models that can hold a conversation.
 *
 * `generateContent` is the method a chat model supports; the image, speech and
 * embedding models list something else. The `models/` prefix is stripped
 * because the OpenAI-compatible endpoint the relay calls does not take it.
 */
async function geminiRoster(key: string): Promise<Row[]> {
  const response = await fetch(`${ENDPOINTS.gemini.roster}&key=${encodeURIComponent(key)}`)
  if (!response.ok) throw new Error(`Gemini answered ${response.status}`)

  const payload = (await response.json()) as { models?: Record<string, unknown>[] }

  return (payload.models ?? [])
    .filter((row) => typeof row.name === 'string')
    .filter((row) =>
      (row.supportedGenerationMethods as string[] | undefined)?.includes('generateContent'),
    )
    .map((row) => ({
      id: (row.name as string).replace(/^models\//, ''),
      name: typeof row.displayName === 'string' ? row.displayName : (row.name as string),
      description: trim(row.description),
      contextLength: Number(row.inputTokenLimit) || 0,
      source: 'gemini' as const,
    }))
    .filter((row) => !NOT_A_TUTOR.test(`${row.id} ${row.name}`))
    .filter((row) => row.contextLength >= MIN_CONTEXT)
}

/** What one probe concluded. See the long note at the top for the rules. */
type Verdict = 'live' | 'busy' | 'dead'

/**
 * The error envelope, whatever shape the provider wrapped it in.
 *
 * OpenRouter and Groq return `{ error: { ... } }`. Gemini's compatibility layer
 * returns `[{ error: { ... } }]` — a JSON *array* holding one of them. Reading
 * only the object shape silently loses Gemini's message, which is not a
 * cosmetic loss: `limit: 0` lives in that message, and it is the one signal
 * that separates "this model has no free quota, ever" from "this model is busy
 * this second". Without this unwrapping, Gemini Pro is kept as busy and stays
 * in the picker as a row that can never answer.
 *
 * Found by probing the live API rather than by reading a doc. It is the kind of
 * difference that no amount of unit testing against our own fixtures catches.
 */
function envelope(payload: unknown): { message?: unknown; code?: unknown } | undefined {
  const said = Array.isArray(payload) ? payload[0] : payload
  return (said as { error?: { message?: unknown; code?: unknown } } | null)?.error
}

/**
 * Whether a refusal is permanent.
 *
 * The status codes are the easy half. The `limit: 0` test is the interesting
 * one: Gemini reports both "this model is not on your tier" and "you are asking
 * too fast" as 429, and the only thing that separates them is the quota it
 * names. Zero means there was never any quota to use up.
 */
function permanent(status: number, message: string): boolean {
  if (status === 400 || status === 403 || status === 404) return true
  return status === 429 && /limit:\s*0\b/.test(message)
}

/**
 * Ask a model for one token, and see what comes back.
 *
 * `max_tokens: 1` because the content is irrelevant — this asks whether the
 * door opens, not whether the model is any good. The cost of the whole probe is
 * about 37 tokens.
 */
async function probe(row: Row, key: string, signal: AbortSignal): Promise<Verdict> {
  try {
    const response = await fetch(ENDPOINTS[row.source].chat, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: row.id,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    })

    const failure = envelope(await response.json().catch(() => null))

    // A rate-limited provider can come back as HTTP 200 with an error envelope
    // and no answer at all. The envelope is the real status, so prefer it.
    const said = typeof failure?.message === 'string' ? failure.message : ''
    const status = typeof failure?.code === 'number' ? failure.code : response.status

    if (response.ok && !failure) return 'live'
    return permanent(status, said) ? 'dead' : 'busy'
  } catch {
    // A timeout or a dropped connection. The least reliable signal there is —
    // never enough to delete a row.
    return 'busy'
  }
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const keys: Partial<Record<Source, string>> = {}
  for (const source of ['gemini', 'openrouter', 'groq'] as const) {
    const key = keyFor(source)
    if (key) keys[source] = key
  }

  if (Object.keys(keys).length === 0) {
    return new Response(JSON.stringify({ error: 'the tutor relay has no API key' }), {
      status: 500,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    })
  }

  // The same spend control as `tutor.ts`. This endpoint spends almost nothing
  // itself, but it is the menu for one that does, and there is no reason to
  // serve it to someone who cannot use it.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await signedIn(token))) {
    return new Response(JSON.stringify({ error: 'sign in to choose a model' }), {
      status: 401,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    })
  }

  /*
   * Every roster at once, and a failed provider costs only its own column.
   *
   * `allSettled` rather than `all` on purpose. One provider having a bad minute
   * used to be the difference between a picker and no picker; now it is the
   * difference between three columns and two.
   */
  const rosters = await Promise.allSettled([
    keys.gemini ? geminiRoster(keys.gemini) : Promise.resolve([]),
    keys.openrouter ? openrouterRoster(keys.openrouter) : Promise.resolve([]),
    keys.groq ? groqRoster(keys.groq) : Promise.resolve([]),
  ])

  const listed = rosters.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))

  if (listed.length === 0) {
    // Reported as a failure, never as an empty roster. An empty list reads as
    // "there are no models", which would send the reader hunting for a problem
    // that is really a network hiccup at our end.
    const why = rosters.find((result) => result.status === 'rejected')
    return new Response(
      JSON.stringify({
        error:
          why?.status === 'rejected' && why.reason instanceof Error
            ? why.reason.message
            : 'roster unavailable',
      }),
      { status: 502, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } },
    )
  }

  // One deadline for the whole probe, not one per model. The models are asked
  // in parallel, so the slowest sets the pace and a per-model timer would only
  // ever let the total drift past the budget.
  const clock = new AbortController()
  const timer = setTimeout(() => clock.abort(), PROBE_MS)

  let rows: Row[]
  try {
    const verdicts = await Promise.all(
      listed.map(async (row) => ({
        row,
        verdict: await probe(row, keys[row.source]!, clock.signal),
      })),
    )
    rows = verdicts
      .filter(({ verdict }) => verdict !== 'dead')
      .map(({ row, verdict }) => (verdict === 'busy' ? { ...row, busy: true } : row))
  } finally {
    clearTimeout(timer)
  }

  // Claude is paid, so it is never in a free roster. It is added by hand, and
  // marked, because the reader is entitled to know which choice costs money. It
  // goes through OpenRouter like everything else on that column.
  const claude = process.env.TUTOR_MODEL_CLAUDE?.trim()
  if (claude && keys.openrouter) {
    rows.unshift({
      id: claude,
      name: 'Claude',
      description: 'Anthropic’s Claude, through the same relay. This one is paid.',
      contextLength: 200_000,
      source: 'openrouter',
      paid: true,
    })
  }

  return new Response(JSON.stringify({ models: rows }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=60, s-maxage=${CACHE_SECONDS}`,
      ...corsHeaders(origin),
    },
  })
}
