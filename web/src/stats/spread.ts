/**
 * Where a sitting's minutes fall on the clock.
 *
 * ## The rule
 *
 * A sitting that runs from 11:41 pm to 12:25 am is 19 minutes of one day and 25
 * of the next. Counting all 44 against the day it began is what made a reader
 * who read past midnight see nothing at all on the new day. Every *quantity* of
 * minutes on this screen — the heatmap, the streak, the period total, the goal,
 * the chart, the hours of the day — is therefore measured against the clock,
 * not against the row's start.
 *
 * ## What is not split
 *
 * The commit log. A sitting is one sitting, filed under the day it began, the
 * way a commit keeps its author date. The log lists events; everything else
 * counts minutes. See `docs/decisions.md`.
 *
 * ## Why it is a proportion
 *
 * A session records how long it ran and how much of that was reading, but never
 * *which* minutes inside it were. So its reading time is spread evenly across
 * the span it covers. That is an assumption, and the honest one — and because
 * it is a proportion of the whole span, the parts always add back up to the
 * session.
 */

export interface Span {
  /** Epoch milliseconds. */
  startedAt: number
  endedAt: number
  /** Milliseconds of reading inside that span. */
  activeMs: number
}

/** Reading milliseconds that fall inside `[from, to)`. */
export function msInWindow(session: Span, from: number, to: number): number {
  if (session.activeMs <= 0) return 0

  // A zero-length or backwards span still happened; treat it as one instant, so
  // the row lands somewhere rather than vanishing.
  const end = Math.max(session.endedAt, session.startedAt + 1)
  const span = end - session.startedAt

  const overlap = Math.min(end, to) - Math.max(session.startedAt, from)
  if (overlap <= 0) return 0

  return session.activeMs * (overlap / span)
}
