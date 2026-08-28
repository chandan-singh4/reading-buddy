import {
  arrange,
  lastRoster,
  stepsFrom,
  storedArrangement,
  storedPick,
  storedSummaryPick,
  type Provider,
} from '../reader/models.ts'
import { readEvents, TUTOR_URL } from '../reader/tutor.ts'
import { accessToken } from '../storage/cloud/client.ts'
import type { StoredAlert, StoredChapterSummary, StoredTutorThread } from '../storage/db.ts'
import { repository } from '../storage/index.ts'
import { alertStore, conceptStore, summaryStore } from '../storage/summaries.ts'
import { tutorStore } from '../storage/tutor.ts'
import { recapSoFar } from './streaming.ts'
import {
  chapterPath,
  sectionPath,
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
async function askGolden(
  intent: 'librarian' | 'scribe',
  material: string,
  request: string,
  /**
   * Somebody is watching this one being written.
   *
   * Hand a watcher in and the relay is asked to stream, exactly as the lamp
   * asks. Leave it out and the exchange is what it always was — one request,
   * one JSON reply — which is the path the background sweep stays on. Nobody
   * is looking at a sweep, and a stream nobody watches is a slower way to
   * receive the same words.
   */
  onWriting?: (soFar: string) => void,
) {
  const token = await accessToken()
  const chain = summaryChain()
  const response = await fetch(TUTOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      excerpt: material,
      intent,
      history: [],
      userMessage: request,
      ...(chain.length > 0 ? { models: chain } : {}),
      ...(onWriting ? { stream: true } : {}),
    }),
  })
  if (!response.ok) throw new Error(`the relay answered ${response.status}`)

  const data =
    onWriting && response.body
      ? await watched(response.body, onWriting)
      : ((await response.json()) as { text?: unknown; model?: unknown })
  if (typeof data.text !== 'string' || data.text.trim().length === 0) {
    throw new Error('the relay sent no text')
  }
  /*
   * The model comes back beside the answer and is kept.
   *
   * `model` is what actually answered, not what was asked for: the relay walks
   * a fallback chain, so the fourth rung may well be what wrote this recap. A
   * reader who is judging a summary should be told whose words they are
   * judging, exactly as the reading lamp already tells them.
   */
  return { text: data.text, model: typeof data.model === 'string' ? data.model : undefined }
}

/**
 * Read a streamed answer, telling the watcher what it says as it grows.
 *
 * The watcher is given the recap, not the raw deltas: the answer is a JSON
 * object and `recapSoFar` is what turns a half-written one into the paragraph
 * the reader is waiting for. See `streaming.ts`.
 *
 * A stream that ends without a `done` line still returns whatever text
 * arrived. The caller decides whether that is enough — this one throws on an
 * empty answer, and half a recap is not empty. It is also not stored: the
 * material it was built from is still there, and a rerun costs the reader
 * nothing but a tap.
 */
async function watched(
  body: ReadableStream<Uint8Array>,
  onWriting: (soFar: string) => void,
): Promise<{ text?: unknown; model?: unknown }> {
  let text = ''
  let model: string | undefined
  let finished: { text?: unknown; model?: unknown } | undefined

  await readEvents(body, (piece) => {
    switch (piece.t) {
      case 'open':
        if (typeof piece.model === 'string') model = piece.model
        break
      case 'text':
        if (typeof piece.d === 'string') {
          text += piece.d
          onWriting(recapSoFar(text))
        }
        break
      case 'done':
        finished = (piece.reply ?? {}) as { text?: unknown; model?: unknown }
        break
      default:
        break
    }
  })

  if (finished && typeof finished.text === 'string' && finished.text.trim().length > 0) {
    return { text: finished.text, model: finished.model ?? model }
  }
  return { text, model }
}

/**
 * The fallback chain a summary is sent down, strongest choice first.
 *
 * Built from the roster the app last saw, because a summary runs in the
 * background and must not wait on a roster fetch. With no remembered roster
 * this is empty and the relay walks its own default chain, which is what
 * happened for every summary written before the setting existed.
 *
 * The reader's summary model, or failing that the one the lamp uses. A reader
 * who has never opened the setting gets the model they already chose for Veda,
 * which is a better default than a stranger.
 */
