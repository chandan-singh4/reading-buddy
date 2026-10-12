/**
 * Which library the app is looking at: the cloud, or — only on a build with no
 * Supabase keys — the one in this browser.
 *
 * ## Why there is no choice any more
 *
 * Until 2026-10-12 the reader picked between the two in Settings. Then, on
 * 2026-09-23, Android Chrome cleared the browser's storage to free space and
 * took everything that lived only there. A library kept in the browser is a
 * library the browser may delete without asking, so the reader asked for it to
 * go. Everything the reader makes is now in the cloud (`sync/`), and the
 * browser holds only an offline copy that can be fetched again.
 *
 * The device library survives as the fallback for a build without Supabase
 * keys — a fork, a preview deploy, a fresh checkout — because a missing
 * environment variable should cost you the cloud, not the app. A reader on the
 * real deploy can no longer reach it.
 */

import { isCloudConfigured } from './cloud/client.ts'

export type Backend = 'local' | 'cloud'

/**
 * The backend, given whether the cloud exists on this build. Pure, and tested.
 *
 * The old stored choice (`rb.backend`) is ignored on purpose: a phone that was
 * once switched to "This device" must not stay there now that the switch is
 * gone and nothing on screen could move it back.
 */
export function resolveBackend(configured: boolean): Backend {
  return configured ? 'cloud' : 'local'
}

/**
 * The backend this page load is using.
 *
 * Read by `storage/index.ts` when it builds the repository, and by the screens
 * that only make sense with an account.
 */
export function activeBackend(): Backend {
  return resolveBackend(isCloudConfigured())
}
