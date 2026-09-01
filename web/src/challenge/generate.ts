/**
 * Writing a chapter's question bank, once, the first time it is asked for.
 *
 * ## Lazy, not eager
 *
 * The bank is built when the reader opens Challenge on a chapter — not when
 * they finish reading it. Most finished chapters are never tested, and building
 * eagerly would spend real money writing questions nobody sits. The knob is
 * here in one place if that ever needs flipping.
 *
 * ## No chapter is comprehended twice
 *
 * The Librarian already read this chapter and recorded the concepts it turns
 * on. This call inherits that: it is handed those concept names and the
 * chapter's own paragraphs, and it does the thin adversarial work of writing
 * distractors. It never asks a model to work out what the chapter is about.
 */

import { jsonFrom } from '../summary/parse.ts'
import { watched } from '../summary/engine.ts'
import { accessToken } from '../storage/cloud/client.ts'
import { TUTOR_URL } from '../reader/tutor.ts'
import {
  arrange,
  lastRoster,
  stepsFrom,
  storedArrangement,
  storedPick,
  storedSummaryPick,
  type Provider,
} from '../reader/models.ts'
import type { Section } from '../structure/index.ts'
import { material, userMessage, type Passage, type QuestionRequest } from './prompt.ts'
import { screen, type Rejection } from './validate.ts'
import type { Question } from './types.ts'

/**
 * How many questions one call asks for.
 *
 * A batch size, not a budget. The bank grows: when the reader works through
 * what has been written, the app asks for another batch and tells Veda what she
 * has already asked. Five keeps the wait short and the money small per call —
 * a reader who wants twenty questions gets four calls, spread over the twenty
 * questions rather than spent before the first one.
 */
export const BATCH_SIZE = 5

/**
 * How much of the chapter one call carries, in characters.
 *
 * ## Why the chapter is not sent whole
 *
 * It was, and it was sent *twice* — once as the excerpt and again as the
 * anchored passage list, which is the same prose with addresses on it. A long
 * chapter is thirty thousand characters, so a batch of five questions was
 * paying for sixty thousand.
 *
 * Now one slice goes per call, and the next call takes the next slice. Five
 * questions do not need a whole chapter in front of them; they need enough
 * prose to find five seams in. Twelve thousand characters is roughly two
 * thousand words — a long article, and more than enough.
 *
 * ## What this costs, honestly
 *
 * A question can only be grounded in prose Veda has actually been shown, so a
 * batch drawn from the middle of a chapter cannot ask about the end of it. The
 * slices move, so the chapter *is* covered — but across several batches, not
 * within one. That is the right trade: the alternative is paying for the whole
 * chapter on every refill, which is what made the reader ask about this.
 */
const SLICE = 12_000

/**
 * How many times a batch may be rewritten before we give the reader what we
 * have. A model that returns nothing usable twice is having a bad day, and a
 * third paid attempt rarely changes that.
 */
const ATTEMPTS = 2

/**
 * No sitting could be built, and *why* decides what the reader is told.
 *
 * The two causes need two different sentences. A chapter with nothing to ask
 * about will not improve by waiting, so telling the reader to try again in a
 * minute would be a lie; a relay that could not reach a model usually will.
 * The `message` stays technical, because it is what a log wants — the page
 * reads `reason` and writes the sentence itself.
 */
export class NoQuestions extends Error {
  readonly reason: NoQuestionsReason

  constructor(message: string, reason: NoQuestionsReason = 'no-model') {
    super(message)
    this.reason = reason
  }
}

export type NoQuestionsReason =
  /** This chapter has no prose, or nothing that could be traced to it. */
  | 'nothing-to-ask'
  /** The bank holds questions, but Veda has nothing new left to ask. */
  | 'exhausted'
  | 'no-model'

/**
 * The paragraphs of one chapter, each with the anchor a question must cite.
 *
 * Prose only. A heading is not something a comprehension question can be
 * grounded in, and a figure caption grounds a question about a picture the
 * examination never shows.
 */
export function passagesOf(sections: readonly Section[], chapter: number): Passage[] {
  const passages: Passage[] = []
  for (const section of sections.filter((row) => row.chapter === chapter)) {
    for (const paragraph of section.paragraphs) {
      if (paragraph.kind !== 'prose') continue
      const text = paragraph.text.trim()
      // A one-line paragraph carries no idea to test. It is a transition, a
      // fragment of dialogue, or an aside — grounding a question in it produces
      // exactly the "according to page X" trivia the prompt forbids.
      if (text.length < 160) continue
      // `Paragraph.anchor` is already the formatted string — `ch02/s03/p14`.
      // That is the app's own address grammar, so a cited anchor can be checked
      // against the real manifest rather than trusted.
      passages.push({ anchor: paragraph.anchor, text })
    }
  }
  return passages
}

/** The same chain the summary jobs use — the reader's pick leads. */
function examinerChain(): { id: string; source: Provider }[] {
  try {
    const columns = arrange(lastRoster(), storedArrangement())
    if (columns.length === 0) return []
    return stepsFrom(columns, storedSummaryPick() ?? storedPick() ?? undefined)
  } catch {
    return []
  }
}

