/**
 * The one place the Stats screen touches storage.
 *
 * Kept apart from `gather.ts` so the arithmetic stays pure and testable, and so
 * the screen has a single `await` rather than five.
 *
 * The books come from `repository` — the reader's library, which may be in the
 * cloud. Everything else comes from a device-local store, because sessions,
 * threads, summaries and the concept vocabulary all live on the device (see the
 * headers on `stats/sessions.ts` and `storage/notes.ts`). That mixture is
 * deliberate and it is the reason a reader who switches to a second device sees
 * their whole shelf and none of their history.
 */

import { repository } from '../storage/index.ts'
import { noteStore } from '../storage/notes.ts'
import { tutorStore } from '../storage/tutor.ts'
import { conceptStore, summaryStore } from '../storage/summaries.ts'
import { repairFirstEvening } from './repair.ts'
import { sessionStore } from './sessions.ts'
import type { StatsSources } from './gather.ts'

export async function loadStats(): Promise<StatsSources> {
  // A one-off, and temporary. See the header of `repair.ts` — that file and
  // this line both come out once the reader has seen the screen.
  await repairFirstEvening()

  const [books, sessions, threads, summaries, notes, concepts] = await Promise.all([
    repository.listBooks(),
    sessionStore.all(),
    tutorStore.allThreads(),
    summaryStore.all(),
    noteStore.allNotes(),
    conceptStore.rows(),
  ])

  return { books, sessions, threads, summaries, notes, concepts }
}
