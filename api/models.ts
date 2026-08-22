/**
 * The list of models the reader may pick from.
 *
 * ## Why this is fetched and never hardcoded
 *
 * The free roster churns weekly. Models are delisted without warning, and a
 * list baked into the bundle would slowly become a menu of things that no
 * longer answer. So the roster is read live from OpenRouter every time the
 * cache goes cold.
 *
 * ## Two filters, and the second one is the important one
 *
 * **Free**: `pricing.prompt` and `pricing.completion` are both zero.
 *
 * **Tool-capable**: asked for with `?supported_parameters=tools`. This looks
 * like a filter for one feature — "Still true?" needs a model that can
 * search — but it also has to hold on *failover*. If the chain falls through
 * to a model that cannot call a tool, search silently stops happening and the
 * answer looks the same as one that searched. So the whole picker is filtered,
 * not just the entries used for search.
 *
 * ## What this endpoint deliberately does not do
 *
 * It does not decide which models are any good for reading. That judgment is
 * real, and it is wrong often enough to need tests — and nothing in `api/` can
 * have one, because this folder is built separately from `web/`. So this hands
 * back everything free and tool-capable, description included, and
 * `web/src/reader/models.ts` does the choosing where it can be measured.
 */

export const config = { runtime: 'edge' }

const OPENROUTER = 'https://openrouter.ai/api/v1/models?supported_parameters=tools'

/**
 * How long a roster stays fresh at the edge.
 *
 * An hour. The list changes weekly, so this is not about staleness — it is
 * about not asking OpenRouter once per lamp opening for an answer that has not
 * moved.
 */
const CACHE_SECONDS = 3600

interface Row {
  id: string
  name: string
  /** Passed through so the client can judge fitness. Trimmed — it can be long. */
  description: string
  contextLength: number
  /** True for the paid Claude row, which is added by hand. */
  paid?: boolean
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

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const key = process.env.OPENROUTER_API_KEY?.trim()
  if (!key) {
    return new Response(JSON.stringify({ error: 'the tutor relay has no API key' }), {
      status: 500,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    })
  }

  // The same spend control as `tutor.ts`. This endpoint spends nothing itself,
  // but it is the menu for one that does, and there is no reason to serve it
  // to someone who cannot use it.
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !(await signedIn(token))) {
    return new Response(JSON.stringify({ error: 'sign in to choose a model' }), {
      status: 401,
      headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
    })
  }

  let rows: Row[]
  try {
    const response = await fetch(OPENROUTER, { headers: { authorization: `Bearer ${key}` } })
    if (!response.ok) throw new Error(`OpenRouter answered ${response.status}`)

    const payload = (await response.json()) as {
      data?: {
        id?: unknown
        name?: unknown
        description?: unknown
        context_length?: unknown
        pricing?: unknown
      }[]
    }

    rows = (payload.data ?? [])
      .filter((row) => typeof row.id === 'string' && free(row.pricing))
      .map((row) => ({
        id: row.id as string,
        name: typeof row.name === 'string' ? row.name : (row.id as string),
        description:
          typeof row.description === 'string' ? row.description.replace(/\s+/g, ' ').slice(0, 300) : '',
        contextLength: Number(row.context_length) || 0,
      }))
  } catch (error) {
    // Reported as a failure, never as an empty roster. An empty list reads as
    // "there are no models", which would send the reader hunting for a problem
    // that is really a network hiccup at our end.
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'roster unavailable' }),
      { status: 502, headers: { 'content-type': 'application/json', ...corsHeaders(origin) } },
    )
  }

  // Claude is paid, so it is never in the free roster. It is added by hand, and
  // marked, because the reader is entitled to know which choice costs money.
  const claude = process.env.TUTOR_MODEL_CLAUDE?.trim()
  if (claude) {
    rows.unshift({
      id: claude,
      name: 'Claude',
      description: 'Anthropic’s Claude, through the same relay. This one is paid.',
      contextLength: 200_000,
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
