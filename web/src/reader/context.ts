/**
 * Where a passage sits in its book — the frame the tutor is given around it.
 *
 * ## Why this exists
 *
 * The relay used to be handed two things: the words the reader selected, and
 * the anchor id they came from. `[ch02-s03-p013]` means something to this app
 * and nothing at all to a model, so "explain this" arrived with no book, no
 * author, no chapter, and no sentence either side. A model with a passage and
 * no frame does the only thing it can: it recognises the subject and answers
 * from what it already knows about the world. That is how a tutor asked about
 * one sentence ends up volunteering a fact from the end of the book.
 *
 * So the frame is built here and sent with every question: the title, the
 * author, the chapter and section the reader is in, and the text immediately
 * before and after the selection.
 *
 * ## Neighbours are context, never subject
 *
 * The neighbours exist so the model can resolve a pronoun, a "this", or a name
 * introduced one sentence earlier. They are not the thing to explain, and the
 * prompt in `api/tutor.ts` says so in those words. They are also capped: a long
 * neighbour must not push the selection itself out of the model's attention.
 *
 * ## Why it is a separate module
 *
 * `Reader.tsx` has the book, the manifest and the live section in hand, so it
 * could assemble this inline. But picking the sentence before a selection is a
 * judgment with edge cases — the first sentence of a paragraph, a selection the
 * parser stored with different whitespace, a figure caption sitting between two
 * prose blocks — and judgments need tests.
 */

import type { BookMeta, Manifest, Paragraph, Section } from '../structure/index.ts'
import type { PassageAnchor } from './tutor.ts'

/** The frame around a passage, as the relay receives it. */
export interface PassageContext {
  title: string
  author?: string
  /** The chapter's title, from the manifest — not its number. */
  chapter?: string
  /** The section's title, when the book gives its sections titles. */
  section?: string
  /** The text immediately before the selection. Context only. */
  before?: string
  /** The text immediately after it. Context only. */
  after?: string
}

/**
 * How much neighbouring text is worth sending, per side.
 *
 * One long paragraph, roughly. Past this the neighbour stops being a frame and
 * starts competing with the passage for the model's attention — and the reader
 * asked about the passage.
 */
const NEIGHBOUR_MAX = 600

/** Blocks whose flattened text reads as noise beside a sentence of prose. */
const SKIP = new Set(['figure', 'table', 'furniture'])

/**
 * A block of prose, split into sentences.
 *
 * Deliberately crude. It splits after `.`, `!`, `?` or `…` followed by a space,
 * which mis-handles "Dr. Jung" and every other abbreviation. That is an
 * acceptable price: the worst outcome is a neighbour one clause too short or
 * too long, and the alternative is a list of abbreviations that is wrong for
 * every book that is not English prose.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…]["'”’)\]]?)\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Trimmed to the cap, from the end for `before` and the start for `after`. */
function cap(text: string, fromEnd: boolean): string {
  const clean = text.trim()
  if (clean.length <= NEIGHBOUR_MAX) return clean
  return fromEnd ? `…${clean.slice(-NEIGHBOUR_MAX)}` : `${clean.slice(0, NEIGHBOUR_MAX)}…`
}

/** The nearest usable block on one side of `index`, or nothing. */
function beside(paragraphs: readonly Paragraph[], index: number, step: -1 | 1): string | undefined {
  for (let at = index + step; at >= 0 && at < paragraphs.length; at += step) {
    const block = paragraphs[at]
    if (SKIP.has(block.kind)) continue
    const text = block.text.trim()
    if (text) return text
  }
  return undefined
}

/**
 * The text either side of the selection.
 *
 * A tapped **paragraph** takes the paragraphs before and after it. A tapped
 * **sentence** takes the sentences either side of it *within* its own
 * paragraph, and falls back to the neighbouring paragraph when it is the first
 * or last sentence there — which is the common case for a short paragraph.
 *
 * A tapped **figure** is treated as a paragraph, and that is the whole of the
 * difference. Its own "text" is the parser's placeholder — `[Figure: …]` — so
 * there are no sentences in it to sit between, and the prose either side of a
 * plate is what explains it. A figure's caption travels as the excerpt.
 */
export function neighboursOf(
  paragraphs: readonly Paragraph[],
  passage: PassageAnchor,
): { before?: string; after?: string } {
  const index = paragraphs.findIndex((block) => block.anchor === passage.anchor)
  if (index < 0) return {}

  const previous = beside(paragraphs, index, -1)
  const next = beside(paragraphs, index, 1)

  if (passage.kind === 'paragraph' || passage.kind === 'figure') {
    return {
      ...(previous ? { before: cap(previous, true) } : {}),
      ...(next ? { after: cap(next, false) } : {}),
    }
  }

  const whole = paragraphs[index].text
  const parts = sentences(whole)
  const at = parts.findIndex((part) => part.includes(passage.excerpt.trim()))

  // The selection did not survive the round trip as an exact substring — the
  // reader crossed a paragraph edge, or the renderer normalised a space. The
  // whole paragraph is then the honest answer for "before", because that is
  // what the selection sits inside.
  if (at < 0) {
    return {
      ...(whole.trim() ? { before: cap(whole, true) } : previous ? { before: cap(previous, true) } : {}),
      ...(next ? { after: cap(next, false) } : {}),
    }
  }

  const before = at > 0 ? parts.slice(0, at).join(' ') : previous
  const after = at < parts.length - 1 ? parts.slice(at + 1).join(' ') : next

  return {
    ...(before ? { before: cap(before, true) } : {}),
    ...(after ? { after: cap(after, false) } : {}),
  }
}

/**
 * The whole frame: book, place in it, and the text either side.
 *
 * `section` may be missing — the lamp can be reopened from Notes while the
 * reader is somewhere else entirely in the book. The title and author still
 * go, because they are still true; the neighbours are simply left out rather
 * than guessed at from the wrong page.
 */
export function passageContext(
  book: BookMeta,
  manifest: Manifest,
  section: Section | undefined,
  passage: PassageAnchor,
): PassageContext {
  const chapter = section
    ? manifest.chapters.find((entry) => entry.chapter === section.chapter)?.title
    : undefined

  return {
    title: book.title,
    ...(book.author ? { author: book.author } : {}),
    ...(chapter ? { chapter } : {}),
    ...(section?.title ? { section: section.title } : {}),
    ...(section ? neighboursOf(section.paragraphs, passage) : {}),
  }
}
