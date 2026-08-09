/**
 * Mint short-lived, single-object URLs for Cloudflare R2.
 *
 * ## Why this endpoint has to exist
 *
 * Supabase is designed to be called from a browser: its anon key is public, and
 * Row Level Security is what actually protects the data. **R2 has no
 * equivalent.** An R2 API token is all-or-nothing — anyone holding it can read,
 * overwrite and delete every object in the bucket — so it can only ever live on
 * a server.
 *
 * So the browser never touches R2 credentials. It asks here, this endpoint
 * checks who is asking and what for, and hands back a URL that works for ten
 * minutes and then stops. The bytes themselves go straight from the phone to
 * Cloudflare and never pass through this function, which is what keeps large
 * imports fast and keeps egress off the bill.
 *
 * ## The two checks, and why the second one is the important one
 *
 * 1. **The caller has a real Supabase session.** Verified against Supabase
 *    itself rather than by decoding the token here — signature verification
 *    done by hand is a classic place to be subtly wrong, and this call is
 *    cached by the platform anyway.
 *
 * 2. **Every key asked for begins with the caller's own `users/<id>/`.** This
 *    is the one that matters. Without it, *any* signed-in reader could ask for
 *    a URL to *any* object in the bucket, and the fact that Postgres refuses to
 *    show them the key would be no protection at all — they could simply guess.
 *    A signed URL is a capability; the whole security of this design is that we
 *    only ever mint capabilities for the caller's own prefix.
 *
 * Deliberately batched: `getAssets` asks for the handful of pictures on the
 * current page, and one round trip for six of them beats six round trips.
 */

import { AwsClient } from 'aws4fetch'

export const config = { runtime: 'edge' }

/** Long enough for a slow phone to finish a large upload, short enough to be dull if leaked. */
const EXPIRES_SECONDS = 600

/** A page of a book mentions a handful of pictures, never hundreds. */
const MAX_KEYS = 100

type Operation = 'put' | 'get' | 'delete'

const METHOD_FOR: Readonly<Record<Operation, string>> = {
  put: 'PUT',
  get: 'GET',
  delete: 'DELETE',
}

interface SignRequest {
  op: Operation
  keys: string[]
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })
}

/**
 * In production the app and this function share an origin, so CORS never comes
 * into it. It matters only for `vercel dev` alongside the Vite server on
 * another port — hence an explicit allowlist rather than `*`, which would let
 * any page on the internet spend the caller's session on their behalf.
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

/**
 * The project origin, however `SUPABASE_URL` was pasted in — a trailing slash,
 * or the dashboard's RESTful endpoint (`.../rest/v1`) copied instead of the
 * Project URL sitting right above it. Both would make the check below request a
 * path that doesn't exist, and every failure here is indistinguishable from a
 * bad token: the caller just gets a 401 and no clue why. Mirrors
 * `normaliseSupabaseUrl` in `web/src/storage/cloud/client.ts`; duplicated
 * rather than shared because `api/` is built separately from `web/`.
 */
function supabaseOrigin(): string | undefined {
  const raw = process.env.SUPABASE_URL?.trim()
  if (!raw) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return raw
  }
}

/** The signed-in reader's id, or undefined if the token isn't good. */
async function userIdFrom(token: string): Promise<string | undefined> {
  const supabaseUrl = supabaseOrigin()
  const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !supabaseKey) return undefined

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, authorization: `Bearer ${token}` },
  })
  if (!response.ok) return undefined

  const user = (await response.json()) as { id?: string }
  return typeof user.id === 'string' ? user.id : undefined
}

/**
 * Percent-encode each segment but keep the slashes. R2 keys are paths, and an
 * epub's own archive paths routinely carry spaces and accented letters — those
 * must be escaped or the signature is computed over a different string than the
 * one the browser ends up requesting.
 */
function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405, origin)
  }

  const accountId = process.env.R2_ACCOUNT_ID
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    // Said plainly rather than as a 500: on a fresh deploy this is nearly always
    // a missing Environment Variable, and "R2 is not configured" saves an hour
    // of looking in the wrong place.
    return json({ error: 'R2 is not configured on the server.' }, 503, origin)
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Not signed in.' }, 401, origin)

  const userId = await userIdFrom(token)
  if (!userId) return json({ error: 'Not signed in.' }, 401, origin)

  let body: SignRequest
  try {
    body = (await request.json()) as SignRequest
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400, origin)
  }

  const method = METHOD_FOR[body.op]
  if (!method) return json({ error: 'Unknown operation.' }, 400, origin)

  const keys = Array.isArray(body.keys) ? body.keys : []
  if (keys.length === 0) return json({ urls: [] }, 200, origin)
  if (keys.length > MAX_KEYS) {
    return json({ error: `At most ${MAX_KEYS} keys per request.` }, 400, origin)
  }

  // The check the whole design rests on — see the module note.
  //
  // Two parts, and the second is not paranoia. A key is a literal string to R2,
  // but the URL below is built with `new URL()`, which *normalises* `..` the way
  // a filesystem does. So `users/<me>/../<someone-else>/…` would sail through a
  // `startsWith` check and then resolve, once signed, to another reader's
  // object. Traversal segments are refused outright rather than stripped:
  // silently rewriting a key would hand back a working URL for a different file
  // than the one asked for, which is its own kind of wrong.
  const prefix = `users/${userId}/`
  const allowed = (key: unknown): key is string =>
    typeof key === 'string' &&
    key.startsWith(prefix) &&
    !key.split('/').some((segment) => segment === '.' || segment === '..')

  if (!keys.every(allowed)) {
    return json({ error: 'Those files are not yours.' }, 403, origin)
  }

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  const urls = await Promise.all(
    keys.map(async (key) => {
      const url = new URL(
        `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeKey(key)}`,
      )
      url.searchParams.set('X-Amz-Expires', String(EXPIRES_SECONDS))

      // `signQuery` puts the whole signature in the query string and signs only
      // the host header. That is what lets the browser add its own
      // `content-type` on a PUT without invalidating anything — sign a header
      // here and every caller has to reproduce it byte for byte.
      const signed = await client.sign(url, { method, aws: { signQuery: true } })
      return signed.url
    }),
  )

  return json({ urls }, 200, origin)
}
