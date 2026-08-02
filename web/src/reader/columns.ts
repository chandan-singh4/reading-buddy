/**
 * Turning a scroll into pages.
 *
 * The layout itself is CSS (`Reader.module.css`): the section is laid out in
 * columns exactly one screen wide, so the browser decides where the breaks fall
 * and a font change re-flows on its own. Nothing here measures text — that
 * decision is recorded in `backlog.md` under WP-14, and it is what makes page
 * breaks land cleanly between lines instead of through the middle of one.
 *
 * What *is* needed is arithmetic about the resulting strip: how many pages it
 * came out as, which one is showing, and where to scroll to reach another. That
 * arithmetic is here, pure and testable, because it is the part that goes
 * subtly wrong — off-by-one at the last page, a rounding error that makes page
 * 7 unreachable, a division by zero on an empty section.
 */

/** The measurements of a laid-out section. All in CSS pixels. */
export interface Strip {
  /** Total width of the content, across every column. */
  scrollWidth: number
  /** Width of one column — one page — including the gap after it. */
  pageWidth: number
  /** How far the strip is currently scrolled. */
  scrollLeft: number
}

/**
 * How many pages the section came out as.
 *
 * Rounding matters here and is deliberately asymmetric. `Math.round` would drop
 * a final column that is barely wider than the rounding threshold — a page of
 * real text that becomes unreachable. A small epsilon absorbs sub-pixel layout
 * noise (browsers report fractional widths) without swallowing a real column.
 */
export function pageCountOf(strip: Strip): number {
  if (strip.pageWidth <= 0) return 1
  return Math.max(1, Math.round(strip.scrollWidth / strip.pageWidth))
}

/** Which page is showing, 1-based. */
export function pageAt(strip: Strip): number {
  if (strip.pageWidth <= 0) return 1
  const page = Math.round(strip.scrollLeft / strip.pageWidth) + 1
  return clamp(page, 1, pageCountOf(strip))
}

/** How far to scroll to bring a page into view. */
export function offsetOfPage(strip: Strip, page: number): number {
  if (strip.pageWidth <= 0) return 0
  return (clamp(page, 1, pageCountOf(strip)) - 1) * strip.pageWidth
}

/**
 * Where a page turn lands, or `null` when it would fall off the end.
 *
 * `null` rather than a clamped page on purpose: the caller has to be able to
 * tell "you are already on the last page" from "you moved", because the first
 * means *load the next section* and the second does not.
 */
export function turn(strip: Strip, by: 1 | -1): number | null {
  const next = pageAt(strip) + by
  if (next < 1 || next > pageCountOf(strip)) return null
  return next
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
