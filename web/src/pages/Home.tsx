import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { shelvesOf, type HomeShelves, type ShelfEntry } from '../app/homeShelves.ts'
import { bookLook } from '../app/shelfLook.ts'
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
 * The front door: a bookcase, not a list.
 *
 * Three curated shelves — Current Reading, Up Next, Unread — plus an empty
 * bottom shelf holding the slot a new book goes into. The whole collection —
 * every book, search, import, delete — lives at `/library` (`Library.tsx`),
 * one tap away via the Unread shelf's "View All", the empty slot, or the
 * drawer's "All Books".
 *
 * The furniture is a single piece: one case with sides, a back panel and
 * shelves cut into it, rather than three separate cards each with a plank
 * underneath. That is the difference between "a shelf motif" and a bookcase —
 * the shadow at the top of one shelf is cast by the board above it, which only
 * makes sense if the boards belong to the same object.
 */
export default function Home() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const greeting = useMemo(() => greetingFor(new Date().getHours()), [])

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
        <div className={styles.bookcase}>
          <Shelf label="Your library">
            <div className={styles.emptyShelf}>
              <p className={styles.emptyTitle}>No books yet</p>
              <p className={styles.emptyLine}>
                Add some from <Link to="/library">your library</Link>.
              </p>
            </div>
          </Shelf>
          <AddShelf />
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
    ],
    [shelves],
  )
  const covers = useCovers(useMemo(() => allBooks.map((book) => book.id), [allBooks]))

  return (
    <div className={styles.bookcase}>
      {shelves.currentlyReading && (
        <Shelf label="Currently reading">
          <BookRow>
            <Book
              entry={shelves.currentlyReading}
              coverSrc={covers.get(shelves.currentlyReading.book.id)}
              hero
            />
          </BookRow>
        </Shelf>
      )}

      {shelves.upNext.length > 0 && (
        <Shelf label="Up next">
          <BookRow>
            {shelves.upNext.map((entry) => (
              <Book key={entry.book.id} entry={entry} coverSrc={covers.get(entry.book.id)} />
            ))}
          </BookRow>
        </Shelf>
      )}

      {shelves.unread.length > 0 && (
        <Shelf label="Unread" viewAllTo="/library">
          <BookRow>
            {shelves.unread.map((book) => (
              <Book key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
            ))}
          </BookRow>
        </Shelf>
      )}

      <AddShelf />
    </div>
  )
}

/**
 * One shelf of the case: the recess the books stand in, and the board they
 * stand on.
 *
 * The label is engraved into the board's front edge rather than floated above
 * the books as a heading. On a bookcase that edge is the only surface a label
 * has ever belonged on, and it buys back the whole line of vertical space a
 * heading used to cost — which on a phone is most of a book.
 */
function Shelf({
  label,
  viewAllTo,
  children,
}: {
  label: string
  viewAllTo?: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.shelf} aria-label={label}>
      <div className={styles.recess}>{children}</div>

      <div className={styles.board}>
        <h2 className={styles.boardLabel}>{label}</h2>
        {viewAllTo && (
          <Link to={viewAllTo} className={styles.viewAll}>
            View all
          </Link>
        )}
      </div>
    </section>
  )
}

/**
 * The books on one board. Scrolls sideways rather than wrapping — a shelf of
 * covers reads as a shelf only if it behaves like one — and the books are
 * aligned by their *feet*, which is what lets each one be its own height.
 */
function BookRow({ children }: { children: React.ReactNode }) {
  return <div className={styles.row}>{children}</div>
}

/**
 * A book standing on a plank.
 *
 * Its height, its lean and the depth of its page block come from `bookLook`,
 * seeded on the book's id, so the shelf has the unevenness a real one has and
 * a given book still looks the same every time it is drawn.
 *
 * The metadata sits *on* the book — a plate across the foot of the cover, the
 * way a library sticks its own label there — rather than in a caption
 * underneath. A caption under a book breaks the one thing the whole screen is
 * built on: that the book is resting on the board and nothing is between them.
 */
function Book({
  entry,
  coverSrc,
  hero = false,
}: {
  entry: ShelfEntry
  coverSrc?: string
  hero?: boolean
}) {
  const { book, percent } = entry
  const look = bookLook(book.id)

  return (
    <article
      className={hero ? `${styles.slot} ${styles.slotHero}` : styles.slot}
      style={
        {
          '--book-height': look.height,
          '--book-lean': `${look.lean}deg`,
          '--book-thickness': look.thickness,
        } as React.CSSProperties
      }
    >
      <Link to={`/book/${book.id}`} className={styles.book} title={book.title}>
        <span className={styles.face}>
          <Cover title={book.title} src={coverSrc} />
        </span>

        <span className={styles.plate}>
          <span className={styles.plateTitle}>{book.title}</span>
          {book.author && <span className={styles.plateAuthor}>{book.author}</span>}
        </span>

        {percent !== undefined && (
          <>
            {/* The gilt line along the foot of the book. Decorative — the
                figure itself is announced by the sibling below, so a screen
                reader hears "62% read" rather than nothing at all. */}
            <span
              className={styles.gauge}
              style={{ '--percent': `${percent}%` } as React.CSSProperties}
              aria-hidden="true"
            />
            <span className={styles.srOnly}>{percent}% read</span>
          </>
        )}
      </Link>

      <Link
        to={`/book/${book.id}/info`}
        className={styles.infoButton}
        aria-label={`About ${book.title}`}
      >
        <InfoIcon />
      </Link>
    </article>
  )
}

/**
 * The bottom shelf, kept empty on purpose: the slot a new book goes into.
 *
 * Drawn as a gap in the row of books rather than a button floated over the
 * furniture — the whole point of the case is that everything on this screen is
 * an object on it, and "somewhere to put the next one" is the most natural
 * object an empty shelf can hold.
 */
function AddShelf() {
  return (
    <section className={styles.shelf} aria-label="Add a book">
      <div className={styles.recess}>
        <div className={styles.row}>
          <Link to="/library" className={styles.addSlot}>
            <span className={styles.addMark} aria-hidden="true">
              <PlusIcon />
            </span>
            <span className={styles.addLabel}>Add book</span>
          </Link>
        </div>
      </div>

      <div className={styles.board}>
        <h2 className={styles.boardLabel}>Room for more</h2>
      </div>
    </section>
  )
}

/*
 * The two icons on this screen, drawn rather than typed.
 *
 * They used to be the characters `ⓘ` and `+`. A glyph is whatever the device's
 * font decides it is — `ⓘ` comes out as a serif circle on one Android build
 * and a heavy sans one on another, and neither matches anything else in the
 * app — so both are authored here at one stroke weight, sized in `em` and
 * coloured by `currentColor`, which is what makes them behave like the rest of
 * the interface rather than like text that happens to look like a symbol.
 */

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 7.1v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M8 2.6v10.8M2.6 8h10.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
