/**
 * Which questions a sitting is made of, and in what order.
 *
 * Two sources feed one list. Most of it is this chapter's own bank. The rest is
 * *resurfacing*: concepts the reader was confidently wrong about in an earlier
 * sitting, which are moved to the front so they are met again sooner.
 *
 * The resurfaced items are never replayed questions. A question already
 * answered is a memory test — the reader recognises the shape of the right
 * answer without reasoning about the idea again, which is precisely the failure
 * mode this whole feature exists to avoid. Answered ids are kept on the bank
 * row, so a question is retired for good.
 */

import type { Question, StoredMiss } from './types.ts'

export interface ServeList {
  questions: Question[]
  /** Which of them came back from the ledger, by concept. Used by the UI copy. */
  resurfaced: Set<string>
}

/**
 * Build the queue from this chapter's bank and the unresolved ledger.
 *
 * `bank` is everything written for this chapter so far. `answered` is every
 * question id the reader has already been shown. `flagged` is the ledger's
 * unresolved rows, newest first.
 *
 * Everything unanswered is served — nothing is held back. The bank grows on
 * demand, so a cap here would only hide work already paid for.
 */
export function assemble(
  bank: readonly Question[],
  flagged: readonly StoredMiss[],
  answered: ReadonlySet<string> = new Set(),
): ServeList {
  const unseen = bank.filter((question) => !answered.has(question.id))
  const flaggedConcepts = new Set(flagged.map((miss) => miss.concept))

  const resurfaced = new Set<string>()
  for (const question of unseen) {
    if (flaggedConcepts.has(question.concept)) resurfaced.add(question.concept)
  }

  return { questions: order(unseen, resurfaced), resurfaced }
}

/**
 * Flagged seams first, then the rest, and each group spread across its seams.
 *
 * Two rules, in this order.
 *
 * **A flagged concept comes first.** The reader was confidently wrong about it
 * in an earlier sitting and the point of resurfacing is that they meet it
 * again, not that it waits behind eleven other questions.
 *
 * **Then no two questions in a row share a seam.** A bank of twenty holds
 * several questions per concept, and serving them together turns a sitting into
 * a drill on one distinction. Taking one from each seam in turn — a round
 * robin — spreads them without dropping any.
 *
 * Veda's `difficulty` breaks ties inside a seam, gentlest first, and it is
 * never drawn. Opening on the hardest discrimination in the chapter makes a
 * reader who could have answered four of five feel they understood none of it,
 * and they stop.
 */
export function order(
  questions: readonly Question[],
  resurfaced: ReadonlySet<string> = new Set(),
): Question[] {
  const bySeam = new Map<string, Question[]>()
  questions.forEach((question, index) => {
    const seam = bySeam.get(question.concept)
    const row = { question, index }
    if (seam) seam.push(question)
    else bySeam.set(question.concept, [question])
    void row
  })

  // Gentlest first inside each seam. Ties keep the order the bank was written
  // in, which is the order the model chose to raise them.
  const positions = new Map(questions.map((question, index) => [question, index]))
  for (const seam of bySeam.values()) {
    seam.sort(
      (a, b) => a.difficulty - b.difficulty || positions.get(a)! - positions.get(b)!,
    )
  }

  const seams = [...bySeam.keys()].sort((a, b) => {
    const flagged = Number(resurfaced.has(b)) - Number(resurfaced.has(a))
    if (flagged !== 0) return flagged
    return positions.get(bySeam.get(a)![0]!)! - positions.get(bySeam.get(b)![0]!)!
  })

  const out: Question[] = []
  let round = 0
  while (out.length < questions.length) {
    let placed = false
    for (const seam of seams) {
      const question = bySeam.get(seam)![round]
      if (!question) continue
      out.push(question)
      placed = true
    }
    if (!placed) break
    round += 1
  }
  return out
}
