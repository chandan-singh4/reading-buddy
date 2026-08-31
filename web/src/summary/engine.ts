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
import { clearOldSummaries } from './cleanup.ts'
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
   * Only the page uses it. Every golden call streams either way, watched or
   * not: the host gives an edge function about twenty-five seconds to send its
   * first byte, and a whole chapter recap written before a single byte leaves
   * runs past that. The host then answers 504 and the finished words are lost
   * with the connection. A stream sends its first byte immediately and holds
   * the line open for as long as the model needs.
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
      stream: true,
    }),
  })
  if (!response.ok) throw new Error(`the relay answered ${response.status}`)

  const data = response.body
    ? await watched(response.body, onWriting ?? (() => {}))
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
 *
 * Exported for its tests, and read once per streamed call.
 */
export async function watched(
  body: ReadableStream<Uint8Array>,
  onWriting: (soFar: string) => void,
): Promise<{ text?: unknown; model?: unknown }> {
  let text = ''
  let model: string | undefined
  let finished: { text?: unknown; model?: unknown } | undefined
  let refused: string | undefined

  await readEvents(body, (piece) => {
    switch (piece.t) {
      case 'open':
        if (typeof piece.model === 'string') model = piece.model
        /*
         * A second `open` means the first rung died part-way and the relay has
         * started again on the next one. Its half of the answer goes with it:
         * two halves of two JSON objects welded together is not an answer, and
         * the reader must see the new model's recap from its first word rather
         * than the old one's stump with new text growing out of it.
         */
        text = ''
        refused = undefined
        onWriting('')
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
      case 'error':
        /*
         * Every rung has now refused — the relay only sends this once it has
         * run out of them. Its words are kept and thrown to the page, because
         * "the free model is busy" tells the reader what to do next and "the
         * model did not answer" does not.
         */
        if (typeof piece.message === 'string') refused = piece.message
        break
      default:
        break
    }
  })

  if (finished && typeof finished.text === 'string' && finished.text.trim().length > 0) {
    return { text: finished.text, model: finished.model ?? model }
  }
  if (refused) throw new Refusal(refused)
  return { text, model }
}

/**
 * A refusal the relay worded for the reader, rather than a fault of ours.
 *
 * Kept apart from every other error on purpose. "The free model is busy right
 * now" is a sentence a reader can act on; "the relay answered 429" is one they
 * cannot, and showing the second in place of the first would be an app talking
 * to itself. Only a message that came down the wire as a refusal wears this
 * type, so a page can print it and nothing else.
 */
export class Refusal extends Error {}

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
 * How much talking a summary has to cover, counted in the reader's questions.
 *
 * Not in threads. A thread is one passage, and a reader who asks three follow-up
 * questions about the same paragraph adds three exchanges to the one thread the
 * passage already had. Counted by thread, that reader had "one conversation"
 * before and after, the summary looked finished, and the Scribe was never sent
 * the follow-ups.
 */
export function exchangesIn(threads: readonly StoredTutorThread[]): number {
  return threads.reduce(
    (running, thread) =>
      running + thread.messages.filter((message) => message.role === 'you').length,
    0,
  )
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
  /**
   * Run one of the two models, not both.
   *
   * The reader asked for this. The two prompts do two unrelated jobs: the
   * Librarian reads the chapter, the Scribe reads the conversation about it.
   * Wanting the recap written again is not wanting the conversation summary
   * written again, and paying for both to get one is money for an answer
   * nobody asked for.
   *
   * Absent means both, in the fixed order, which is what the sweep does and
   * what a first run must do. That order is not a tidiness rule: the Librarian
   * grows the canonical vocabulary and the Scribe matches against it, and its
   * own prompt says "The Librarian has already processed the chapter". A
   * Scribe-only run is therefore only offered where a recap already exists.
   */
  only?: 'recap' | 'items'
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
  const conversationsNow = exchangesIn(threads)

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

  /* One half at a time, when the reader asked for one half. */
  const wantsRecap = watch?.only !== 'items'
  const wantsItems = watch?.only !== 'recap'

  const now = new Date().toISOString()
  let recap = existing?.recap ?? ''
  let concepts = existing?.concepts ?? []
  let recapModel = existing?.recapModel

  if (wantsRecap && (!existing || watch?.force)) {
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
  if (wantsItems && conversationsNow > 0) {
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
    /*
     * How many conversations the *Scribe's* half covers.
     *
     * A recap-only run must not claim the conversations it did not read. If it
     * did, the sweep would see a summary that is up to date and never send the
     * Scribe, and a reader's questions would go unsummarised for ever.
     */
    coversNConversations: wantsItems ? conversationsNow : (existing?.coversNConversations ?? 0),
    recapAt: watch?.force && wantsRecap ? now : (existing?.recapAt ?? now),
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
      const asked = exchangesIn(threadsInChapter(threadsOf, row.chapter, row.section))
      if (asked !== row.coversNConversations) continue
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

  // Never overwrite a line the reader has already dealt with: not a finished
  // summary's "ready", and not a "pending" they already said yes to. Asking
  // again for something already agreed is the app forgetting an answer.
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
  // The yes is written down before the call is made. If every model is busy the
  // reader has still said yes, and being asked the same question again is not
  // an answer to a busy model — see `retryPending`.
  await markPending(bookId, chapter, part)
  try {
    await runChapter(bookId, chapter, part, watch)
  } catch (error: unknown) {
    await recordRefusal(bookId, chapter, part)
    throw error
  }
}

/** How long a refused summary waits before it tries again. */
const RETRY_AFTER_MS = 60 * 60 * 1000

/**
 * Turn a question into a yes that is waiting.
 *
 * Built from the alert already on the bell where there is one, so the book and
 * chapter titles carry over. There always is one when the reader answered in
 * the bell; the chapter page can approve a chapter that was never asked about,
 * and that path builds the line from the book instead.
 */
async function markPending(bookId: BookId, chapter: number, part?: Part): Promise<void> {
  const chapterId = part ? String(sectionPath(chapter, part.section)) : String(chapterPath(chapter))
  const id = `${bookId}:${chapterId}`
  const existing = (await alertStore.list()).find((row) => row.id === id)

  if (existing) {
    await alertStore.save({ ...existing, kind: 'pending', seen: false })
    return
  }

  const book = await repository.getBook(bookId)
  if (!book) return
  const entry = (await repository.listChapterIndexes(bookId)).find((row) => row.chapter === chapter)
  if (!entry) return

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
      'pending',
      new Date().toISOString(),
    ),
  )
}