function summaryChain(): { id: string; source: Provider }[] {
  try {
    const columns = arrange(lastRoster(), storedArrangement())
    if (columns.length === 0) return []
    return stepsFrom(columns, storedSummaryPick() ?? storedPick() ?? undefined)
  } catch {
    // Storage off, or a roster we cannot read. The relay's own chain is fine.
    return []
  }
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

/**
 * The prose of one titled section. What the Librarian is given for a section.
 *
 * The section is the atom the book is stored in, so this is one row, not a
 * filtered join — the chapter-wide version above has to gather and order.
 */
export function sectionMaterial(
  sections: readonly Section[],
  chapter: number,
  section: number,
): string {
  const found = sections.find((row) => row.chapter === chapter && row.section === section)
  return found ? proseOf(found) : ''
}

/** The reader's conversations inside one chapter. What the Scribe is given. */
export function threadsInChapter(
  threads: readonly StoredTutorThread[],
  chapter: number,
  section?: number,
): StoredTutorThread[] {
  return threads.filter((thread) => {
    const parts = tryParseAnchor(thread.anchor)
    if (parts?.chapter !== chapter) return false
    // A chapter-wide run takes every thread in the chapter. A section run takes
    // only the ones anchored inside it, so the same conversation is not
    // summarised twice under two headings.
    return section === undefined || parts.section === section
  })
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

/**
 * Somebody is watching this run, and may be asking for a rewrite.
 *
 * Absent for the background sweep, which is the ordinary case: nobody is on
 * the page, nothing is on screen to protect, and a chapter that already has a
 * summary is left alone.
 */
export interface RunWatch {
  /**
   * The recap as it is written, one call per delta.
   *
   * The reader watching a summary appear is the whole reason this exists. A
   * model may think for ten seconds before its first word, and the difference
   * between a slow answer and a frozen app is being shown that it started.
   */
  onWriting?: (soFar: string) => void
  /**
   * Write it again even though there is already a summary.
   *
   * The Redo button. Nothing is deleted first, and nothing is written until
   * the new answer is whole: if the model is busy or the stream dies, the run
   * throws, the store is never touched, and the reader keeps the summary they
   * already had. A redo can cost money and produce nothing; it can never cost
   * the reader words they had.
   */
  force?: boolean
}

/** What one chapter's run produced, for the caller to report. */
export interface RunResult {
  summary: StoredChapterSummary
  /** Names that entered the vocabulary. Useful for a log; not shown anywhere. */
  added: string[]
}

/** Which titled section a run covers. Absent means the whole chapter. */
export interface Part {
  section: number
  title: string
}

/**
 * Run both models over one finished chapter — or over one titled section of it
 * — and store the result.
 *
 * The two are the same job at two scales, so they are one function. Only three
 * things differ: which prose goes to the Librarian, which conversations go to
 * the Scribe, and the key the answer is stored under. Everything else — the
 * order of the models, the vocabulary, the staleness rule — is identical, and
 * splitting it in two would be two copies of the careful part.
 *
 * Rebuilds are refused rather than repeated. A chapter that already has a
 * recap gets only the Scribe, and only when it has gained conversations since —
 * both calls are paid, and asking again for words nothing changed is money for
 * the same answer.
 */
export async function runChapter(
  bookId: BookId,
  chapter: number,
  part?: Part,
  watch?: RunWatch,
): Promise<RunResult | undefined> {
  const book = await repository.getBook(bookId)
  if (!book) return undefined

  const spine = await repository.listChapterIndexes(bookId)
  const entry = spine.find((row) => row.chapter === chapter)
  if (!entry) return undefined

  const chapterId = part
    ? String(sectionPath(chapter, part.section))
    : String(chapterPath(chapter))
  const existing = await summaryStore.get(bookId, chapterId)

  const threads = threadsInChapter(await tutorStore.listThreads(bookId), chapter, part?.section)
  const conversationsNow = threads.length

  /*
   * Nothing has changed since the last run: same recap, same conversations.
   *
   * `force` is the reader pressing Redo. They are looking at the summary and
   * asking for a different one, usually from a different model, so "nothing
   * changed" is exactly the case they mean — and refusing them would make the
   * button do nothing at all.
   */
  if (!watch?.force && existing && existing.coversNConversations === conversationsNow) {
    return undefined
  }

  const now = new Date().toISOString()
  let recap = existing?.recap ?? ''
  let concepts = existing?.concepts ?? []
  let recapModel = existing?.recapModel

  if (!existing || watch?.force) {
    const sections = await repository.listSections(bookId)
    const material = part
      ? sectionMaterial(sections, chapter, part.section)
      : chapterMaterial(sections, chapter)
    if (material.trim().length === 0) return undefined

    const canonical = await conceptStore.names()
    const reply = await askGolden(
      'librarian',
      material,
      `${vocabularyBlock(canonical)}\n\n${LIBRARIAN_SCHEMA}`,
      watch?.onWriting,
    )
    const result = librarianResult(reply.text)
    recap = result.recap
    concepts = result.concepts
    recapModel = reply.model
  }

  // The Librarian's new names join the vocabulary before the Scribe reads it.
  const added = await conceptStore.add(
    concepts.filter((concept) => concept.status === 'new-addition').map((concept) => concept.name),
    bookId,
    now,
  )

  let items = existing?.items
  let itemsAt = existing?.itemsAt
  let itemsModel = existing?.itemsModel
  if (conversationsNow > 0) {
    const canonical = await conceptStore.names()
    const reply = await askGolden(
      'scribe',
      confusionMaterial(threads),
      `${vocabularyBlock(canonical)}\n\n${SCRIBE_SCHEMA}`,
    )
    items = scribeResult(reply.text, canonical).items
    itemsAt = now
    itemsModel = reply.model
  }

  const summary: StoredChapterSummary = {
    bookId,
    chapterId,
    chapter,
    chapterTitle: entry.title,
    ...(part ? { section: part.section, sectionTitle: part.title } : {}),
    recap,
    concepts,
    ...(items === undefined ? {} : { items }),
    coversNConversations: conversationsNow,
    recapAt: watch?.force ? now : (existing?.recapAt ?? now),
    ...(recapModel === undefined ? {} : { recapModel }),
    ...(itemsAt === undefined ? {} : { itemsAt }),
    ...(itemsModel === undefined ? {} : { itemsModel }),
  }

  await summaryStore.save(summary)
  await alertStore.save(alertFor(summary, book.title, 'ready', now))
  return { summary, added }
}

/** One line for the bell. `put`-keyed on the chapter, so a rerun replaces it. */
export function alertFor(
  summary: Pick<
    StoredChapterSummary,
    'bookId' | 'chapterId' | 'chapter' | 'chapterTitle' | 'section' | 'sectionTitle'
  >,
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
    ...(summary.section === undefined
      ? {}
      : { section: summary.section, sectionTitle: summary.sectionTitle ?? '' }),
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
    const threadsOf = await tutorStore.listThreads(position.bookId)
    for (const row of await summaryStore.list(position.bookId)) {
      // A summary whose chapter has gained conversations since is not done.
      const threads = threadsInChapter(threadsOf, row.chapter, row.section).length
      if (threads !== row.coversNConversations) continue
      // Two key shapes, so a chapter and a section of it can never collide.
      done.add(
        row.section === undefined
          ? `${position.bookId}:${row.chapter}`
          : `${position.bookId}:${row.chapter}:${row.section}`,
      )
    }
  }

  const jobs = plan(positions, (bookId) => spines.get(bookId) ?? [], done)

  for (const job of jobs) {
    try {
      const part =
        job.section === undefined
          ? undefined
          : { section: job.section, title: job.sectionTitle ?? '' }
      if (job.automatic) {
        await runChapter(job.bookId, job.chapter, part)
      } else {
        await proposeChapter(job.bookId, job.chapter, part)
      }
    } catch {
      // One chapter failing must not stop the rest, and must not reach a screen.
      // The chapter has no summary, so the next sweep will try it again.
    }
  }
}

/** Raise the question in the bell, without spending anything. */
async function proposeChapter(bookId: BookId, chapter: number, part?: Part): Promise<void> {
  const book = await repository.getBook(bookId)
  if (!book) return

  const spine = await repository.listChapterIndexes(bookId)
  const entry = spine.find((row) => row.chapter === chapter)
  if (!entry) return

  const chapterId = part
    ? String(sectionPath(chapter, part.section))
    : String(chapterPath(chapter))
  const id = `${bookId}:${chapterId}`

  // Never overwrite a line the reader has already dealt with, and never turn a
  // finished summary's "ready" back into a question.
  const already = (await alertStore.list()).find((row) => row.id === id)
  if (already) return

  await alertStore.save(
    alertFor(
      {
        bookId,
        chapterId,
        chapter,
        chapterTitle: entry.title,
        ...(part ? { section: part.section, sectionTitle: part.title } : {}),
      },
      book.title,
      'approval',
      new Date().toISOString(),
    ),
  )
}

/**
 * The reader said yes — in the bell, or on the chapter page. Run it now.
 *
 * `watch` is what makes the chapter page different from the bell: somebody is
 * looking at this one, so it streams, and they may be asking for a rewrite of
 * words that are already on the screen.
 */
export async function approve(
  bookId: BookId,
  chapter: number,
  part?: Part,
  watch?: RunWatch,
): Promise<void> {
  await runChapter(bookId, chapter, part, watch)
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
