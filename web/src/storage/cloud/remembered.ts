/**
 * Who was signed in last time there was a signal.
 *
 * ## Why this has to exist
 *
 * A Supabase access token lives about an hour, and `getSession()` renews it by
 * asking the server. With no network that request cannot be made, so once the
 * hour is up `getSession()` reports *nobody is signed in* — not because the
 * reader signed out, but because it could not check.
 *
 * Everything above it believes that answer. `AuthGate` swaps the whole app for
 * a sign-in form the reader cannot complete without a signal, and every write
 * is refused with "you're signed out" rather than being queued — which is the
 * one failure `outbox.ts` exists to prevent. An hour into a flight the reading
 * app stops being a reading app.
 *
 * So the last known reader is written down here, and `client.ts` hands it back
 * when the live session is missing **and the browser says there is no network**.
 * The refresh token itself is untouched: this is not a way to stay signed in, it
 * is a way to not throw the reader out on no evidence.
 *
 * ## Why it is safe
 *
 * It only ever answers while offline, and offline is exactly when the app can do
 * nothing with an identity except read a copy it already holds. Nothing reaches
 * the cloud on the strength of this. The moment a signal returns, the real
 * session decides again — and a real sign-out clears this row on its way past.
 */

import type { CloudUser } from './client.ts'

/** Namespaced like `BACKEND_KEY`, because localStorage is global. */
export const REMEMBERED_USER_KEY = 'rb.user'

/**
 * Write the reader down, or rub them out when they sign out.
 *
 * Never throws. Private mode and disabled storage both land here, and the cost
 * of failing is the old behaviour — a sign-in screen on a plane — not a crash.
 */
export function rememberUser(user: CloudUser | undefined): void {
  try {
    if (!user) {
      localStorage.removeItem(REMEMBERED_USER_KEY)
      return
    }
    localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ id: user.id, email: user.email }))
  } catch {
    // See above.
  }
}

/**
 * The reader we last saw signed in, if the note is still there and readable.
 *
 * An id is required; the email is decoration for the settings screen. Anything
 * malformed counts as no note at all — a half-parsed identity is worse than
 * none, and the sign-in screen is the correct answer when we truly don't know.
 */
export function rememberedUser(): CloudUser | undefined {
  try {
    const raw = localStorage.getItem(REMEMBERED_USER_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const { id, email } = parsed as { id?: unknown; email?: unknown }
    if (typeof id !== 'string' || !id) return undefined
    return { id, email: typeof email === 'string' ? email : undefined }
  } catch {
    return undefined
  }
}
