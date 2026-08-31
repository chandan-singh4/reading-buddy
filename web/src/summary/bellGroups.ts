import type { StoredAlert } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'

/**
 * The waiting questions for one book, gathered into a single line.
 *
 * A shelf of half-read books used to raise one line per chapter, so a reader
 * with four books and three finished chapters in each met twelve near-identical
 * rows and had to say yes twelve times. A book is the unit a reader thinks in.
 * The chapters are still there — they open underneath.
 */
export interface BookGroup {
  bookId: BookId
  bookTitle: string
  /** Ascending, so the picker reads in the order the book does. */
  chapters: StoredAlert[]
  /** The newest question in the group. Orders the panel. */
  at: string
}

/** The `ready` lines, untouched and still one to a chapter. */
export function readyAlerts(alerts: readonly StoredAlert[]): StoredAlert[] {
  return alerts.filter((alert) => alert.kind === 'ready')
}

/**
 * The yeses that are still waiting on a model, gathered by book.
 *
 * Grouped the same way the questions are, and for the same reason: a reader who
 * approved a whole book wants one line saying so, not eleven. They are not
 * mixed in with the questions, because these two need opposite things from the
 * reader — a question wants an answer, and this wants to be left alone.
 */
export function groupPending(alerts: readonly StoredAlert[]): BookGroup[] {
  return groupBy(alerts, 'pending')
}

/**
 * Group the `approval` lines by book, newest book first.
 *
 * `ready` lines are deliberately left out. They are news about one chapter and
 * they link to one chapter; gathering them would only put a step between the
 * reader and a summary that is already paid for and waiting.
 */
export function groupApprovals(alerts: readonly StoredAlert[]): BookGroup[] {
  return groupBy(alerts, 'approval')
}

function groupBy(alerts: readonly StoredAlert[], kind: StoredAlert['kind']): BookGroup[] {
  const byBook = new Map<BookId, BookGroup>()

  for (const alert of alerts) {
    if (alert.kind !== kind) continue
    const group = byBook.get(alert.bookId)
    if (group) {
      group.chapters.push(alert)
      if (alert.at > group.at) group.at = alert.at
    } else {
      byBook.set(alert.bookId, {
        bookId: alert.bookId,
        bookTitle: alert.bookTitle,
        chapters: [alert],
        at: alert.at,
      })
    }
  }

  const groups = [...byBook.values()]
  for (const group of groups) group.chapters.sort((a, b) => a.chapter - b.chapter)
  return groups.sort((a, b) => b.at.localeCompare(a.at))
}
