/**
 * Veda's Examination: what a question is, and what a miss leaves behind.
 *
 * Two shapes and one rule between them. A **question** is disposable — it is
 * written for one concept, answered once, and never shown again. A **ledger
 * entry** is durable, and it is keyed by *concept*, not by question. That split
 * is the whole design: a reader who misconstrues one idea should meet that idea
 * again in a new question, not the same question with the answer already known.
 */

import type { BookId } from '../structure/index.ts'

/** How sure the reader was. The order matters — see `heldFirmly`. */
export type Confidence = 'guessing' | 'somewhat' | 'confident' | 'very'

export const CONFIDENCE: readonly Confidence[] = ['guessing', 'somewhat', 'confident', 'very']

/**
 * Was this answer held firmly enough that being wrong matters?
 *
 * The line sits between "somewhat" and "confident" because that is where the
 * reader stops guessing and starts believing. A wrong answer below the line is
 * ordinary learning and gets no follow-up; above it, the belief will not
 * correct itself and the concept is flagged.
 */
export function heldFirmly(confidence: Confidence): boolean {
  return confidence === 'confident' || confidence === 'very'
}

export interface QuestionOption {
  id: string
  text: string
  correct: boolean
  /**
   * The misconception this distractor embodies, named in a few words —
   * `Anima ↔ Shadow`. Required on every wrong option and absent on the right
   * one. A distractor nobody could name is filler, and filler is what turns a
   * comprehension test into a vocabulary quiz.
   */
  misconceptionTag?: string
  /** Why this reads true, or why it is tempting but wrong. Veda's own voice. */
  revealNote: string
}

export interface Question {
  id: string
  /** The seam being tested — `anima-vs-shadow`, not `archetypes`. */
  concept: string
  /** A short situation to reason about. Absent when a direct stem is cleaner. */
  scenario?: string
  stem: string
  options: QuestionOption[]
  /**
   * Veda's own ordering hint, 1-3.
   *
   * Never rendered. It sorts the serve-list and nothing else. The reader is
   * told explicitly that difficulty is Veda's to choose - showing it would turn
   * a wrong answer on a hard question into an excuse and a wrong answer on an
   * easy one into a humiliation, and neither helps them learn.
   */
  difficulty: number
  /**
   * The anchor of the paragraph this question was written from, formatted.
   *
   * The grounding rule lives here. An item whose anchor does not resolve to a
   * real paragraph of the chapter is discarded, because an ungrounded question
   * is a question about psychology in general rather than about the book the
   * reader actually read.
   */
  sourceAnchor: string
}

/** One chapter's generated bank, cached so a chapter is written for once. */
export interface StoredQuestionBank {
  bookId: BookId
  /** `ch02`, matching `StoredChapterSummary.chapterId`. */
  chapterId: string
  chapter: number
  chapterTitle: string
  questions: Question[]
  /** ISO 8601. */
  builtAt: string
  /** The model that actually wrote them, for the same reason recaps carry one. */
  model?: string
}

/**
 * What the reader has and has not got hold of, one row per concept.
 *
 * Keyed by concept name, because the concepts are library-wide - the same idea
 * met in two books carries one name, which is the rule the Librarian's
 * vocabulary already follows.
 */
export interface StoredMiss {
  concept: string
  bookId: BookId
  seen: number
  missed: number
  lastConfidence?: Confidence
  /** Epoch milliseconds. */
  lastSeen: number
  /**
   * Set by a confident-wrong, cleared by any correct answer.
   *
   * A flagged concept comes back in a later session as a *fresh* question. It
   * is never re-probed in the same session: a reader who has just been told
   * they were confidently wrong is the worst-placed person in the world to
   * reason about that idea, and asking again immediately tests their composure
   * rather than their understanding.
   */
  flagged: boolean
}
