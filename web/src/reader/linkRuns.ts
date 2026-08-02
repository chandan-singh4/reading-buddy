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

import type { Paragraph, ParagraphLink } from '../structure/index.ts'

export interface Run {
  text: string
  /** Present when this run is a link. */
  link?: ParagraphLink
}

export function runsOf(block: Paragraph): Run[] {
  const links = (block.links ?? [])
    .filter((link) => link.start < link.end && link.start >= 0)
    .map((link) => ({ ...link, end: Math.min(link.end, block.text.length) }))
    .filter((link) => link.start < link.end)
    .sort((a, b) => a.start - b.start)

  if (links.length === 0) return [{ text: block.text }]

  const runs: Run[] = []
  let at = 0

  for (const link of links) {
    // Overlapping ranges are not something a well-formed document produces, but
    // dropping the second silently beats rendering two links over the same
    // words and letting the later one win by accident.
    if (link.start < at) continue

    if (link.start > at) runs.push({ text: block.text.slice(at, link.start) })
    runs.push({ text: block.text.slice(link.start, link.end), link })
    at = link.end
  }

  if (at < block.text.length) runs.push({ text: block.text.slice(at) })
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
      parts[parts.length - 1].push(run.link ? { text: piece, link: run.link } : { text: piece })
    }
  }

  return parts
}
