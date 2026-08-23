/**
 * "Last time on…" — what the reader sees when they come back to a book.
 *
 * **This screen makes no model calls.** Every word on it was written earlier
 * and stored: the chapter recaps on the left, the confusion index on the right,
 * the place at the top. It works offline, it opens instantly, and it costs
 * nothing to open twice. That is the whole design, and it is why it ships
 * before the warm-paragraph mode that does call a model.
 *
 * The layout follows the dark `.welcome` block in the design file: a kicker, a
 * title, the place, a bar, then two columns — what you've read, what you worked
 * through — over a line that says where it all came from.
 *
 * Only chapters at or behind the reader's place are shown. The recaps stop
 * where the reader stopped (see `tutor/digest.ts`), so nothing here can reveal
 * a page they have not turned.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { fullTitle } from '../app/title.ts'
import { repository } from '../storage/index.ts'
import { digestStore } from '../storage/digests.ts'
import { placeOf, recapsOn, setRecapsOn } from '../tutor/refresh.ts'
import type { ReadingPosition, StoredChapterIndex, StoredDigest } from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import styles from './LastTime.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | {
      status: 'ready'
      book: BookMeta
      position?: ReadingPosition
      chapters: StoredChapterIndex[]
      digests: StoredDigest[]
    }

/** The chapter number inside a stored `chapterId` — `ch02` is 2. */
function numberOf(chapterId: string): number {
  return Number.parseInt(chapterId.replace(/^ch/, ''), 10)
}

/**
 * How long ago, in the words a person would use.
 *
 * Deliberately vague past a week. "You last read 23 days ago" is a number
 * nobody wanted; "a few weeks ago" is the thing they actually feel.
 */
function since(iso: string | undefined): string {
  if (!iso) return 'You have not read this one yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (Number.isNaN(days)) return 'You were here before'
  if (days <= 0) return 'You read this today'
  if (days === 1) return 'You read this yesterday'
  if (days < 7) return `You last read ${days} days ago`
  if (days < 14) return 'You last read about a week ago'
  if (days < 60) return 'You last read a few weeks ago'
  return 'You last read a long while ago'
}

/**
 * The confusion index, split back into the lines it was written as.
 *
 * The prompt asks for one line per confusion, so the newlines are the format
 * rather than an accident of wrapping. Bullets the model may have added are
 * trimmed, because this screen draws its own.
 */
function confusionLines(digest: string): string[] {
  return digest
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0)
}

export default function LastTime() {
  const { bookId } = useParams<{ bookId: string }>()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [on, setOn] = useState(recapsOn)

  useEffect(() => {
    let live = true
    if (!bookId) {
      setState({ status: 'missing' })
      return
    }
    const id = bookId as BookId

    void (async () => {
      const book = await repository.getBook(id)
      if (!live) return
      if (!book) {
        setState({ status: 'missing' })
        return
      }
      const [position, chapters, digests] = await Promise.all([
        repository.getPosition(id),
        repository.listChapterIndexes(id),
        digestStore.list(id),
      ])
      if (!live) return
      setState({ status: 'ready', book, position, chapters, digests })
    })()

    return () => {
      live = false
    }
  }, [bookId])

  const ready = state.status === 'ready' ? state : undefined

  /** The chapters with something stored, in reading order, up to the reader. */
  const shown = useMemo(() => {
    if (!ready) return []
    // No digest is shown for a chapter the reader has not reached. An
    // unreadable anchor means "show everything stored" rather than nothing:
    // the recaps already stop where the reader stopped.
    let here = Number.POSITIVE_INFINITY
    try {
      if (ready.position) here = placeOf(ready.position.anchor).chapter
    } catch {
      here = Number.POSITIVE_INFINITY
    }
    return ready.digests
      .map((digest) => ({
        digest,
        chapter: numberOf(digest.chapterId),
      }))
      .filter((entry) => Number.isFinite(entry.chapter) && entry.chapter <= here)
      .sort((a, b) => a.chapter - b.chapter)
      .map((entry) => ({
        ...entry,
        title:
          ready.chapters.find((index) => index.chapter === entry.chapter)?.title ??
          `Chapter ${entry.chapter}`,
      }))
  }, [ready])

  if (state.status === 'loading') {
    return <main className={styles.page} aria-busy="true" />
  }
  if (state.status === 'missing' || !ready) {
    return (
      <main className={styles.page}>
        <p className={styles.empty}>That book is not on this device.</p>
        <Link className={styles.back} to="/library">
          Back to the library
        </Link>
      </main>
    )
  }

  const percent = ready.position?.percent
  const recaps = shown.filter((entry) => entry.digest.contentRecap.length > 0)
  const confusions = shown.flatMap((entry) => confusionLines(entry.digest.conversationDigest))
  const latest = recaps[recaps.length - 1]

  return (
    <main className={styles.page}>
      <div className={styles.welcome}>
        <div className={styles.kicker}>Welcome back —</div>
        <h1 className={styles.title}>{fullTitle(ready.book.title, ready.book.subtitle)}</h1>
        <p className={styles.place}>
          {since(ready.position?.at)}
          {percent !== undefined ? ` · ${percent}% through` : ''}
          {latest ? ` · picking up at ${latest.title}` : ''}
        </p>
        {percent !== undefined ? (
          <div className={styles.bar}>
            <span style={{ width: `${percent}%` }} />
          </div>
        ) : null}

        <div className={styles.grid}>
          <section className={styles.col}>
            <h2>What you’ve read</h2>
            {recaps.length === 0 ? (
              <p className={styles.none}>
                No chapter has been recapped yet. Recaps are written as you read past each
                stretch of a chapter.
              </p>
            ) : (
              recaps.map((entry) => (
                <details key={entry.digest.chapterId} className={styles.chapter}>
                  <summary>{entry.title}</summary>
                  <p>{entry.digest.contentRecap}</p>
                </details>
              ))
            )}
          </section>

          <section className={styles.col}>
            <h2>What you worked through</h2>
            {confusions.length === 0 ? (
              <p className={styles.none}>
                Nothing yet. What you ask the tutor about turns up here.
              </p>
            ) : (
              confusions.map((line) => (
                <div key={line} className={styles.line}>
                  {line}
                </div>
              ))
            )}
          </section>
        </div>

        <p className={styles.foot}>
          {recaps.length === 0
            ? 'nothing stored yet · no page was re-read'
            : `assembled from ${recaps.length} stored chapter ${
                recaps.length === 1 ? 'digest' : 'digests'
              } · no page was re-read`}
        </p>
      </div>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => {
            setRecapsOn(event.target.checked)
            setOn(event.target.checked)
          }}
        />
        <span>
          Write recaps as I read
          <em>Each one is a paid call to the model, so it is off until you ask for it.</em>
        </span>
      </label>

      <Link className={styles.back} to={`/book/${ready.book.id}`}>
        Back to the book
      </Link>
    </main>
  )
}
