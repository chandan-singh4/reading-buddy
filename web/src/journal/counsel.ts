/**
 * A considered opinion on an entry (WP-67).
 *
 * ## One role, not a shelf of specialists
 *
 * The reader asked for a professional opinion and then asked for the role to
 * be all-round rather than a niche. Both of those are the same answer, because
 * there is no specialist model to call: the specialisation is the prompt. A
 * shelf of named lenses would be one model wearing hats, and would make the
 * reader pick a frame before they know which frame fits.
 *
 * So the model picks, and then says which it picked. That is the whole honesty
 * of the feature. The frame *is* the opinion — a dream read as a decision and
 * read as an image give two different answers — and a reader who is not told
 * the frame cannot weigh what sits inside it.
 *
 * ## The angle is the first line
 *
 * The prompt asks for an H1, and it is lifted exactly as `shape.ts` lifts a
 * title: read, never demanded. A model that writes none leaves the reading
 * with no angle, which costs the reader nothing.
 *
 * ## It reads the reader's own words
 *
 * `raw`, never `shaped`. An opinion on a model's rewrite of what the reader
 * said is an opinion on the wrong text, and the reader would have no way to
 * know which one it read.
 */

import { askJournal, headingOf, withoutHeading } from './relay.ts'

export interface Counselling {
  /** How the model chose to read the entry. Absent if it wrote no H1. */
  angle?: string
  /** The reading itself, as markdown, with the angle line taken off. */
  text: string
  /** The model that actually answered, as the relay read it off the response. */
  model: string
}

/** What the reader presses, and what the screen calls the result. */
export const COUNSEL_LABEL = 'Read it back to me'

/** One line under the button, so the reader knows what they are asking for. */
export const COUNSEL_BLURB =
  'A free model reads your words, says how it is reading them, and gives one opinion. It is not advice from a professional.'

/**
 * Ask for one reading of one entry.
 *
 * Rejects rather than returning a canned line, for the reason `shapeEntry`
 * does: an apology stored as an opinion on an entry is worse than no opinion.
 */
export async function askCounsel(raw: string): Promise<Counselling> {
  const read = await askJournal('counsel', raw, 'Read this entry back to me.')
  const body = read.text

  /*
   * The angle is taken only when something is left after it. A reply that is
   * nothing but a heading is a model that misread the job, and taking its one
   * line away would store a reading with nothing in it.
   */
  const angle = headingOf(body)
  const rest = angle ? withoutHeading(body) : ''
  if (angle && rest) return { angle, text: rest, model: read.model }
  return { text: body, model: read.model }
}
