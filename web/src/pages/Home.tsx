import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { shelvesOf, type HomeShelves, type ShelfEntry } from '../app/homeShelves.ts'
import { useCovers } from '../app/useCovers.ts'
import type { BookMeta } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import styles from './Home.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; shelves: HomeShelves; total: number }
  | { status: 'failed'; message: string }

/**
 * The front door: a handful of curated shelves rather than the whole
 * collection — Currently Reading, Up Next, Unread, Finished. The full
 * library — every book, search, import, delete — lives at `/library`
 * (`Library.tsx`, unchanged), one tap away via "See all books".
 */
export default function Home() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    Promise.all([repository.listBooks(), repository.listPositions()])
      .then(([books, positions]) => {
        if (cancelled) return
        setState({ status: 'ready', shelves: shelvesOf(books, positions), total: books.length })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.home}>
      <h1 className={styles.title}>Home</h1>

      {state.status === 'loading' && <p className={styles.pending}>Loading…</p>}

      {state.status === 'failed' && (
        <div className={styles.error} role="alert">
          <p>Couldn’t open your shelf.</p>
          <p className={styles.pending}>{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && state.total === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No books yet</p>
          <p>
            Add some from <Link to="/library">your library</Link>.
          </p>
        </div>
      )}

      {state.status === 'ready' && state.total > 0 && <Shelves shelves={state.shelves} />}
    </div>
  )
}

function Shelves({ shelves }: { shelves: HomeShelves }) {
  const allBooks: BookMeta[] = useMemo(
    () => [
      ...(shelves.currentlyReading ? [shelves.currentlyReading.book] : []),
      ...shelves.upNext.map((entry) => entry.book),
      ...shelves.unread,
      ...shelves.finished,
    ],
    [shelves],
  )
  const covers = useCovers(useMemo(() => allBooks.map((book) => book.id), [allBooks]))

  return (
    <>
      {shelves.currentlyReading && (
        <section>
          <h2 className={styles.shelfHeading}>Currently reading</h2>
          <div className={styles.heroCard}>
            <BookTile
              entry={shelves.currentlyReading}
              coverSrc={covers.get(shelves.currentlyReading.book.id)}
              large
            />
          </div>
        </section>
      )}

      {shelves.upNext.length > 0 && (
        <section>
          <h2 className={styles.shelfHeading}>Up next</h2>
          <div className={styles.row}>
            {shelves.upNext.map((entry) => (
              <BookTile key={entry.book.id} entry={entry} coverSrc={covers.get(entry.book.id)} />
            ))}
          </div>
        </section>
      )}

      {shelves.unread.length > 0 && (
        <section>
          <h2 className={styles.shelfHeading}>
            Unread <span className={styles.pending}>({shelves.unreadTotal})</span>
          </h2>
          <div className={styles.row}>
            {shelves.unread.map((book) => (
              <BookTile key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
            ))}
          </div>
        </section>
      )}

      {shelves.finished.length > 0 && (
        <section>
          <h2 className={styles.shelfHeading}>Finished</h2>
          <div className={styles.row}>
            {shelves.finished.map((book) => (
              <BookTile key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
            ))}
          </div>
        </section>
      )}

      <Link to="/library" className={styles.seeAll}>
        See all books →
      </Link>
    </>
  )
}

function BookTile({
  entry,
  coverSrc,
  large = false,
}: {
  entry: ShelfEntry
  coverSrc?: string
  large?: boolean
}) {
  const { book, percent } = entry
  return (
    <div className={large ? `${styles.tile} ${styles.tileLarge}` : styles.tile}>
      <div className={styles.mediaWrap}>
        {/* Decorative duplicate of the tileInfo link below — the title link
            already reaches this book by keyboard/screen reader, so this one
            steps out of the tab order rather than announcing it twice. */}
        <Link to={`/book/${book.id}`} className={styles.tileMedia} aria-hidden="true" tabIndex={-1}>
          <Cover title={book.title} src={coverSrc} />
        </Link>
        <Link
          to={`/book/${book.id}/info`}
          className={styles.infoButton}
          aria-label={`About ${book.title}`}
        >
          ⓘ
        </Link>
      </div>
      <Link to={`/book/${book.id}`} className={styles.tileInfo}>
        <span className={styles.tileTitle}>{book.title}</span>
        {book.author && <span className={styles.tileAuthor}>{book.author}</span>}
        {percent !== undefined && <span className={styles.tileProgress}>{percent}% read</span>}
      </Link>
    </div>
  )
}
