import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { useOnVisit } from '../app/screenActive.tsx'
import { shelvesOf, type HomeShelves, type ShelfEntry } from '../app/homeShelves.ts'
import { warmLibrary } from '../app/libraryMemory.ts'
import { readShelfMemory, writeShelfMemory } from '../app/shelfMemory.ts'
import { loadCovers, useCovers, warmCovers } from '../app/useCovers.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { repository, unavailableBooks } from '../storage/index.ts'
import styles from './Home.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; shelves: HomeShelves; total: number }
  | { status: 'failed'; message: string }


/**
 * How long the first paint of a session will wait for cover art before giving
 * up and showing the shelf with placeholders.
 *
 * An indexed read of a dozen small blobs is a few milliseconds, so in practice
 * this is never reached — it is here so that a slow or damaged store degrades
 * to the old behaviour (placeholders, then art) instead of holding the app on
 * an empty screen. Short enough to pass for part of the launch.
 */
const COVER_WAIT_MS = 900

/** Every book the shelves will actually draw, in the order they appear. */
function shelfBookIds(shelves: HomeShelves): BookId[] {
  return [
    ...(shelves.currentlyReading ? [shelves.currentlyReading.book.id] : []),
    ...shelves.upNext.map((entry) => entry.book.id),
    ...shelves.unread.map((book) => book.id),
    ...shelves.finished.map((book) => book.id),
  ]
}

/** Resolves when `work` does, or after `ms`, whichever is first. */
function atMost(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    void work.then(() => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Who the greeting addresses.
 *
 * A constant rather than a setting: this is a single-reader app on a single
 * phone, and a name field in Settings would be four screens of plumbing for a
 * value that changes never. If it ever has to be editable, this is the one
 * place that has to learn where to read it from.
 */
const READER_NAME = 'Chandan'

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

  // On arrival rather than on mount. The screen is kept alive between visits now
  // (`app/screenActive.tsx`), so mounting happens once and is no longer the same
  // thing as the reader coming back — but the shelf still has to notice a book
  // deleted or renamed while they were on another tab.
  useOnVisit(() => {
    let cancelled = false

    // Whether this is the first paint of the session — nothing on screen yet, no
    // memory to have seeded it. See the wait below.
    const cold = readShelfMemory() === null

    Promise.all([repository.listBooks(), repository.listPositions()])
      .then(async ([listed, positions]) => {
        if (cancelled) return

        /*
         * Offline, the shelf listing includes books this device cannot open —
         * that is the point of it, and the library screen shows them greyed out.
         * Home is the exception: its whole job is "pick up where you left off",
         * and a front door offering four books that all refuse to open is a
         * worse answer than a shorter, true one. So here they are left out
         * rather than dimmed, and the full collection is one tap away.
         */
        const away = await unavailableBooks(listed)
        const books = away.size === 0 ? listed : listed.filter((book) => !away.has(book.id))
        const shelves = shelvesOf(books, positions)

        /*
         * At launch, the covers are fetched *before* the shelf is shown.
         *
         * Every other visit to Home is instant because something earlier warmed
         * the caches, and this is the one visit where nothing did: opening the
         * app went blank → shelf of coloured placeholder letters → real artwork
         * fading in a few milliseconds apart. Two swaps in the space of a blink,
         * on the screen the reader is looking straight at, which is why it read
         * as the page refreshing itself even after the rebuild was fixed.
         *
         * So the first paint waits for the reads it would otherwise race, and
         * the shelf appears once, finished. It costs a few milliseconds of blank
         * screen during a launch that already has some — and unlike a swap,
         * nothing the reader can see moves.
         *
         * Only when cold. A return must never wait: it already has the whole
         * shelf on screen, and holding *that* back would be the very flash this
         * is removing.
         */
        if (cold && books.length > 0) {
          await atMost(loadCovers(shelfBookIds(shelves)), COVER_WAIT_MS)
          if (cancelled) return
        }

        writeShelfMemory({ shelves, total: books.length })
        setState({ status: 'ready', shelves, total: books.length })

        // Every book, not just the ones on these three shelves. Home is the only
        // screen that reads the whole list, so this is the one place that knows
        // what the library will need before the reader asks for it — and it is a
        // screen or two ahead of them, which is exactly the head start needed for
        // the library to open with its covers already on it. See `warmCovers`.
        warmCovers(books.map((book) => book.id))

        // And the *data* the library opens with, for the same reason and at the
        // same moment. The covers were only half of that first-visit flash: the
        // other half was the library starting at "Loading…" while four indexed
        // reads ran. Warmed here, both halves are answered before the reader can
        // reach the screen that needs them. See `libraryMemory.ts`.
        warmLibrary()
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
  })

  return (
    <div className={styles.home}>
      <header className={styles.greeting}>
        <h1 className={styles.greetingTitle}>{greeting}, {READER_NAME}.</h1>
        <p className={styles.greetingSub}>Pick up where you left off.</p>
      </header>

      {/*
        Nothing at all while loading — deliberately, and not an oversight.
        "Loading…" is one more thing that appears and is then replaced by
        something else, and at launch it is on screen for roughly a frame. A
        word that flickers past under the greeting is indistinguishable from the
        page reloading; empty space for the same moment is invisible. The
        `failed` branch below is what the reader sees if it genuinely doesn't
        arrive.
      */}

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
