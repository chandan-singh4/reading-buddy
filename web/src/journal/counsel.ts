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
 *
 * ## The reader can steer one reading (WP-68)
 *
 * The angle stays automatic by default, because most of the time the reader
 * does not know what they are looking for — that is why they are writing. But
 * on the entry where they do know, a second reading can be asked for from an
 * angle they name.
 *
 * It rides in the one user message and nowhere else. Nothing about it is
 * stored: not on the entry, not in settings, not in the sync. A stored angle
 * is the fixed lens list this feature exists to avoid, arrived at by accident.
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

/** The most a steer may be. One line of steering, not a second entry. */
export const ANGLE_LIMIT = 200

/** The optional line beside "Read it again" (WP-68). */
export const ANGLE_LABEL = 'Read it from a particular angle'

/** Said beside the field, because an angle that looked stored would mislead. */
export const ANGLE_HINT = 'This reading only. Nothing is saved.'

/** One line under the button, so the reader knows what they are asking for. */
export const COUNSEL_BLURB =
  'A free model reads your words, says how it is reading them, and gives one opinion. It is not advice from a professional.'

/**
 * Ask for one reading of one entry.
 *
 * Rejects rather than returning a canned line, for the reason `shapeEntry`
 * does: an apology stored as an opinion on an entry is worse than no opinion.
 */
export async function askCounsel(raw: string, angle?: string): Promise<Counselling> {
  const read = await askJournal('counsel', raw, request(angle))
  const body = read.text

  /*
   * The angle is taken only when something is left after it. A reply that is
   * nothing but a heading is a model that misread the job, and taking its one
   * line away would store a reading with nothing in it.
   */
  const chose = headingOf(body)
  const rest = chose ? withoutHeading(body) : ''
  if (chose && rest) return { angle: chose, text: rest, model: read.model }
  return { text: body, model: read.model }
}

/**
 * The one message the model is sent, with the reader's angle in it or without.
 *
 * The angle is a steer, not a command: the model still names the frame it
 * read from, and it still says so when the angle does not fit the entry. An
 * angle that could overrule the guard rails would be a way to ask the Counsel
 * for a diagnosis by the back door.
 */
function request(angle?: string): string {
  const steer = angle?.trim().slice(0, ANGLE_LIMIT).trim()
  if (!steer) return 'Read this entry back to me.'
  return [
    'Read this entry back to me.',
    '',
    `For this reading only, I am asking you to read it from this angle: ${steer}`,
    '',
    'Read it from that angle where the entry supports it. Still say in your H1 how you are reading the entry. Where the angle does not fit what I actually wrote, say so plainly in one clause and read the entry the way it asks to be read. Every one of your rules still holds, and the angle does not change any of them.',
  ].join('\n')
}
