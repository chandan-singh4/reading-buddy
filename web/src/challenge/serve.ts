/**
 * Which questions a sitting is made of, and in what order.
 *
 * Two sources feed one list. Most of it is this chapter's own bank. The rest is
 * *resurfacing*: concepts the reader was confidently wrong about in an earlier
 * sitting, pulled back in as fresh items on the same seam.
 *
 * The resurfaced items are never replayed questions. A question already seen is
 * a memory test — the reader recognises the shape of the right answer without
 * reasoning about the idea again, which is precisely the failure mode this
 * whole feature exists to avoid.
 */

import type { Question, StoredMiss } from './types.ts'

/**
 * How many resurfaced items may join one sitting.
 *
 * Small on purpose. A reader who has flagged nine concepts should not open a
 * chapter check and be handed a tribunal of their past mistakes; two is enough
 * to keep an old miss moving without turning the sitting into a reckoning.
 */
export const RESURFACE_LIMIT = 2

export interface ServeList {
  questions: Question[]
  /** Which of them came back from the ledger, by concept. Used by the UI copy. */
  resurfaced: Set<string>
}

/**
 * Build a sitting from this chapter's bank and the unresolved ledger.
 *
 * `bank` is everything written for this chapter. `flagged` is the ledger's
 * unresolved rows, newest first. A flagged concept contributes an item only if
 * the bank actually holds a *different* question on it — there is no point
 * promising to resurface an idea and then serving the same card again.
 */
export function assemble(
  bank: readonly Question[],
  flagged: readonly StoredMiss[],
  seenIds: ReadonlySet<string> = new Set(),
): ServeList {
  const unseen = bank.filter((question) => !seenIds.has(question.id))
  const resurfaced = new Set<string>()

  // The chapter's own questions, one per seam. A bank with three items on
  // `anima-vs-shadow` would spend a whole sitting on one distinction.
  const chosen: Question[] = []
  const covered = new Set<string>()
  for (const question of unseen) {
    if (covered.has(question.concept)) continue
    covered.add(question.concept)
    chosen.push(question)
  }

  // Then the old misses, but only where a fresh item on that seam exists and
  // this chapter has not already covered it.
  let pulled = 0
  for (const miss of flagged) {
    if (pulled >= RESURFACE_LIMIT) break
    if (covered.has(miss.concept)) continue
    const fresh = unseen.find((question) => question.concept === miss.concept)
    if (!fresh) continue
    covered.add(miss.concept)
    resurfaced.add(miss.concept)
    chosen.push(fresh)
    pulled += 1
  }

  return { questions: order(chosen), resurfaced }
}

/**
 * Easiest first.
 *
 * The ordering is Veda's `difficulty`, and it is never drawn. Opening a sitting
 * on the hardest discrimination in the chapter makes a reader who could have
 * answered four of five feel they understood none of it, and they stop.
 *
 * Ties keep the order the bank was written in, which is the order the model
 * chose to raise the seams — usually the order the chapter does.
 */
export function order(questions: readonly Question[]): Question[] {
  return [...questions]
    .map((question, index) => ({ question, index }))
    .sort((a, b) => a.question.difficulty - b.question.difficulty || a.index - b.index)
    .map((row) => row.question)
}
