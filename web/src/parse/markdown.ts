/**
 * Markdown → `ParsedBook`.
 *
 * This file does one job: turn markdown into a flat `Block` stream. Everything
 * after that — resolving which heading levels mean chapter and section, the
 * heading-free fallback, anchoring — lives in `assemble.ts` and is shared with
 * every other format.
 *
 * The scan is line-oriented and greedy: when a line opens a multi-line
 * construct (a fence, a quote, a list, a table, a display formula), we consume
 * every line that belongs to it and emit **one** block. That is the WP-38 rule —
 * a table is one anchored thing, not one per row.
 *
 * Scope: ATX headings (`#`) only. Setext underlines (`===` / `---`) are rare in
 * exported books and are left as prose rather than guessed at.
 */

import type { ParsedBook } from '../storage/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { assembleBook, type Block } from './assemble.ts'

const ATX_HEADING = /^(#{1,6})[ \t]+(.*)$/
const FENCE = /^\s*(```|~~~)/
const QUOTE = /^\s{0,3}>\s?/
const BULLET = /^\s{0,3}([-*+]|\d{1,9}[.)])\s+/
const TABLE_ROW = /^\s{0,3}\|.*\|\s*$/
/** A `|---|:--:|` separator is what distinguishes a table from stacked prose. */
const TABLE_DIVIDER = /^\s{0,3}\|[\s:|-]+\|\s*$/
const DISPLAY_MATH = /^\s{0,3}\$\$/
/** `![alt](src)` alone on a line — a figure rather than an inline decoration. */
const IMAGE_ONLY = /^\s{0,3}!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/
/** `[^1]: the note text` — a footnote definition. */
const FOOTNOTE = /^\s{0,3}\[\^([^\]]+)\]:\s*(.*)$/

function isBlank(line: string): boolean {
  return line.trim() === ''
}

/**
 * Flatten raw markdown into blocks. Fenced code is tracked so that a `#`
 * comment inside a code sample can't masquerade as a chapter break — a real
 * hazard in technical books.
 */
export function markdownToBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []

  let paragraph: string[] = []

  /** Emit the prose accumulated so far. Soft-wrapped lines join into one. */
  function flushParagraph(): void {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ kind: 'prose', text })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]

    if (isBlank(line)) {
      flushParagraph()
      continue
    }

    // --- Fenced code ---------------------------------------------------
    const fence = FENCE.exec(line)
    if (fence) {
      flushParagraph()
      const marker = fence[1]
      const info = line.trim().slice(marker.length).trim()
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        body.push(lines[i])
        i += 1
      }
      // An unterminated fence still holds real content — keep it.
      const block: Block = { kind: 'code', text: body.join('\n').replace(/\s+$/, '') }
      if (info) block.label = info
      if (block.text) blocks.push(block)
      continue
    }

    // --- Headings ------------------------------------------------------
    const heading = ATX_HEADING.exec(line)
    if (heading) {
      flushParagraph()
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        // Trailing `###` is decorative in closed-ATX style; the title isn't.
        text: heading[2].replace(/\s+#+\s*$/, '').trim(),
      })
      continue
    }

    // --- Display math --------------------------------------------------
    if (DISPLAY_MATH.test(line)) {
      flushParagraph()
      const body: string[] = []
      const opener = line.trim().slice(2)
      if (opener.endsWith('$$') && opener.length > 2) {
        // Single-line `$$ x + y $$`.
        blocks.push({ kind: 'formula', text: opener.slice(0, -2).trim() })
        continue
      }
      if (opener) body.push(opener)
      i += 1
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        body.push(lines[i])
        i += 1
      }
      if (i < lines.length) {
        const closing = lines[i].trim().replace(/\$\$$/, '').trim()
        if (closing) body.push(closing)
      }
      const text = body.join('\n').trim()
      if (text) blocks.push({ kind: 'formula', text })
      continue
    }

    // --- Footnote definitions -------------------------------------------
    const footnote = FOOTNOTE.exec(line)
    if (footnote) {
      flushParagraph()
      const body = [footnote[2]]
      // Continuation lines of a footnote are indented.
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
        i += 1
        body.push(lines[i].trim())
      }
      blocks.push({
        kind: 'note',
        text: body.join(' ').trim(),
        label: `footnote ${footnote[1]}`,
      })
      continue
    }

    // --- Tables ----------------------------------------------------------
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      flushParagraph()
      const rows: string[][] = []
      const readRow = (text: string): string[] =>
        text
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim())

      rows.push(readRow(line))
      i += 2 // skip the divider
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(readRow(lines[i]))
        i += 1
      }
      i -= 1 // the outer loop re-increments

      blocks.push({
        kind: 'table',
        text: rows.map((cells) => cells.join(' | ')).join('\n'),
        rows,
      })
      continue
    }

    // --- Standalone images -----------------------------------------------
    const image = IMAGE_ONLY.exec(line)
    if (image) {
      flushParagraph()
      const alt = image[1].trim()
      blocks.push({
        kind: 'figure',
        text: alt ? `[Figure: ${alt}]` : '[Figure]',
        image: alt ? { src: image[2], alt } : { src: image[2] },
      })
      continue
    }

    // --- Block quotes ------------------------------------------------------
    if (QUOTE.test(line)) {
      flushParagraph()
      const body: string[] = []
      while (i < lines.length && (QUOTE.test(lines[i]) || (!isBlank(lines[i]) && body.length > 0))) {
        body.push(lines[i].replace(QUOTE, '').trim())
        i += 1
      }
      i -= 1
      const text = body.join(' ').replace(/\s+/g, ' ').trim()
      if (text) blocks.push({ kind: 'quote', text })
      continue
    }

    // --- Lists -------------------------------------------------------------
    if (BULLET.test(line)) {
      flushParagraph()
      const items: string[] = []
      const ordered = /^\s{0,3}\d/.test(line)
      while (i < lines.length && !isBlank(lines[i])) {
        if (BULLET.test(lines[i])) {
          items.push(lines[i].replace(BULLET, '').trim())
        } else if (items.length > 0) {
          // A wrapped continuation of the previous item.
          items[items.length - 1] += ` ${lines[i].trim()}`
        }
        i += 1
      }
      i -= 1
      blocks.push({
        kind: 'list',
        text: items
          .map((item, index) => (ordered ? `${index + 1}. ${item}` : `• ${item}`))
          .join('\n'),
        label: ordered ? 'ordered' : 'unordered',
      })
      continue
    }

    paragraph.push(line.trim())
  }

  flushParagraph()
  return blocks
}

/** Parse raw markdown into the shared structure. */
export function parseMarkdown(raw: string, meta: BookMeta): ParsedBook {
  return assembleBook(markdownToBlocks(raw), meta)
}
