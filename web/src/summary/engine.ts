import { TUTOR_URL } from '../reader/tutor.ts'
import { accessToken } from '../storage/cloud/client.ts'
import type { StoredAlert, StoredChapterSummary, StoredTutorThread } from '../storage/db.ts'
import { repository } from '../storage/repository.ts'
import { alertStore, conceptStore, summaryStore } from '../storage/summaries.ts'
import { tutorStore } from '../storage/tutor.ts'
import {
  chapterPath,
  type BookId,
  type ChapterIndex,
  type Section,
  tryParseAnchor,
} from '../structure/index.ts'
import { confusionMaterial, proseOf } from '../tutor/digest.ts'
import { librarianResult, scribeResult } from './parse.ts'
import { plan } from './queue.ts'

/**
 * Running the Librarian and the Scribe over a finished chapter.
 *
 * The order is fixed and it matters. The Librarian goes first, because it is
 * what grows the canonical vocabulary; the Scribe runs second so it is matching
 * against a list that already has this chapter's concepts in it. The Scribe's
 * own prompt says as much: "The Librarian has already processed the chapter."
 *
 * Nothing here decides *which* chapters run. That is `queue.ts`, which is pure
 * and tested. This file does the parts that need the network and the database.
 */

/** The schema the golden prompts defer to. Sent with the material, not in them. */
const LIBRARIAN_SCHEMA = `Return only a JSON object, with no prose around it and no code fence:

{"recap": "<the chapter recap>", "concepts": [{"name": "<canonical name>", "status": "existing-match" | "new-addition"}]}`

const SCRIBE_SCHEMA = `Return only a JSON object, with no prose around it and no code fence:

{"items": [{"claim": "<the distilled knowledge>", "concept": "<the concept name>", "status": "linked" | "candidate", "anchor": "<short source pointer>"}]}`

/**
 * One call to the relay, with a golden prompt behind it.
 *
 * Throws on anything short of a usable answer, and deliberately. `askTutor`
 * never rejects because the lamp must always print something; this must, for
 * the reason `askMemory` gives — storing a canned apology as the recap of
 * chapter four is worse than having no recap at all.
 */
async function askGolden(intent: 'librarian' | 'scribe', material: string, request: string) {
  const token = await accessToken()
  const response = await fetch(TUTOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ excerpt: material, intent, history: [], userMessage: request }),
  })
  if (!response.ok) throw new Error(`the relay answered ${response.status}`)

  const data = (await response.json()) as { text?: unknown }
  if (typeof data.text !== 'string' || data.text.trim().length === 0) {
    throw new Error('the relay sent no text')
  }
  return data.text
}

/** The prose of one chapter, in reading order. What the Librarian is given. */
export function chapterMaterial(sections: readonly Section[], chapter: number): string {
  return sections
    .filter((section) => section.chapter === chapter)
    .sort((a, b) => a.section - b.section)
    .map((section) => proseOf(section))
    .filter((prose) => prose.trim().length > 0)
    .join('\n\n')
}

/** The reader's conversations inside one chapter. What the Scribe is given. */
export function threadsInChapter(
  threads: readonly StoredTutorThread[],
  chapter: number,
): StoredTutorThread[] {
  return threads.filter((thread) => tryParseAnchor(thread.anchor)?.chapter === chapter)
}

/**
 * The canonical list, as it goes into a prompt.
 *
 * Named rather than inlined because both calls must send the *same* list, and
 * the Scribe's must include what the Librarian just added — that is the whole
 * reason the two run in this order.
 */
function vocabularyBlock(names: readonly string[]): string {
  if (names.length === 0) return 'THE CANONICAL CONCEPT LIST IS EMPTY. Every concept is new.'
  return `THE CANONICAL CONCEPT LIST:\n${names.map((name) => `- ${name}`).join('\n')}`
}

/** What one chapter's run produced, for the caller to report. */
export interface RunResult {
  summary: StoredChapterSummary
  /** Names that entered the vocabulary. Useful for a log; not shown anywhere. */
  added: string[]
}

/**
 * Run both models over one finished chapter and store the result.
 *
 * Rebuilds are refused rather than repeated. A chapter that already has a
 * recap gets only the Scribe, and only when it has gained conversations since —
 * both calls are paid, and asking again for words nothing changed is money for
 * the same answer.
 */
