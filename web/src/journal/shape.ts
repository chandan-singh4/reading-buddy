/**
 * Giving a spoken entry a shape (WP-62).
 *
 * The recogniser hands back a ribbon: no punctuation, no capitals, no breaks.
 * These three calls give it a form at three strengths — Tidy, Shape, Unpack —
 * and `decisions.md` settles what each is allowed to do.
 *
 * ## The raw words are never touched
 *
 * Nothing here writes to `raw`. A shape is a second copy, stored beside the
 * reader's own words, and the entry screen shows the two as an equal pair.
 * The reader can make a shape again or delete it; the ribbon stays either way.
 * That is the whole decision this module exists to keep.
 *
 * ## The call itself lives in `relay.ts`
 *
 * It was here until the Counsel arrived (WP-67) and a second caller needed the
 * same stream reader, the same failover rule and the same failure wording.
 * This module is now the three levels and what they mean; `relay.ts` is the
 * wire.
 */

import { askJournal, headingOf, withoutHeading } from './relay.ts'

/** The three strengths, weakest first. Also the ids the relay keys on. */
export type ShapeLevel = 'tidy' | 'shape' | 'unpack'

export const SHAPE_LEVELS: readonly ShapeLevel[] = ['tidy', 'shape', 'unpack']

/** What the button says, and what the entry screen calls the result. */
export const SHAPE_LABEL: Record<ShapeLevel, string> = {
  tidy: 'Tidy',
  shape: 'Shape',
  unpack: 'Unpack',
}

/** One line under each button, so the reader knows what they are choosing. */
export const SHAPE_BLURB: Record<ShapeLevel, string> = {
  tidy: 'Punctuation, paragraphs, and the grammar speaking breaks. Your words, your order.',
  shape: 'A title, and your ideas grouped into paragraphs.',
  unpack: 'Headings, anything you said you would do, and questions to sit with.',
}

export interface Shaping {
  text: string
  /** The model that actually answered, as the relay read it off the response. */
  model: string
  /** Lifted from a leading H1, when the level writes one. */
  title?: string
}

/**
 * Ask a free model for one shape of one entry.
 *
 * Rejects rather than returning a canned line. A journal is not the tutor's
 * lamp: there is no bubble that must always have something in it, and an
 * apology stored as the shape of an entry would be worse than no shape — the
 * reader would open it a month later and read it as something they wrote.
 */
export async function shapeEntry(level: ShapeLevel, raw: string): Promise<Shaping> {
  const shaped = await askJournal(level, raw, 'Give these words their shape.')
  const body = shaped.text

  /*
   * The title is lifted only when something is left after it. A reply that is
   * nothing but a heading is a model that misread the job, and taking its one
   * line away as a title would store an entry with no words in it.
   */
  const title = titleOf(body)
  const rest = title ? withoutHeading(body) : ''
  if (title && rest) return { text: rest, model: shaped.model, title }
  return { text: body, model: shaped.model }
}

/**
 * The entry's title, when the model opened with an H1.
 *
 * Tidy is told to write no title and the other two are told to write exactly
 * one, so an H1 is read rather than demanded: a level that writes none simply
 * has no title, and a model that disobeys costs the reader nothing.
 */
export function titleOf(text: string): string | undefined {
  return headingOf(text)
}
