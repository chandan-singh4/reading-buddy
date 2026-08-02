/**
 * Plain text → `ParsedBook`.
 *
 * Plain text carries no markup at all, so on paper this is just markdown's
 * heading-free fallback: split on blank lines, bucket into fixed-size sections.
 * That works, but it makes for a miserable book — one untitled slab you can't
 * navigate.
 *
 * So there is one conservative heuristic. Real `.txt` books (Project Gutenberg
 * being the canonical source) mark divisions the only way plain text can: a
 * short line, alone between blank lines, reading `CHAPTER IV` or `PART ONE` or
 * simply shouting in capitals. We treat *only* that shape as a heading.
 *
 * The bar is deliberately high, because the failure modes are asymmetric. A
 * missed heading costs you a chapter break; a false positive shatters a
 * paragraph of prose into fake chapters and permanently anchors it that way.
 * Every condition below exists to make false positives unlikely.
 */

import type { ParsedBook } from '../storage/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { assembleBook, type Block } from './assemble.ts'

/** Longer than this and it is a sentence, not a chapter title. */
const MAX_HEADING_LENGTH = 60

/**
 * The strongest signal of the two. "Chapter four was the one he remembered most
 * vividly of all." is 58 characters and ends in a single period, so length and
 * punctuation both wave it through — but no real chapter title runs to eleven
 * words. Counting words is what separates a heading from a sentence that merely
 * opens with the word "chapter".
 */
const MAX_HEADING_WORDS = 8

/** Words that open a division in virtually every English-language book. */
const DIVISION = /^(part|book)\b/i
const SUBDIVISION =
  /^(chapter|prologue|epilogue|introduction|preface|foreword|afterword|conclusion|appendix|interlude|canto)\b/i

/**
 * Shouted headings: letters, and every one of them upper-case. Requires at
 * least one letter so a row of `* * *` or `---` isn't promoted.
 */
function isShouted(line: string): boolean {
  return /[A-Za-z]/.test(line) && line === line.toUpperCase()
}

/**
 * Classify a paragraph as a heading, and at which level, or `null` for prose.
 *
 * `PART` outranks `CHAPTER` so that a book using both gets two real levels. A
 * book using only chapters resolves them to chapters anyway — the assembler
 * picks the shallowest level *present*, not a fixed number.
 */
function headingLevel(line: string): number | null {
  const text = line.trim()
  if (text.length === 0 || text.length > MAX_HEADING_LENGTH) return null
  if (text.split(/\s+/).length > MAX_HEADING_WORDS) return null

  // Sentence-ending punctuation means prose. A single trailing period is fine
  // ("CHAPTER I."), but punctuation followed by more text is not.
  if (/[.!?]\S*\s/.test(text) || /[,;:]$/.test(text)) return null

  if (DIVISION.test(text)) return 1
  if (SUBDIVISION.test(text)) return 2
  if (isShouted(text)) return 2
  return null
}

/**
 * Split text into paragraphs on blank lines, the universal convention. Single
 * newlines are soft wrapping and are joined back into flowing prose.
 */
export function txtToBlocks(raw: string): Block[] {
  // Non-breaking spaces are common in text exported from word processors, and
  // would otherwise survive the trims below and corrupt the length checks.
  const normalised = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ')

  const blocks: Block[] = []
  for (const chunk of normalised.split(/\n[ \t]*\n+/)) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue

    // A wrapped paragraph is prose by definition; headings occupy one line.
    const level = lines.length === 1 ? headingLevel(lines[0]) : null
    if (level !== null) {
      blocks.push({ kind: 'heading', level, text: lines[0].trim().replace(/\.$/, '') })
      continue
    }

    blocks.push({ kind: 'prose', text: lines.join(' ') })
  }

  return blocks
}

/** Parse plain text into the shared structure. */
export function parseTxt(raw: string, meta: BookMeta): ParsedBook {
  return assembleBook(txtToBlocks(raw), { ...meta, source: 'txt' })
}
