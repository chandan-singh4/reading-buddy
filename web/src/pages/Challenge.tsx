/**
 * Veda's Examination — the sitting itself.
 *
 * One question on the screen at a time, and nothing else: no score, no timer,
 * no difficulty. The reader is told plainly that difficulty is Veda's to
 * choose, because a visible level turns a wrong answer on a hard question into
 * an excuse and a wrong answer on an easy one into a humiliation.
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

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { bankStore, missStore } from '../storage/challenge.ts'
import { repository } from '../storage/index.ts'
import { summaryStore } from '../storage/summaries.ts'
import { chapterPath, type BookId, type BookMeta, type Section } from '../structure/index.ts'
import { NoQuestions, writeBank } from '../challenge/generate.ts'
import { assemble } from '../challenge/serve.ts'
import type { Question } from '../challenge/types.ts'
import { Sitting } from './ChallengeSitting.tsx'
import styles from './challenge.module.css'

type Phase = 'loading' | 'sitting' | 'empty'

export default function Challenge() {
  const { bookId } = useParams<{ bookId: string }>()
  const [params] = useSearchParams()
  const chapter = Number(params.get('chapter') ?? '1')

  const [book, setBook] = useState<BookMeta | undefined>()
  const [questions, setQuestions] = useState<Question[]>([])
  const [at, setAt] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [trouble, setTrouble] = useState<string | undefined>()
  const [chapterTitle, setChapterTitle] = useState('')

  const id = bookId as BookId | undefined

  useEffect(() => {
    if (!id || !Number.isFinite(chapter)) return
    let cancelled = false

    const build = async () => {
      setPhase('loading')
      setTrouble(undefined)
      try {
        const meta = await repository.getBook(id)
        if (cancelled) return
        setBook(meta)

        const chapterId = chapterPath(chapter)
        const summary = await summaryStore.get(id, chapterId)
        const title = summary?.chapterTitle ?? `Chapter ${chapter}`
        if (cancelled) return
        setChapterTitle(title)

        /*
         * Lazy, and this is the one deliberately configurable knob.
         *
         * The bank is written the first time this chapter is opened for
         * examination, then kept forever. Building on chapter-complete instead
         * would spend real money writing questions for the many chapters a
         * reader finishes and never tests.
         */
        let bank = await bankStore.get(id, chapterId)
        if (!bank) {
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
          bank = {
            bookId: id,
            chapterId,
            chapter,
            chapterTitle: title,
            questions: written.questions,
            builtAt: new Date().toISOString(),
            model: written.model,
          }
          await bankStore.save(bank)
        }

        const flagged = await missStore.flagged()
        if (cancelled) return
        const list = assemble(bank.questions, flagged)
        setQuestions(list.questions)
        setPhase(list.questions.length === 0 ? 'empty' : 'sitting')
      } catch (error: unknown) {
        if (cancelled) return
        /*
         * The error's own message is written for a log, not for a reader. The
         * page picks the sentence, and picks it by cause: a chapter with
         * nothing to ask about will not improve by waiting, so it must not be
         * offered a "try again" that cannot work.
         */
        setTrouble(
          error instanceof NoQuestions && error.reason === 'nothing-to-ask'
            ? 'Veda could not find enough of this chapter to ask about. Read a little further and come back.'
            : 'Veda could not reach a model to write your questions. Try again in a minute.',
        )
        setPhase('empty')
      }
    }

    void build()
    return () => {
      cancelled = true
    }
  }, [id, chapter])

  const onNext = useCallback(() => setAt((previous) => previous + 1), [])

  const question = questions[at]
  const backHref = id ? `/book/${id}` : '/'
  const finished = phase === 'sitting' && !question

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
            {/*
              Which book, which chapter — inside the header's own text column
              rather than in a paragraph beneath it. It used to sit outside and
              fake the alignment with a hard-coded left indent, which only held
              while the back arrow and the orb kept their exact widths.
            */}
            <p className={styles.ctx}>
              <b>{book?.title ?? 'This book'}</b>, Ch. {chapter}
              {chapterTitle ? ` · ${chapterTitle}` : ''}
            </p>
          </div>
        </header>

        {phase === 'sitting' && !finished && (
          <div className={styles.dots} aria-hidden="true">
            {questions.map((row, index) => (
              <span
                key={row.id}
                className={index < at ? styles.dotDone : index === at ? styles.dotOn : styles.dot}
              />
            ))}
          </div>
        )}

        {phase === 'loading' && (
          <div className={styles.card}>
            <p className={styles.waiting}>
              Veda is reading {chapterTitle || `chapter ${chapter}`} and writing your questions.
              This takes a moment — she only does it once per chapter.
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

        {phase === 'sitting' && question && id && (
          <Sitting
            key={question.id}
            question={question}
            bookId={id}
            bookTitle={book?.title ?? 'this book'}
            chapter={chapter}
            chapterTitle={chapterTitle}
            last={at === questions.length - 1}
            onNext={onNext}
          />
        )}

        {finished && (
          <div className={styles.card}>
            <div className={styles.done}>
              <div className={styles.doneHead}>Chapter check complete</div>
              <p className={styles.doneNote}>
                Veda has what she needs. Anything you answered confidently wrong, she will fold
                back into a later sitting rather than let it set.
              </p>
              <Link to={backHref} className={styles.doneBack}>
                Back to the book
              </Link>
            </div>
          </div>
        )}

        <p className={styles.footnote}>Difficulty is Veda&rsquo;s to choose — you just answer.</p>
      </div>
    </div>
  )
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
