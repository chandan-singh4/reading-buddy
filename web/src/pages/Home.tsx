import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { shelvesOf, type HomeShelves, type ShelfEntry } from '../app/homeShelves.ts'
import { readShelfMemory, writeShelfMemory } from '../app/shelfMemory.ts'
import { useCovers } from '../app/useCovers.ts'
import type { BookMeta } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import styles from './Home.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; shelves: HomeShelves; total: number }
  | { status: 'failed'; message: string }


/** "Good morning" / "Good afternoon" / "Good evening", by the clock. */
function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The front door: four curated shelves — Current Reading, Up Next, Unread,
 * Finished — rather than the whole collection. The full library — every book,
 * search, import, delete — lives at `/library` (`Library.tsx`, unchanged), one
 * tap away via the Unread shelf's "View All" or the drawer's "All Books".
 *
 * Finished is last on purpose. It is the only shelf that looks backwards, and
 * a screen whose job is "pick up where you left off" should not open with what
 * is already done — but a reader does want to see it, which is why it is here
 * at all rather than only in the library.
 *
 * Only Unread carries "View All": it is the shelf that is capped (at ten of
 * however many you own), so it is the only one where something is actually
 * being held back. Finished is uncapped — it simply scrolls.
 */
export default function Home() {
  // Seeded from the last visit, so a return paints the shelf on its first frame
  // rather than showing "Loading…" where the books were. A lazy initialiser: it
  // must read the memory on mount, not on every render.
  const [state, setState] = useState<LoadState>(() => {
    const memory = readShelfMemory()
    return memory ? { status: 'ready', ...memory } : { status: 'loading' }
  })
  const greeting = useMemo(() => greetingFor(new Date().getHours()), [])

  useEffect(() => {
    let cancelled = false

    Promise.all([repository.listBooks(), repository.listPositions()])
      .then(([books, positions]) => {
        if (cancelled) return
        const shelves = shelvesOf(books, positions)
        writeShelfMemory({ shelves, total: books.length })
        setState({ status: 'ready', shelves, total: books.length })
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
      <header className={styles.greeting}>
        <h1 className={styles.greetingTitle}>{greeting}, reader.</h1>
        <p className={styles.greetingSub}>Pick up where you left off.</p>
      </header>

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
        <Shelf title="Current Reading">
          <div className={styles.heroCard}>
            <BookTile
              entry={shelves.currentlyReading}
              coverSrc={covers.get(shelves.currentlyReading.book.id)}
              large
            />
          </div>
        </Shelf>
      )}

      {shelves.upNext.length > 0 && (
        <Shelf title="Up Next">
          <div className={styles.row}>
            {shelves.upNext.map((entry) => (
              <BookTile key={entry.book.id} entry={entry} coverSrc={covers.get(entry.book.id)} />
            ))}
          </div>
        </Shelf>
      )}

      {shelves.unread.length > 0 && (
        <Shelf title="Unread" viewAllTo="/library">
          <div className={styles.row}>
            {shelves.unread.map((book) => (
              <BookTile key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
            ))}
          </div>
        </Shelf>
      )}

      {shelves.finished.length > 0 && (
        <Shelf title="Finished">
          <div className={styles.row}>
            {shelves.finished.map((book) => (
              <BookTile key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
            ))}
          </div>
        </Shelf>
      )}
    </>
  )
}

/**
 * One shelf: a heading, its covers, and the wooden plank they stand on. The
 * plank is drawn under the row rather than behind it so the covers appear to
 * rest on it — that edge is what makes the screen read as a bookshelf instead
 * of a list of cards.
 */
function Shelf({
  title,
  viewAllTo,
  children,
}: {
  title: string
  viewAllTo?: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.shelf}>
      <div className={styles.shelfHead}>
        <h2 className={styles.shelfHeading}>{title}</h2>
        {viewAllTo && (
          <Link to={viewAllTo} className={styles.viewAll}>
            View All
          </Link>
        )}
      </div>

      {children}

      <div className={styles.plank} aria-hidden="true" />
    </section>
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
