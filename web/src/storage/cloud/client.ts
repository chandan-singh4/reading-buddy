/**
 * The Supabase connection, and the small amount of sign-in the storage layer
 * needs to know about.
 *
 * ## Why a public key in the browser bundle is fine here
 *
 * `VITE_SUPABASE_ANON_KEY` is compiled into the JavaScript every visitor
 * downloads. That is not a leak — it is the design. The anon key identifies the
 * *project*, not a person, and on its own it can read nothing: every table in
 * `0001_schema.sql` has Row Level Security switched on with a single policy
 * that matches rows against `auth.uid()`. Signed out, the whole database reads
 * as empty.
 *
 * What must never appear here is the `service_role` key, which bypasses those
 * policies entirely. If you ever find one in this file, it is an incident, not
 * a bug.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The project origin, however it was pasted in.
 *
 * Supabase's dashboard shows the Project URL and the RESTful endpoint —
 * `https://<ref>.supabase.co` and `https://<ref>.supabase.co/rest/v1` — a
 * couple of centimetres apart, and copying the wrong one is silent. The client
 * appends its own paths, so `/rest/v1` on the end produces requests to
 * `/rest/v1/auth/v1/otp`, which PostgREST answers with a 404 and `PGRST125:
 * Invalid path specified in request URL`. Nothing in that message mentions the
 * URL you typed, and everything else about the setup looks correct.
 *
 * No Supabase project is legitimately reached at a path, so anything after the
 * host is a paste error and can simply be dropped.
 */
export function normaliseSupabaseUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).origin
  } catch {
    // Not a parseable URL. Hand it back untouched — `createClient` throws a
    // clearer complaint about it than we could invent here.
    return trimmed
  }
}

const SUPABASE_URL = normaliseSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/**
 * Whether the cloud backend has been configured at all.
 *
 * Exported so the app can fall back to IndexedDB rather than crash on a build
 * where the variables were never set — a missing environment variable should
 * cost you the cloud, not the app.
 */
export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let client: SupabaseClient | undefined

export function cloudClient(): SupabaseClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new CloudError(
        'The cloud backend isn’t configured — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing. See docs/cloud-setup.md.',
      )
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // The session lives in localStorage and is refreshed in the background,
        // so an installed PWA that has been closed for a week opens signed in.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/**
 * Anything the storage layer couldn't do, in words a reader can act on.
 *
 * The same standing as `ImportError`: the UI shows `message` as-is, so it has
 * to be a sentence rather than a Postgres error code. `cause` keeps the
 * original for the console.
 */
export class CloudError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'CloudError'
  }
}

// --- Sign in -----------------------------------------------------------------

/**
 * Send a sign-in link to an email address.
 *
 * A link rather than a password, deliberately: there is exactly one account,
 * it is used from a phone, and a password is one more thing to lose. The link
 * lands back on `redirectTo`, where `detectSessionInUrl` picks it up.
 */
export async function sendSignInLink(email: string, redirectTo?: string): Promise<void> {
  const { error } = await cloudClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo ?? window.location.origin },
  })
  if (error) {
    throw new CloudError(
      'That sign-in link couldn’t be sent. Check the address and try again.',
      { cause: error },
    )
  }
}

export async function signOut(): Promise<void> {
  await cloudClient().auth.signOut()
}

/**
 * The signed-in reader, as much of them as the app has any use for.
 *
 * The email is here so the settings screen can show *which* account is signed
 * in. On a single-account app that reads like a nicety, but it is the only way
 * to notice you signed in with the wrong address — at which point the library
 * looks empty and nothing anywhere says why.
 */
export interface CloudUser {
  id: string
  email?: string
}

export async function currentUser(): Promise<CloudUser | undefined> {
  const { data } = await cloudClient().auth.getSession()
  const user = data.session?.user
  return user ? { id: user.id, email: user.email } : undefined
}

/** The signed-in reader's id, or undefined when signed out. */
export async function currentUserId(): Promise<string | undefined> {
  return (await currentUser())?.id
}

/**
 * The signed-in reader's id, or a refusal.
 *
 * Every write goes through this. Throwing rather than returning undefined is
 * the point: a storage call that quietly did nothing because nobody was signed
 * in is how a reader loses an import and never finds out.
 */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId()
  if (!userId) {
    throw new CloudError('You’re signed out, so your library isn’t available. Sign in to continue.')
  }
  return userId
}

/** The bearer token the R2 signing endpoint checks. */
export async function accessToken(): Promise<string | undefined> {
  const { data } = await cloudClient().auth.getSession()
  return data.session?.access_token
}

/** Tell the app when the reader signs in or out, so it can redraw. */
export function onAuthChange(listener: (user: CloudUser | undefined) => void): () => void {
  const { data } = cloudClient().auth.onAuthStateChange((_event, session) => {
    const user = session?.user
    listener(user ? { id: user.id, email: user.email } : undefined)
  })
  return () => data.subscription.unsubscribe()
}

/**
 * Turn a PostgREST result into a value or an error, in one place.
 *
 * Supabase reports failure in the returned object rather than by throwing, so
 * without this every one of the fifty-odd calls in the repository would need
 * its own `if (error)`. Missing one means a write that silently didn't happen.
 */
export function unwrap<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) {
    throw new CloudError(`Couldn’t ${what}: ${result.error.message}`, { cause: result.error })
  }
  return result.data
}