async function askExaminer(
  material: string,
  request: string,
): Promise<{ text: string; model?: string }> {
  const token = await accessToken()
  const chain = examinerChain()
  const response = await fetch(TUTOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      excerpt: material,
      intent: 'examiner',
      history: [],
      userMessage: request,
      ...(chain.length > 0 ? { models: chain } : {}),
      // Streamed for the reason every long job here is: the host cuts a
      // function off if it stays silent, and a bank of five questions is a lot
      // of tokens to write before the first byte.
      stream: true,
    }),
  })
  if (!response.ok) throw new NoQuestions(`the examiner relay answered ${response.status}`)
  if (!response.body) throw new NoQuestions('the examiner relay sent no body')

  // `watched` is the summary engine's stream reader. Nothing is watching this
  // one — a bank is written in one go, and half a JSON object is not something
  // a reader can be shown — but the reading of the stream is identical, and a
  // second copy of it is a second place for the relay's line format to drift.
  const data = await watched(response.body, () => {})
  if (typeof data.text !== 'string' || data.text.trim().length === 0) {
    throw new NoQuestions('the examiner sent no text')
  }
  return { text: data.text, model: typeof data.model === 'string' ? data.model : undefined }
}

export interface Written {
  questions: Question[]
  rejected: Rejection[]
  model?: string
}

/**
 * Write one chapter's bank.
 *
 * Anything that fails the gate in `validate.ts` is discarded rather than
 * repaired, and the batch is asked for again. That is the expensive-looking
 * choice and it is the right one: an ungrounded question is not a question
 * about this book, and shipping one teaches the reader that the examination
 * does not know what they read.
 */
export async function writeBank(
  sections: readonly Section[],
  request: Omit<QuestionRequest, 'passages' | 'count'>,
  /**
   * What the bank already holds, when this is a refill rather than a first
   * write. Their stems and seams are sent to Veda so she goes somewhere new,
   * and any item that comes back matching a stem we already have is dropped.
   */
  already: readonly Question[] = [],
): Promise<Written> {
  const passages = passagesOf(sections, request.chapter)
  if (passages.length === 0) {
    throw new NoQuestions('this chapter has no prose to ask about', 'nothing-to-ask')
  }

  /*
   * Where in the chapter this batch reads.
   *
   * A refill starts where the last one stopped, so Veda meets prose she has not
   * seen rather than the opening paragraphs for the fourth time. It wraps: a
   * chapter shorter than one slice is simply read whole every time, and a long
   * one comes round again once it has been covered.
   */
  const slice = sliceFrom(passages, already.length)

  // The gate checks against the slice, not the chapter. Veda can only cite what
  // she was shown, and an anchor from prose she never saw is a guess.
  const anchors = new Set(slice.map((passage) => passage.anchor))

  const rejected: Rejection[] = []
  let model: string | undefined

  const seenStems = new Set(already.map((question) => normalise(question.stem)))
  const seenIds = new Set(already.map((question) => question.id))

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const reply = await askExaminer(
      /*
       * The book's own words, sent once.
       *
       * They used to go twice — as the excerpt and again inside the user
       * message as the anchored passage list, which is the same prose with
       * addresses on it. A long chapter is thirty thousand characters, so a
       * batch of five questions was paying for sixty thousand.
       */
      material(slice),
      userMessage({
        ...request,
        passages: slice,
        count: BATCH_SIZE,
        avoidStems: already.map((question) => question.stem),
        avoidConcepts: [...new Set(already.map((question) => question.concept))],
      }),
    )
    model = reply.model ?? model

    let items: unknown[] = []
    try {
      const parsed = jsonFrom(reply.text) as { questions?: unknown }
      items = Array.isArray(parsed?.questions) ? parsed.questions : []
    } catch {
      rejected.push({ id: `attempt-${attempt}`, reason: 'the reply was not JSON' })
      continue
    }

    const result = screen(items, anchors)
    rejected.push(...result.rejected)

    /*
     * A refill that comes back with a question we already hold is not a
     * failure of the model so much as a sign the chapter is running dry. It is
     * dropped here rather than in `validate.ts`, which knows only about one
     * batch and has no idea what the bank already contains.
     */
    const fresh = result.kept.filter((question) => {
      if (seenStems.has(normalise(question.stem))) {
        rejected.push({ id: question.id, reason: 'this question has already been asked' })
        return false
      }
      return true
    })

    // Ids come from the model and only have to be unique within a batch, so a
    // refill can collide with the bank. The stem is what makes it a duplicate;
    // the id just has to stop being one.
    for (const question of fresh) {
      while (seenIds.has(question.id)) question.id = `${question.id}+`
      seenIds.add(question.id)
      seenStems.add(normalise(question.stem))
    }

    if (fresh.length > 0) return { questions: fresh, rejected, model }
  }

  throw new NoQuestions(
    'nothing new could be written for this chapter',
    already.length > 0 ? 'exhausted' : 'nothing-to-ask',
  )
}

/**
 * The slice of the chapter this batch reads.
 *
 * `written` is how many questions the bank already holds, which is a good
 * enough clock: five questions per batch means batch two starts one slice in.
 * Wrapping rather than running out keeps a long chapter answerable forever
 * without ever needing to know how many slices it has.
 */
export function sliceFrom(passages: readonly Passage[], written: number): Passage[] {
  const total = passages.reduce((sum, passage) => sum + passage.text.length, 0)
  if (total <= SLICE) return [...passages]

  const slices = Math.ceil(total / SLICE)
  const start = ((written / BATCH_SIZE) | 0) % slices

  const out: Passage[] = []
  let seen = 0
  let taken = 0
  for (const passage of passages) {
    const before = seen
    seen += passage.text.length
    if (before < start * SLICE) continue
    if (taken >= SLICE) break
    out.push(passage)
    taken += passage.text.length
  }
  // A slice that lands past the end of the last paragraph gives nothing back.
  // Falling to the front is better than failing: the reader gets questions.
  return out.length > 0 ? out : passages.slice(0, 1)
}

/** Stems match when they say the same thing, whatever the punctuation. */
function normalise(stem: string): string {
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
