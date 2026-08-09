/**
 * Which library the app is looking at: the one on this device, or the one in
 * the cloud.
 *
 * ## Why this is a reload and not a React state change
 *
 * Thirty-odd modules import `repository` from `../storage` as a plain value,
 * and several of them cache what it returned — covers, shelf memory, library
 * memory, the reading position. Swapping the object underneath all of that at
 * runtime would leave one library's covers over another library's books, and
 * every cache would need its own invalidation path. Choosing at module load and
 * reloading the page costs about 300 ms and cannot be half-applied.
 *
 * ## Why nothing is ever moved or deleted here
 *
 * Switching is a change of *view*, not a migration. The books in IndexedDB stay
 * in IndexedDB whichever way this is set, so a reader who switches to the cloud,
 * finds it empty and switches back gets their library returned to them intact.
 * That property is the whole reason it is safe to offer the toggle at all
 * before there is any way to copy books between the two.
 */

import { isCloudConfigured } from './cloud/client.ts'

export type Backend = 'local' | 'cloud'

/** Where the choice is remembered. Namespaced because localStorage is global. */
export const BACKEND_KEY = 'rb.backend'

/**
 * The choice, given what was stored and whether the cloud exists on this build.
 *
 * Pure, and tested. The `configured` argument is what makes a build with no
 * Supabase keys — a fork, a preview deploy, a colleague's checkout — fall back
 * to the local library instead of showing a sign-in screen it can never
 * satisfy. A missing environment variable should cost you the cloud, not the
 * app.
 */
export function resolveBackend(stored: string | null | undefined, configured: boolean): Backend {
  if (stored === 'cloud' && configured) return 'cloud'
  return 'local'
}

function storedValue(): string | null {
  try {
    return localStorage.getItem(BACKEND_KEY)
  } catch {
    // Private mode, or storage disabled entirely. Local is the safe answer:
    // it is the one that needs no network and no account.
    return null
  }
}

/**
 * The backend this page load is using.
 *
 * Read once by `storage/index.ts` when it builds the repository, and again by
 * the settings screen to draw the toggle. Deliberately not memoised — it is two
 * string comparisons, and a stale copy of it is exactly the bug this file's
 * header is about.
 */
export function activeBackend(): Backend {
  return resolveBackend(storedValue(), isCloudConfigured())
}

/**
 * Remember a different choice and start again on it.
 *
 * Returns without reloading when nothing changed, so tapping the option you are
 * already on doesn't throw the screen away.
 */
export function chooseBackend(kind: Backend): void {
  if (kind === activeBackend()) return
  try {
    localStorage.setItem(BACKEND_KEY, kind)
  } catch {
    // Nothing useful to do: without storage the choice cannot outlive the
    // reload that would apply it, so refuse quietly rather than reload into
    // the same place and look broken.
    return
  }
  window.location.reload()
}