/**
 * Note that a waiting summary was refused, so the retry knows when to try next.
 *
 * A successful run has already replaced this line with a `ready` one by the
 * time this could be reached, so there is nothing to guard against.
 */
async function recordRefusal(bookId: BookId, chapter: number, part?: Part): Promise<void> {
  const chapterId = part ? String(sectionPath(chapter, part.section)) : String(chapterPath(chapter))
  const row = (await alertStore.list()).find((entry) => entry.id === `${bookId}:${chapterId}`)
  if (!row || row.kind !== 'pending') return
  await alertStore.save({
    ...row,
    triedAt: new Date().toISOString(),
    tries: (row.tries ?? 0) + 1,
  })
}

/**
 * Try again on every yes that is still waiting for a model.
 *
 * An hour between attempts, at the reader's instruction. A summary that was
 * refused because the free model is busy is refused for minutes at a time, not
 * for milliseconds; hammering it would spend the reader's rate limit on being
 * told no faster.
 *
 * There is no giving up. The reader said yes, and a line that quietly turned
 * itself back into a question would be the app forgetting an answer it was
 * given. It waits until it succeeds or until the reader takes the book away.
 *
 * Like `sweep`, it never rejects: it runs in the background and a rejection
 * from here would land on whatever screen the reader is looking at.
 */
/**
 * Is this waiting line ready for another go?
 *
 * No `triedAt` means the first attempt is still in flight — the row was written
 * the moment the reader said yes, and asking again now would pay twice for one
 * chapter. After that, once an hour. There is no giving up: a model that is
 * busy today is not busy forever, and the reader already said yes.
 */
export function dueForRetry(row: StoredAlert, now: number): boolean {
  if (row.kind !== 'pending') return false
  if (row.triedAt === undefined) return false
  return now - Date.parse(row.triedAt) >= RETRY_AFTER_MS
}

export async function retryPending(now: number = Date.now()): Promise<void> {
  const waiting = (await alertStore.list()).filter((row) => row.kind === 'pending')

  for (const row of waiting) {
    if (!dueForRetry(row, now)) continue

    const part =
      row.section === undefined
        ? undefined
        : { section: row.section, title: row.sectionTitle ?? '' }
    try {
      await runChapter(row.bookId, row.chapter, part)
    } catch {
      await recordRefusal(row.bookId, row.chapter, part)
    }
  }
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
    // One pass at a time. Two overlapping ones would pay twice for a chapter.
    if (running || document.visibilityState !== 'visible') return
    running = true
    // The one-time clearing first, so the sweep never plans work for a summary
    // that is about to be deleted. Then the sweep, then the retries: a chapter
    // the sweep has just written is one the retry no longer has to ask for.
    void clearOldSummaries()
      .then(() => sweep())
      .then(() => retryPending())
      .finally(() => {
        running = false
      })
  }

  run()
  document.addEventListener('visibilitychange', run)

  /*
   * The clock that makes a waiting yes eventually land.
   *
   * The launch and foreground triggers above catch the reader who closes the
   * app and comes back. This one catches the reader who does not: a phone left
   * on the Home screen with a summary queued behind a busy model. It ticks
   * every ten minutes and `retryPending` decides whether an hour has passed —
   * a timer set to the hour itself would drift past it and wait two.
   */
  const clock = setInterval(run, 10 * 60 * 1000)

  return () => {
    document.removeEventListener('visibilitychange', run)
    clearInterval(clock)
  }
}