export async function runChapter(bookId: BookId, chapter: number): Promise<RunResult | undefined> {
  const book = await repository.getBook(bookId)
  if (!book) return undefined

  const spine = await repository.listChapterIndexes(bookId)
  const entry = spine.find((row) => row.chapter === chapter)
  if (!entry) return undefined

  const chapterId = String(chapterPath(chapter))
  const existing = await summaryStore.get(bookId, chapterId)

  const threads = threadsInChapter(await tutorStore.listThreads(bookId), chapter)
  const conversationsNow = threads.length

  // Nothing has changed since the last run: same recap, same conversations.
  if (existing && existing.coversNConversations === conversationsNow) return undefined

  const now = new Date().toISOString()
  let recap = existing?.recap ?? ''
  let concepts = existing?.concepts ?? []

  if (!existing) {
    const sections = await repository.listSections(bookId)
    const material = chapterMaterial(sections, chapter)
    if (material.trim().length === 0) return undefined

    const canonical = await conceptStore.names()
    const reply = await askGolden(
      'librarian',
      material,
      `${vocabularyBlock(canonical)}\n\n${LIBRARIAN_SCHEMA}`,
    )
    const result = librarianResult(reply)
    recap = result.recap
    concepts = result.concepts
  }

  // The Librarian's new names join the vocabulary before the Scribe reads it.
  const added = await conceptStore.add(
    concepts.filter((concept) => concept.status === 'new-addition').map((concept) => concept.name),
    bookId,
    now,
  )

  let items = existing?.items
  let itemsAt = existing?.itemsAt
  if (conversationsNow > 0) {
    const canonical = await conceptStore.names()
    const reply = await askGolden(
      'scribe',
      confusionMaterial(threads),
      `${vocabularyBlock(canonical)}\n\n${SCRIBE_SCHEMA}`,
    )
    items = scribeResult(reply, canonical).items
    itemsAt = now
  }

  const summary: StoredChapterSummary = {
    bookId,
    chapterId,
    chapter,
    chapterTitle: entry.title,
    recap,
    concepts,
    ...(items === undefined ? {} : { items }),
    coversNConversations: conversationsNow,
    recapAt: existing?.recapAt ?? now,
    ...(itemsAt === undefined ? {} : { itemsAt }),
  }

  await summaryStore.save(summary)
  await alertStore.save(alertFor(summary, book.title, 'ready', now))
  return { summary, added }
}

/** One line for the bell. `put`-keyed on the chapter, so a rerun replaces it. */
export function alertFor(
  summary: Pick<StoredChapterSummary, 'bookId' | 'chapterId' | 'chapter' | 'chapterTitle'>,
  bookTitle: string,
  kind: StoredAlert['kind'],
  at: string,
): StoredAlert {
  return {
    id: `${summary.bookId}:${summary.chapterId}`,
    kind,
    bookId: summary.bookId,
    bookTitle,
    chapterId: summary.chapterId,
    chapter: summary.chapter,
    chapterTitle: summary.chapterTitle,
    at,
    seen: false,
  }
}

/**
 * Work out what could run, do the automatic part, and ask about the rest.
 *
 * One chapter at a time, in order, with the whole thing wrapped so a failure
 * stops this pass rather than the app. A summary that does not appear is a
 * disappointment; a background job that throws into an unmounted screen is a
 * bug the reader sees.
 *
 * Only the most recently opened book runs on its own. Every other finished
 * chapter raises an `approval` alert and waits — the reader said so, and the
 * reason is money: a shelf of half-read books would otherwise fire off a
 * hundred calls the first time the app came up.
 */
export async function sweep(): Promise<void> {
  const positions = await repository.listPositions()
  if (positions.length === 0) return

  const spines = new Map<BookId, ChapterIndex[]>()
  for (const position of positions) {
    spines.set(position.bookId, await repository.listChapterIndexes(position.bookId))
  }

  const done = new Set<string>()
  for (const position of positions) {
    for (const row of await summaryStore.list(position.bookId)) {
      // A chapter with conversations the summary predates is not done.
      const threads = threadsInChapter(
        await tutorStore.listThreads(position.bookId),
        row.chapter,
      ).length
      if (threads === row.coversNConversations) done.add(`${position.bookId}:${row.chapter}`)
    }
  }

  const jobs = plan(positions, (bookId) => spines.get(bookId) ?? [], done)

  for (const job of jobs) {
    try {
      if (job.automatic) {
        await runChapter(job.bookId, job.chapter)
      } else {
        await proposeChapter(job.bookId, job.chapter)
      }
    } catch {
      // One chapter failing must not stop the rest, and must not reach a screen.
      // The chapter has no summary, so the next sweep will try it again.
    }
  }
}

/** Raise the question in the bell, without spending anything. */
async function proposeChapter(bookId: BookId, chapter: number): Promise<void> {
  const book = await repository.getBook(bookId)
  if (!book) return

  const spine = await repository.listChapterIndexes(bookId)
  const entry = spine.find((row) => row.chapter === chapter)
  if (!entry) return

  const chapterId = String(chapterPath(chapter))
  const id = `${bookId}:${chapterId}`

  // Never overwrite a line the reader has already dealt with, and never turn a
  // finished summary's "ready" back into a question.
  const already = (await alertStore.list()).find((row) => row.id === id)
  if (already) return

  await alertStore.save(
    alertFor(
      { bookId, chapterId, chapter, chapterTitle: entry.title },
      book.title,
      'approval',
      new Date().toISOString(),
    ),
  )
}

/** The reader said yes in the bell. Run it now. */
export async function approve(bookId: BookId, chapter: number): Promise<void> {
  await runChapter(bookId, chapter)
}

/**
 * Keep the summaries up to date for as long as the app is open.
 *
 * A sweep at launch, and another whenever the app comes back to the front. That
 * second one is what catches the ordinary case: the reader finishes a chapter,
 * locks the phone, and comes back later.
 *
 * There is no third trigger, and there cannot be a better one without a server.
 * This is a PWA: nothing here runs while the app is closed. A summary appears
 * the next time the reader opens Reading Buddy, not the moment they close the
 * book. See `docs/decisions.md`.
 *
 * Never rejects. It runs in the background, and a rejection from here would
 * surface as an unhandled error over whatever screen the reader is on.
 */
export function startSummaries(): () => void {
  let running = false

  const run = () => {
    // One sweep at a time. Two overlapping ones would pay twice for a chapter.
    if (running || document.visibilityState !== 'visible') return
    running = true
    void sweep().finally(() => {
      running = false
    })
  }

  run()
  document.addEventListener('visibilitychange', run)
  return () => document.removeEventListener('visibilitychange', run)
}
