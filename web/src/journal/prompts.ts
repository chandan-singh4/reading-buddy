/**
 * The question on the journal half of the front door (WP-65).
 *
 * A blank page is a wall; a question is a door. This is the smallest thing that
 * turns "write something" into something answerable, and it is why the journal
 * half has a heading at all.
 *
 * ## Why it is a function of the clock and the date, and stores nothing
 *
 * No state, no history of questions already asked, no "seen" flag. Two reasons.
 * A stored rota is a second copy of a fact the calendar already holds, and it
 * would have to be carried into the backup for no gain. And a question that
 * changed every time the screen repainted would be a question the reader could
 * not finish reading — the hour and the date hold it still for as long as they
 * are looking at it.
 *
 * The question is never saved with the entry. It is a nudge, not content: the
 * raw words are the reader's and they stand alone (`decisions.md`, 2026-10-18).
 */

/** What the front door prints: a quiet label, and the question itself. */
export interface Nudge {
  /** `Evening prompt` — the band of the day, for the small caps line. */
  label: string
  question: string
}

/**
 * Four bands rather than three, because the late hours are their own thing.
 *
 * A question at 23:30 that asks what the reader plans to do tomorrow is a
 * question that keeps them up. The late band asks them to put the day down.
 */
const BANDS: { from: number; label: string; questions: string[] }[] = [
  {
    from: 22,
    label: 'Late',
    questions: [
      'What can you put down before you sleep?',
      'What is still turning over?',
      'What was the quietest part of today?',
      'What would you like to wake up having let go of?',
    ],
  },
  {
    from: 18,
    label: 'Evening prompt',
    questions: [
      'What stood out to you today?',
      'What did you read that you want to keep?',
      'Where did your attention go today?',
      'What did today teach you, if anything?',
    ],
  },
  {
    from: 12,
    label: 'Afternoon prompt',
    questions: [
      'How is the day going so far?',
      'What has taken most of your thought today?',
      'What small thing went well?',
      'What are you avoiding?',
    ],
  },
  {
    from: 0,
    label: 'Morning prompt',
    questions: [
      'What are you carrying into today?',
      'What did you dream?',
      'What is the one thing worth doing today?',
      'How did you wake up feeling?',
    ],
  },
]

/** The question for this hour, on this date. */
export function nudgeFor(now: Date): Nudge {
  const band = BANDS.find((candidate) => now.getHours() >= candidate.from) ?? BANDS[BANDS.length - 1]!
  // The date, so the question holds for a whole day and then moves on. The day
  // of the month is enough: the reader never sees two days at once.
  const pick = band.questions[now.getDate() % band.questions.length]!
  return { label: band.label, question: pick }
}
