/**
 * Cutting a paragraph into the pieces a renderer can draw: plain text, link,
 * plain text, link, plain text.
 *
 * Pure and separate because the edge cases are all arithmetic, and every one of
 * them shows up as underlining the wrong words — a link that appears to cover
 * the rest of the sentence, or one that swallows a neighbour. Offsets come from
 * the parser, but a book may have been imported by an older build, so nothing
 * here trusts them to be sane.
 */

import type { Paragraph, ParagraphLink, ParagraphMark } from '../structure/index.ts'

export interface Run {
  text: string
  /** Present when this run is a link. */
  link?: ParagraphLink
  /** Present when the source set this run apart — italic, bold, small caps. */
  mark?: ParagraphMark
}

/**
 * Drop ranges that cannot be drawn, and pull the rest inside the text.
 *
 * Offsets come from the parser, but a book may have been imported by an older
 * build, so nothing here trusts them. A range that starts past the end of the
 * string, or ends before it starts, is discarded rather than clamped into
 * something that would silently mark the wrong words.
 */
function usable<T extends { start: number; end: number }>(
  ranges: readonly T[] | undefined,
  length: number,
): T[] {
  const sane = (ranges ?? [])
    .filter((range) => range.start >= 0 && range.start < range.end)
    .map((range) => ({ ...range, end: Math.min(range.end, length) }))
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start)

  // Within one set, overlap is malformed and the earlier range wins. Two links
  // over the same words is not something a well-formed document produces, and
  // dropping the second beats drawing both and letting the later one decide by
  // accident. Marks are checked the same way; the parser emits them already
  // disjoint, but a book imported by an older build has made no such promise.
  const kept: T[] = []
  for (const range of sane) {
    const last = kept.at(-1)
    if (last && range.start < last.end) continue
    kept.push(range)
  }
  return kept
}

/**
 * Cut a paragraph at every boundary either a link or a mark introduces.
 *
 * Links and marks are independent range sets over the same string and they
 * overlap freely — a footnote marker inside an italic phrase is ordinary. So
 * the text is cut at the union of all their edges, and each resulting piece
 * asks which link and which mark contain it. Walking one set and then the other
 * cannot express a piece that is both.
 */
export function runsOf(block: Paragraph): Run[] {
  const length = block.text.length
  const links = usable(block.links, length)
  const marks = usable(block.marks, length)

  if (links.length === 0 && marks.length === 0) return [{ text: block.text }]

  const edges = new Set<number>([0, length])
  for (const range of [...links, ...marks]) {
    edges.add(range.start)
    edges.add(range.end)
  }

  const runs: Run[] = []
  const points = [...edges].sort((a, b) => a - b)

  for (const [index, start] of points.entries()) {
    const end = points[index + 1]
    if (end === undefined || start >= end) continue

    const run: Run = { text: block.text.slice(start, end) }
    const link = links.find((range) => range.start <= start && range.end >= end)
    const mark = marks.find((range) => range.start <= start && range.end >= end)
    if (link) run.link = link
    if (mark) run.mark = mark
    runs.push(run)
  }

  return runs
}

/**
 * The same runs, cut into lines.
 *
 * A list is stored as one block with one item per line — that decision lives in
 * the parser and this is the renderer's half of it. A link never spans a line
 * break, so cutting the runs at each newline is all it takes to hand every item
 * its own links.
 */
export function lineRunsOf(block: Paragraph): Run[][] {
  return cutRuns(runsOf(block), '\n').filter((line) => line.length > 0)
}

/**
 * The separator a table's cells are joined by in its flattened text. Must match
 * `CELL_SEPARATOR` in `parse/html.ts` exactly — that side writes the string,
 * this side cuts it back apart.
 */
const CELL_SEPARATOR = ' | '

/**
 * A table's runs, cut back into rows and cells — so a contents page laid out as
 * a table gets tappable chapters rather than a grid of dead words.
 *
 * The parser stores a table as one block whose text is rows joined by newlines
 * and cells joined by `" | "`, so undoing exactly those two joins recovers the
 * grid with every link still sitting on its own words. A link never spans a
 * cell, which is what makes cutting rather than re-parsing correct.
 */
export function cellRunsOf(block: Paragraph): Run[][][] {
  return cutRuns(runsOf(block), '\n')
    .map((row) => cutRuns(row, CELL_SEPARATOR))
    .filter((row) => row.some((cell) => cell.length > 0))
}

/**
 * Split a line of runs wherever a separator appears, keeping each piece's link.
 *
 * Blank pieces are dropped rather than kept as empty runs: a separator at the
 * very start or end of a piece would otherwise produce a run of no characters,
 * which renders as nothing and counts as something.
 */
function cutRuns(runs: readonly Run[], separator: string): Run[][] {
  const parts: Run[][] = [[]]

  for (const run of runs) {
    const pieces = run.text.split(separator)
    for (const [index, piece] of pieces.entries()) {
      if (index > 0) parts.push([])
      if (piece === '') continue
      const part: Run = { text: piece }
      if (run.link) part.link = run.link
      if (run.mark) part.mark = run.mark
      parts[parts.length - 1].push(part)
    }
  }

  return parts
}
