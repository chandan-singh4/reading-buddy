/**
 * A one-off repair of the evening of 2026-08-28. **Delete this file** once the
 * reader has opened the Statistics screen on their phone.
 *
 * ## What happened
 *
 * That evening was the first hour of reading ever recorded, and the reading
 * clock still lived inside the reading screen. A book has four screens on four
 * sibling routes, so opening the book details unmounted the reader and ended
 * the session — then coming back started another. The hour was therefore filed
 * as three visits: the real one, and two of a few seconds either side of a look
 * at the subject tags. `useReadingClock` is the fix, and it cannot reach
 * backwards.
 *
 * ## What this does
 *
 * On that one day: it drops any session under a minute, and copies the chapter
 * and section titles from a session that has them onto the one that does not.
 * The reader confirmed both facts — same book, same chapter, same section.
 *
 * It is a data edit, so it is narrow on purpose: one date, one condition, and a
 * flag so it runs once. It deletes rows, and a repair that can run twice is a
 * repair that can eat a genuine short session next week.
 */

import { db, type ReadingBuddyDB } from '../storage/db.ts'

const DAY = '2026-08-28'
const DONE = 'rb.repair.2026-08-28'
/** Below this, that evening, is router noise rather than reading. */
const NOISE_MS = 60_000

export async function repairFirstEvening(database: ReadingBuddyDB = db): Promise<void> {
  try {
    if (localStorage.getItem(DONE) !== null) return
  } catch {
    // A browser with storage blocked cannot remember that this ran, so it must
    // not run at all. Doing nothing is the safe answer for a repair.
    return
  }

  const rows = await database.sessions.where('day').equals(DAY).toArray()

  const known = rows.find((row) => row.chapterTitle !== undefined)
  const keep = rows.filter((row) => row.activeMs >= NOISE_MS)
  const drop = rows.filter((row) => row.activeMs < NOISE_MS)

  await database.sessions.bulkDelete(drop.map((row) => row.id))

  if (known !== undefined) {
    for (const row of keep) {
      if (row.chapterTitle !== undefined) continue
      await database.sessions.put({
        ...row,
        ...(known.chapterTitle ? { chapterTitle: known.chapterTitle } : {}),
        ...(known.sectionTitle ? { sectionTitle: known.sectionTitle } : {}),
      })
    }
  }

  localStorage.setItem(DONE, 'done')
}
