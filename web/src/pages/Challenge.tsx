/**
 * Veda's Examination — the sitting itself.
 *
 * One question on the screen at a time, and nothing else: no score, no timer,
 * no difficulty. The reader is told plainly that difficulty is Veda's to
 * choose, because a visible level turns a wrong answer on a hard question into
 * an excuse and a wrong answer on an easy one into a humiliation.
 *
 * ## The sitting has no length
 *
 * There is no "5 of 5". The reader taps next as long as they want to, and when
 * the written questions run out the app quietly asks Veda for more, telling her
 * what she has already asked so she goes somewhere new. Only when a refill
 * comes back with nothing does the sitting end — and it ends by saying the
 * chapter is spent, not by saying the reader is finished.
 *
 * A fixed set of five taught the wrong lesson. It made the examination a thing
 * you *complete*, and a chapter you have completed is a chapter you stop
 * thinking about.
 *
 * ## The confidence tap is the load-bearing control
 *
 * It looks like a flourish and it is the reason the feature works. A wrong
 * answer means two completely different things depending on how sure the reader
 * was, and without asking we cannot tell them apart:
 *
 * - **Wrong and unsure** is ordinary learning. The reveal slip is the whole
 *   response. Nothing is flagged and nothing follows.
 * - **Wrong and sure** is a belief that will not correct itself. The concept is
 *   flagged and comes back in a later sitting as a fresh question.
 *
 * Nothing is re-probed in the same sitting. A reader who has just been told they
 * were confidently wrong is the worst-placed person alive to reason about that
 * idea again, and asking twice would test their composure, not their grasp.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { bankStore, missStore } from '../storage/challenge.ts'
import { repository } from '../storage/index.ts'
import { summaryStore } from '../storage/summaries.ts'
import {
  chapterPath,
  type BookId,
  type BookMeta,
  type ManifestChapter,
  type Section,
} from '../structure/index.ts'
import { NoQuestions, writeBank } from '../challenge/generate.ts'
import { assemble } from '../challenge/serve.ts'
import type { Question, StoredQuestionBank } from '../challenge/types.ts'
import { Sitting } from './ChallengeSitting.tsx'
import { ChapterPicker } from './ChallengeChapters.tsx'
import styles from './challenge.module.css'

type Phase =
  /** Writing the first batch for a chapter nobody has been examined on. */
  | 'loading'
  /** A question is on screen. */
  | 'sitting'
  /** Fetching more, with the last question still behind the notice. */
  | 'refilling'
  /** Veda has nothing new for this chapter. */
  | 'caught-up'
  /** Something went wrong, or the chapter has no prose. */
  | 'empty'

