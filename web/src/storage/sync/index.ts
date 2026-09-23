/**
 * The app's one sync, and the moments it runs.
 *
 * Only on the cloud backend: a reader on the device library chose to keep
 * everything on the device, and there is no account to sync to.
 */

import { activeBackend } from '../backend.ts'
import { isCloudConfigured, onAuthChange } from '../cloud/client.ts'
import { db } from '../db.ts'
import { supabaseRemote } from './remote.ts'
import { createSync, createSyncDb, type Sync } from './sync.ts'

export { SYNCED_TABLES, createSync, createSyncDb } from './sync.ts'
export type { CloudRow, OutgoingRow, Sync, SyncRemote, SyncResult } from './sync.ts'

/** Pull again this often while the app is open and in view. */
const EVERY_MS = 5 * 60 * 1000

/**
 * How long the first screen waits for a restore. Long enough for a real
 * library on a phone signal; short enough that a dead network doesn't hold the
 * app closed — the rows still arrive, a screen later.
 */
const RESTORE_WAIT_MS = 10_000

let sync: Sync | undefined

/**
 * Start syncing. Resolves once the device has its rows back, when it had none.
 *
 * `main.tsx` awaits this before the first render. On a device that already
 * holds the reader's rows it resolves at once and the sync runs behind the
 * app. On an emptied device — Chrome cleared it, a new phone — the screens read
 * their tables once when they open and never look again, so they have to wait
 * for the restore or they would draw the empty library this exists to prevent.
 */
export async function startSync(): Promise<void> {
  if (sync || activeBackend() !== 'cloud' || !isCloudConfigured()) return
  const started = createSync({ local: db, queue: createSyncDb(), remote: supabaseRemote })
  sync = started

  const quietly = (work: () => Promise<unknown>) => void work().catch(() => {})

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => quietly(() => started.run()))
    document.addEventListener('visibilitychange', () => {
      // Hidden is the last moment the page is sure to be alive: a phone app
      // swiped away may never run another line. Send what is waiting now.
      if (document.visibilityState === 'hidden') quietly(() => started.push())
      else quietly(() => started.run())
    })
    setInterval(() => {
      if (document.visibilityState === 'visible') quietly(() => started.run())
    }, EVERY_MS)
  }
  // A sign-in on this device is the first moment the cloud will answer.
  onAuthChange((user) => {
    if (user) quietly(() => started.run())
  })

  const first = started.run()
  let empty = false
  try {
    empty = await started.isEmpty()
  } catch {
    // Storage unreadable: nothing to wait for that would help.
  }
  if (!empty) {
    first.catch(() => {})
    return
  }
  await Promise.race([
    first.catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, RESTORE_WAIT_MS)),
  ])
}

/**
 * Ask the browser not to clear this origin when the device runs short.
 *
 * Without it every byte here is "best effort", which Chrome is free to delete
 * under storage pressure with no prompt — the exact loss of 2026-09-23. Chrome
 * grants it silently to an installed app; Safari decides on its own. A refusal
 * costs nothing: the sync above is what makes a cleared device recoverable,
 * and this only makes it less likely to be needed.
 */
export async function askToKeepStorage(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
    if (await navigator.storage.persisted()) return
    await navigator.storage.persist()
  } catch {
    // See above.
  }
}
