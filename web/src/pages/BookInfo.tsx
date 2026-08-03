import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { useCovers } from '../app/useCovers.ts'
import { repository } from '../storage/index.ts'
import type { ReadingPosition } from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import styles from './BookInfo.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; book: BookMeta; position?: ReadingPosition }

const FORMAT_LABELS: Readonly<Record<BookMeta['source'], string>> = {
  epub: 'EPUB',
  pdf: 'PDF',
  docx: 'Word',
  md: 'Markdown',
  txt: 'Text',
}

const STARS = [1, 2, 3, 4, 5] as const

function readingStatus(position: ReadingPosition | undefined): string {
  if (!position) return 'Not started'
  if (position.percent !== undefined && position.percent >= 100) return 'Finished'
  if (position.percent !== undefined) return `Reading — ${position.percent}%`
  return 'Reading'
}

function dateOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * A book's own screen (WP-47) — reached from a shelf tile's "ⓘ", not from
 * tapping the cover, which still opens straight into the reader. Title,
 * author, format, status and a 1–5 rating live here; WP-48 and WP-49 add
 * quotes, mood and notes to the same page rather than inventing new ones.
 */
export default function BookInfo() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([repository.getBook(id), repository.getPosition(id)]).then(([book, position]) => {
      if (cancelled) return
      setState(book ? { status: 'ready', book, position } : { status: 'missing' })
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const covers = useCovers(useMemo(() => (state.status === 'ready' ? [id] : []), [state.status, id]))

  async function rate(value: number) {
    if (state.status !== 'ready') return
    // Tapping the star that already sets the rating clears it, so a
    // misplaced tap has a way back without a separate "clear" control.
    const next = state.book.rating === value ? undefined : value
    const book = state.book
    setState({ ...state, book: { ...book, rating: next } })
    await repository.rateBook(id, next)
  }

  if (state.status === 'loading') {
    return (
      <div className={styles.page}>
        <Link to="/" className={styles.back}>
          ← Home
        </Link>
        <p className={styles.pending}>Loading…</p>
      </div>
    )
  }

  if (state.status === 'missing') {
    return (
      <div className={styles.page}>
        <Link to="/" className={styles.back}>
          ← Home
        </Link>
        <p className={styles.pending}>This book isn’t on your shelf anymore.</p>
      </div>
    )
  }

  const { book, position } = state
  const startLabel = position ? 'Continue reading' : 'Start reading'

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← Home
      </Link>

      <div className={styles.hero}>
        <div className={styles.coverMedia}>
          <Cover title={book.title} src={covers.get(id)} />
        </div>
        <div className={styles.heroInfo}>
          <h1 className={styles.title}>{book.title}</h1>
          {book.author && <p className={styles.author}>{book.author}</p>}
          <div className={styles.tags}>
            <span className={styles.tag}>{FORMAT_LABELS[book.source]}</span>
            {book.subject && <span className={styles.tag}>{book.subject}</span>}
          </div>
        </div>
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Status</dt>
          <dd>{readingStatus(position)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Added</dt>
          <dd>{dateOf(book.importedAt)}</dd>
        </div>
        {position && (
          <div className={styles.fact}>
            <dt>Last read</dt>
            <dd>{dateOf(position.at)}</dd>
          </div>
        )}
      </dl>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Your rating</h2>
        <div className={styles.stars} role="group" aria-label="Rate this book">
          {STARS.map((value) => (
            <button
              key={value}
              type="button"
              className={styles.star}
              aria-pressed={book.rating !== undefined && value <= book.rating}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              onClick={() => rate(value)}
            >
              {book.rating !== undefined && value <= book.rating ? '★' : '☆'}
            </button>
          ))}
        </div>
      </section>

      <Link to={`/book/${id}`} className={styles.readButton}>
        {startLabel}
      </Link>
    </div>
  )
}
