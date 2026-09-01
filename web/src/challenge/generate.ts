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
import { proseOf } from '../tutor/digest.ts'
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
import { userMessage, type Passage, type QuestionRequest } from './prompt.ts'
import { screen, type Rejection } from './validate.ts'
import type { Question } from './types.ts'

/** How many items one chapter is worth. Enough for a sitting, not a exam. */
export const BANK_SIZE = 5

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

export type NoQuestionsReason = 'nothing-to-ask' | 'no-model'

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
): Promise<Written> {
  const passages = passagesOf(sections, request.chapter)
  if (passages.length === 0) {
    throw new NoQuestions('this chapter has no prose to ask about', 'nothing-to-ask')
  }

  const anchors = new Set(passages.map((passage) => passage.anchor))
  const material = sections
    .filter((section) => section.chapter === request.chapter)
    .sort((a, b) => a.section - b.section)
    .map((section) => proseOf(section))
    .join('\n\n')

  const rejected: Rejection[] = []
  let model: string | undefined

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const reply = await askExaminer(
      material,
      userMessage({ ...request, passages, count: BANK_SIZE }),
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
    if (result.kept.length > 0) return { questions: result.kept, rejected, model }
  }

  throw new NoQuestions(
    'nothing the examiner wrote could be traced to this chapter',
    'nothing-to-ask',
  )
}
