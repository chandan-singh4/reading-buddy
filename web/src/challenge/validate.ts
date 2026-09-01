/**
 * The gate every generated item passes before it reaches a reader.
 *
 * This is the part that keeps the feature honest. A model asked for a
 * comprehension question about a book it half-remembers will happily write a
 * good-looking question about the *subject* instead — generic Jung, generic
 * psychology, none of it traceable to the pages the reader turned. Such a
 * question is worse than none: it tests whether the reader has absorbed the
 * internet's summary of the book.
 *
 * So an item is admitted only if its anchor resolves to a paragraph that is
 * really in this chapter. Everything else here is arithmetic; that one rule is
 * the point.
 */

import type { Question, QuestionOption } from './types.ts'

/** Why an item was turned away. Recorded so a bad model can be diagnosed. */
export interface Rejection {
  id: string
  reason: string
}

export interface Screened {
  kept: Question[]
  rejected: Rejection[]
}

function isOption(value: unknown): value is QuestionOption {
  if (typeof value !== 'object' || value === null) return false
  const option = value as Partial<QuestionOption>
  return (
    typeof option.id === 'string' &&
    typeof option.text === 'string' &&
    option.text.trim().length > 0 &&
    typeof option.correct === 'boolean' &&
    typeof option.revealNote === 'string' &&
    option.revealNote.trim().length > 0
  )
}

/**
 * Check one item against every rule, returning the reason it failed.
 *
 * `anchors` is the set of formatted anchors really present in this chapter.
 */
export function faultIn(value: unknown, anchors: ReadonlySet<string>): string | undefined {
  if (typeof value !== 'object' || value === null) return 'not an object'
  const item = value as Partial<Question>

  if (typeof item.id !== 'string' || item.id.trim() === '') return 'no id'
  if (typeof item.concept !== 'string' || item.concept.trim() === '') return 'no concept'
  if (typeof item.stem !== 'string' || item.stem.trim() === '') return 'no stem'
  if (!Array.isArray(item.options)) return 'no options'
  if (item.options.length !== 4) return `${item.options.length} options, not 4`
  if (!item.options.every(isOption)) return 'an option is missing a field'

  const correct = item.options.filter((option) => option.correct)
  if (correct.length !== 1) return `${correct.length} correct options, not 1`

  // Every distractor must name the misconception it embodies. This is what
  // separates "three wrong answers" from "three ways a real reader goes wrong",
  // and it is the difference the reveal slips are built on.
  for (const option of item.options) {
    if (option.correct) continue
    if (typeof option.misconceptionTag !== 'string' || option.misconceptionTag.trim() === '') {
      return 'a distractor has no misconception tag'
    }
  }

  if (typeof item.sourceAnchor !== 'string') return 'no source anchor'
  if (!anchors.has(item.sourceAnchor)) return `anchor ${item.sourceAnchor} is not in this chapter`

  return undefined
}

/**
 * Screen a batch, keeping what passes.
 *
 * Nothing is repaired. A model that returned three options was not trying to
 * return four, and patching the shape here would hide exactly the failure this
 * gate exists to catch. The caller regenerates instead.
 */
export function screen(items: readonly unknown[], anchors: ReadonlySet<string>): Screened {
  const kept: Question[] = []
  const rejected: Rejection[] = []
  const seen = new Set<string>()

  for (const [index, value] of items.entries()) {
    const fault = faultIn(value, anchors)
    const id =
      typeof value === 'object' && value !== null && typeof (value as Question).id === 'string'
        ? (value as Question).id
        : `item-${index}`

    if (fault !== undefined) {
      rejected.push({ id, reason: fault })
      continue
    }
    // A model asked for several questions on one chapter sometimes writes the
    // same one twice under two ids. Two identical stems in one sitting reads as
    // a bug to the person answering them.
    const item = value as Question
    const fingerprint = item.stem.trim().toLowerCase()
    if (seen.has(fingerprint)) {
      rejected.push({ id, reason: 'duplicate stem' })
      continue
    }
    seen.add(fingerprint)
    kept.push(item)
  }

  return { kept, rejected }
}
