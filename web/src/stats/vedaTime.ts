/**
 * How much of a sitting was spent talking to Veda.
 *
 * ## Why this can be worked out at all
 *
 * Every message already carries the moment it was sent or arrived. Nothing new
 * is recorded — the conversation *is* the record, and this only reads it. So it
 * works on conversations the reader had months ago, before anyone thought to
 * measure them.
 *
 * ## What counts as time in a conversation
 *
 * The gap between one message and the next, when that gap is short. A question
 * at 9:04 and an answer at 9:05 is a minute in the conversation. A question at
 * 9:04 and the next one at 9:06 is two more, because the reader spent them
 * reading what Veda said.
 *
 * A long gap is not counted. A thread opened at nine and picked up again at
 * eleven did not hold the reader for two hours — it held them twice, and the
 * middle belongs to the book. `CHAT_GAP_MS` is where the line falls.
 *
 * ## What it is not
 *
 * It is not idle detection and it does not change any total. A sitting's
 * minutes stay exactly what they were; this says how many of them had Veda in
 * them. It is the first half of telling a long conversation apart from a phone
 * face-up on a table.
 */

import type { StoredTutorThread } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'

/**
 * Longer than this between two messages, and the reader had left the
 * conversation. Five minutes is long enough to read any answer Veda gives and
 * short enough that a thread reopened after supper starts a new stretch.
 */
export const CHAT_GAP_MS = 5 * 60_000

interface Span {
  from: number
  to: number
}

/** The stretches of a conversation, before they are merged with any other. */
function spansIn(thread: StoredTutorThread, from: number, to: number): Span[] {
  const at = thread.messages
    .map((message) => message.ts)
    .filter((ts) => ts >= from && ts <= to)
    .sort((a, b) => a - b)

  const spans: Span[] = []
  for (let i = 1; i < at.length; i += 1) {
    const gap = at[i] - at[i - 1]
    if (gap > 0 && gap <= CHAT_GAP_MS) spans.push({ from: at[i - 1], to: at[i] })
  }
  return spans
}

/**
 * Milliseconds of `[from, to]` that were spent in conversation about `bookId`.
 *
 * The stretches are merged before they are added up. Two threads can overlap —
 * the reader asks about one passage while Veda is still answering about another
 * — and a minute lived once must be counted once.
 */
export function vedaMsIn(
  threads: readonly StoredTutorThread[],
  bookId: BookId,
  from: number,
  to: number,
): number {
  const spans: Span[] = []
  for (const thread of threads) {
    if (thread.bookId !== bookId) continue
    spans.push(...spansIn(thread, from, to))
  }
  if (spans.length === 0) return 0

  spans.sort((a, b) => a.from - b.from)
  let total = 0
  let open = spans[0]
  for (const span of spans.slice(1)) {
    if (span.from <= open.to) {
      open = { from: open.from, to: Math.max(open.to, span.to) }
    } else {
      total += open.to - open.from
      open = span
    }
  }
  return total + (open.to - open.from)
}