export default function Challenge() {
  const { bookId } = useParams<{ bookId: string }>()
  const [params, setParams] = useSearchParams()
  const chapter = Number(params.get('chapter') ?? '1')

  const [book, setBook] = useState<BookMeta | undefined>()
  const [chapters, setChapters] = useState<readonly ManifestChapter[]>([])
  const [queue, setQueue] = useState<Question[]>([])
  const [at, setAt] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [trouble, setTrouble] = useState<string | undefined>()
  /*
   * What the Librarian called this chapter, when it has been summarised.
   * Empty otherwise — see `chapterTitle` below, which decides what is shown.
   */
  const [summaryTitle, setSummaryTitle] = useState('')

  const id = bookId as BookId | undefined
  const chapterId = chapterPath(chapter)

  /*
   * What to call this chapter, best source first.
   *
   * The Librarian's title is the best: it is what the reader saw on the recap.
   * The manifest's is next, and it is the one that exists for every chapter of
   * every book. `Chapter 7` is the floor and it must not outrank the manifest
   * — an earlier version fell back to it too eagerly and every unsummarised
   * chapter lost its real name.
   */
  const chapterTitle =
    summaryTitle ||
    chapters.find((entry) => entry.chapter === chapter)?.title ||
    `Chapter ${chapter}`

  /*
   * The bank as it stands, kept in a ref as well as in the database.
   *
   * A refill needs to tell Veda every stem she has already written, including
   * the ones from a batch fetched a minute ago. Reading the row back each time
   * would work; holding it here saves the round trip on the one path where the
   * reader is already waiting.
   */
  const bank = useRef<StoredQuestionBank | undefined>(undefined)

  /** The book's chapter list, for the picker. Read once per book. */
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      const [meta, manifest] = await Promise.all([
        repository.getBook(id),
        repository.getManifest(id),
      ])
      if (cancelled) return
      setBook(meta)
      setChapters(manifest?.chapters ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  /** The chapter's own bank, written on first arrival and kept after. */
  useEffect(() => {
    if (!id || !Number.isFinite(chapter)) return
    let cancelled = false

    const build = async () => {
      setPhase('loading')
      setTrouble(undefined)
      setQueue([])
      setAt(0)
      bank.current = undefined

      try {
        const [summary, manifest] = await Promise.all([
          summaryStore.get(id, chapterId),
          repository.getManifest(id),
        ])
        if (cancelled) return
        setSummaryTitle(summary?.chapterTitle ?? '')

        // Read here rather than off `chapters`, which this effect must not
        // depend on — it would re-run and rewrite the bank every time the
        // manifest arrived.
        const title =
          summary?.chapterTitle ||
          manifest?.chapters.find((entry) => entry.chapter === chapter)?.title ||
          `Chapter ${chapter}`

        /*
         * Lazy, and this is the one deliberately configurable knob.
         *
         * The first batch is written the first time this chapter is opened for
         * examination, then kept. Building on chapter-complete instead would
         * spend real money writing questions for the many chapters a reader
         * finishes and never tests.
         */
        let row = await bankStore.get(id, chapterId)
        if (!row) {
          const meta = await repository.getBook(id)
          const sections = await sectionsOf(id, chapter)
          if (cancelled) return
          const written = await writeBank(sections, {
            bookTitle: meta?.title ?? 'this book',
            author: meta?.author,
            chapter,
            chapterTitle: title,
            concepts: (summary?.concepts ?? []).map((entry) => entry.name),
          })
          if (cancelled) return
          row = {
            bookId: id,
            chapterId,
            chapter,
            chapterTitle: title,
            questions: written.questions,
            answered: [],
            builtAt: new Date().toISOString(),
            model: written.model,
          }
          await bankStore.save(row)
        }

        bank.current = row
        const flagged = await missStore.flagged()
        if (cancelled) return
        const list = assemble(row.questions, flagged, new Set(row.answered ?? []))
        setQueue(list.questions)

        if (list.questions.length > 0) setPhase('sitting')
        else setPhase(row.exhausted ? 'caught-up' : 'refilling')
      } catch (error: unknown) {
        if (cancelled) return
        setTrouble(sentenceFor(error))
        setPhase('empty')
      }
    }

    void build()
    return () => {
      cancelled = true
    }
  }, [id, chapter, chapterId])

  /**
   * Ask for more, and say so if there is no more to be had.
   *
   * Called when the reader walks off the end of the queue. It is the only
   * place that pays for a second call, and it never pays twice for the same
   * dry chapter — `exhausted` is written on the bank the first time.
   */
  const refill = useCallback(async () => {
    const row = bank.current
    if (!id || !row) return
    setPhase('refilling')
    try {
      const summary = await summaryStore.get(id, chapterId)
      const sections = await sectionsOf(id, chapter)
      const written = await writeBank(
        sections,
        {
          bookTitle: book?.title ?? 'this book',
          author: book?.author,
          chapter,
          chapterTitle: row.chapterTitle,
          concepts: (summary?.concepts ?? []).map((entry) => entry.name),
        },
        row.questions,
      )
      const next = await bankStore.append(id, chapterId, written.questions, written.model)
      if (!next) return
      bank.current = next

      const flagged = await missStore.flagged()
      const list = assemble(next.questions, flagged, new Set(next.answered ?? []))
      setQueue(list.questions)
      setAt(0)
      setPhase(list.questions.length > 0 ? 'sitting' : 'caught-up')
    } catch (error: unknown) {
      if (error instanceof NoQuestions && error.reason === 'exhausted') {
        await bankStore.markExhausted(id, chapterId)
        setPhase('caught-up')
        return
      }
      setTrouble(sentenceFor(error))
      setPhase('empty')
    }
  }, [id, chapter, chapterId, book])

  /**
   * On to the next one, and retire the one just answered.
   *
   * The id is written to the bank before the queue moves, so a reader who
   * closes the app mid-sitting does not meet that question again on their way
   * back in.
   */
  const onNext = useCallback(
    (answeredId: string) => {
      if (id) void bankStore.markAnswered(id, chapterId, answeredId)
      bank.current = bank.current && {
        ...bank.current,
        answered: [...new Set([...(bank.current.answered ?? []), answeredId])],
      }
      setAt((previous) => {
        const next = previous + 1
        if (next >= queue.length) void refill()
        return next
      })
    },
    [id, chapterId, queue.length, refill],
  )

  const pickChapter = useCallback(
    (next: number) => {
      setParams({ chapter: String(next) }, { replace: true })
    },
    [setParams],
  )

  const question = phase === 'sitting' ? queue[at] : undefined
  const backHref = id ? `/book/${id}` : '/'
  const answeredHere = bank.current?.answered?.length ?? 0

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.examiner}>
          <Link to={backHref} className={styles.leave} aria-label="Back to the book">
            <span aria-hidden="true">&larr;</span>
          </Link>
          <span className={styles.orb} aria-hidden="true" />
          <div className={styles.examinerText}>
            <div className={styles.who}>Veda&rsquo;s Examination</div>
            <div className={styles.of}>{book?.title ?? 'This book'}</div>
          </div>
        </header>

        {/*
          The chapter is chosen here, not decided by where the reader happens
          to be standing in the book. A reader who wants to test chapter two on
          a Sunday should not have to navigate to chapter two to do it.
        */}
        <ChapterPicker
          chapters={chapters}
          chapter={chapter}
          chapterTitle={chapterTitle}
          onPick={pickChapter}
        />

        {phase === 'loading' && (
          <div className={styles.card}>
            <p className={styles.waiting}>
              Veda is reading {chapterTitle || `chapter ${chapter}`} and writing your questions.
              This takes a moment.
            </p>
          </div>
        )}

        {phase === 'refilling' && (
          <div className={styles.card}>
            <p className={styles.waiting}>
              Veda is writing more questions on this chapter. She is looking for seams she has
              not tested yet.
            </p>
          </div>
        )}

        {phase === 'empty' && (
          <div className={styles.card}>
            <div className={styles.done}>
              <div className={styles.doneHead}>Nothing to ask yet</div>
              <p className={styles.doneNote}>
                {trouble ??
                  'This chapter has no questions waiting. Finish it and let Veda read it first.'}
              </p>
              <Link to={backHref} className={styles.doneBack}>
                Back to the book
              </Link>
            </div>
          </div>
        )}

        {/*
          The end of a chapter, and it is deliberately not a score.

          "You are all caught up" says the questions ran out, not that the
          reader ran out. Nothing here counts what they got right: a tally
          turns a sitting into a test, and the whole point of the confidence
          tap is that a wrong answer is worth having.
        */}
        {phase === 'caught-up' && (
          <div className={styles.card}>
            <div className={styles.done}>
              <div className={styles.doneHead}>You are all caught up on this chapter</div>
              <p className={styles.doneNote}>
                Veda has no new seams left here.{' '}
                {answeredHere > 0
                  ? 'Anything you answered confidently wrong comes back in a later sitting, as a new question.'
                  : ''}
              </p>
              <p className={styles.doneNote}>Pick another chapter above to keep going.</p>
              <Link to={backHref} className={styles.doneBack}>
                Back to the book
              </Link>
            </div>
          </div>
        )}

        {question && id && (
          <Sitting
            key={question.id}
            question={question}
            bookId={id}
            bookTitle={book?.title ?? 'this book'}
            chapter={chapter}
            chapterTitle={chapterTitle}
            onNext={() => onNext(question.id)}
          />
        )}

        <p className={styles.footnote}>Difficulty is Veda&rsquo;s to choose — you just answer.</p>
      </div>
    </div>
  )
}

/**
 * What to tell the reader, chosen by cause rather than copied from the error.
 *
 * The error's own message is written for a log. A chapter with nothing to ask
 * about will not improve by waiting, so it must not be offered a "try again"
 * that cannot work.
 */
function sentenceFor(error: unknown): string {
  if (error instanceof NoQuestions && error.reason !== 'no-model') {
    return 'Veda could not find enough of this chapter to ask about. Read a little further and come back.'
  }
  return 'Veda could not reach a model to write your questions. Try again in a minute.'
}

/**
 * Every section of one chapter, in reading order.
 *
 * `listSections` is what the summary engine uses for exactly this, so the
 * examination reads the book the same way the Librarian did. The manifest does
 * not carry section paths — retrieval goes through the section table.
 */
async function sectionsOf(bookId: BookId, chapter: number): Promise<Section[]> {
  const all = await repository.listSections(bookId)
  return all.filter((section) => section.chapter === chapter).sort((a, b) => a.section - b.section)
}
