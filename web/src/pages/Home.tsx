import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { useOnVisit } from '../app/screenActive.tsx'
import { shelvesOf, type HomeShelves, type ShelfEntry } from '../app/homeShelves.ts'
import { warmLibrary } from '../app/libraryMemory.ts'
import { readShelfMemory, writeShelfMemory } from '../app/shelfMemory.ts'
import { moveBooks } from '../app/shelfTransition.ts'
import { loadCovers, useCovers, warmCovers } from '../app/useCovers.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { repository, unavailableBooks } from '../storage/index.ts'
import { sessionStore } from '../stats/sessions.ts'
import { trajectoryOf, type Trajectory } from '../stats/trajectory.ts'
import { PaceHorizon, type PaceStatus } from './PaceHorizon.tsx'
import type { StoredSession } from '../storage/db.ts'
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
 *
 * That "few milliseconds" was only true of the device library for a while. On
 * the cloud backend the read went to Supabase and then R2, comfortably past this
 * cap, so the timeout fired on every launch and the reader met the placeholders
 * it exists to avoid. `app/coverStore.ts` is what made the sentence true again:
 * covers are read from the device first, and this is once more a safety net
 * rather than the normal path.
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

  /**
   * Which books were on which shelf, in what order, at the last paint.
   *
   * Only here to answer one question: did this re-read actually move anything?
   * Coming back from a book you merely looked at moves nothing, and starting a
   * crossing to animate nothing would make the whole app pause for 300 ms on
   * every visit to Home — a cost paid for a picture identical to the one already
   * on screen.
   *
   * Seeded from the state this component mounted with, which is the shelf the
   * reader is looking at right now: the *first* re-read after coming out of a
   * book is precisely the one that moves something, and it must not be missed.
   */
  const arrangement = useRef(
    state.status === 'ready' ? shelfBookIds(state.shelves).join() : '',
  )

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

        /*
         * A book read and closed has changed shelf — out of Unread and into
         * Current Reading — and the two are different parents in the tree
         * below, so React has no choice but to destroy its cover and build
         * another. `moveBooks` is what makes that invisible: the browser
         * photographs the cover on the shelf it was on and animates the picture
         * into its new place, remount and all. See `app/shelfTransition.ts`.
         *
         * Only when something genuinely moved, and a plain update otherwise.
         */
        const next = shelfBookIds(shelves).join()
        // An empty string means nothing was on screen to move from — the first
        // paint of a session. Crossing from no shelf to a shelf is a pause where
        // an appearance should be.
        const moved = arrangement.current !== '' && arrangement.current !== next
        arrangement.current = next

        const apply = () => {
          writeShelfMemory({ shelves, total: books.length })
          setState({ status: 'ready', shelves, total: books.length })
        }
        if (moved) moveBooks(apply)
        else apply()

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

  /*
   * The whole page waits, or none of it does.
   *
   * The greeting used to sit outside this gate while the shelf sat inside it.
   * On a cold launch the shelf waits for the database read and then up to
   * COVER_WAIT_MS for the artwork, so the reader got the greeting alone on an
   * empty page for about a second, and then the books dropped in underneath it.
   * Reported 2026-08-25: "that delay makes it feel lagging".
   *
   * A warm return never showed this, because the shelf memory above seeds the
   * first frame. So the fault was only ever on the launch — the one moment the
   * app is being judged for speed.
   *
   * Holding the greeting back does not make the wait longer. It makes it one
   * wait instead of two, and one thing arriving finished reads as faster than
   * two things arriving in pieces. The splash screen is what fills the moment,
   * which is what a splash screen is for.
   *
   * `failed` still draws the greeting: an error under a bare heading is a page,
   * and an error alone on white is a crash.
   */
  if (state.status === 'loading') return <div className={styles.home} aria-busy="true" />

  return (
    <div className={styles.home}>
      <header className={styles.greeting}>
        <h1 className={styles.greetingTitle}>{greeting}, {READER_NAME}.</h1>
        {/* An open question, not a caption. The line that used to sit here
            ("Pick up where you left off") described the shelf underneath it,
            which the shelf was already doing for itself. This one asks the
            reader something instead, so it earns its place. */}
        <p className={styles.greetingAsk}>What book are you picking up today?</p>
      </header>

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
      {/*
        All four shelves are drawn whether or not they have anything on them.

        They used to appear and disappear with their contents, which meant
        finishing a book could remove one shelf and add another, and everything
        below it moved. The screen is a bookshelf: a shelf with nothing on it is
        still a shelf, and keeping it there makes the front door a fixed place
        where each thing is always in the same spot.

        An empty one is never bare, though — see `Shelf`. A heading over a gap
        over a plank reads as something that failed to load, which is the exact
        impression this screen has spent several rounds removing.
      */}
      <Shelf title="Current Reading" empty={!shelves.currentlyReading} note="Open a book to begin.">
        {shelves.currentlyReading && (
          <div className={styles.heroCard}>
            <BookTile
              entry={shelves.currentlyReading}
              coverSrc={covers.get(shelves.currentlyReading.book.id)}
              large
              detail={<CurrentDetail entry={shelves.currentlyReading} />}
            />
          </div>
        )}
      </Shelf>

      <Shelf title="Up Next" empty={shelves.upNext.length === 0} note="Nothing lined up yet.">
        <div className={styles.row}>
          {shelves.upNext.map((entry) => (
            <BookTile key={entry.book.id} entry={entry} coverSrc={covers.get(entry.book.id)} />
          ))}
        </div>
      </Shelf>

      <Shelf
        title="Unread"
        viewAllTo="/library"
        empty={shelves.unread.length === 0}
        note="Nothing waiting to be started."
      >
        <div className={styles.row}>
          {shelves.unread.map((book) => (
            <BookTile key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
          ))}
        </div>
      </Shelf>

      <Shelf title="Finished" empty={shelves.finished.length === 0} note="Nothing finished yet.">
        <div className={styles.row}>
          {shelves.finished.map((book) => (
            <BookTile key={book.id} entry={{ book }} coverSrc={covers.get(book.id)} />
          ))}
        </div>
      </Shelf>
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
  empty = false,
  note,
  children,
}: {
  title: string
  viewAllTo?: string
  /** Whether this shelf has nothing on it — draw the plank and say so. */
  empty?: boolean
  /** The quiet line to stand in the gap. Each shelf says its own thing. */
  note?: string
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

      {/*
        The note takes the covers' place rather than sitting beside them, and it
        is one modest line high for every shelf — including Current Reading,
        whose hero tile is several times that. Holding a hero-sized hole open at
        the top of the screen would push everything else below the fold to say
        nothing at all.
      */}
      {empty ? <p className={styles.shelfEmpty}>{note}</p> : children}

      <div className={styles.plank} aria-hidden="true" />
    </section>
  )
}

/** `Sep 24`. Local, and never near a timezone. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/**
 * Everything else about the book in hand: where to go next, and when it ends.
 *
 * The shelf used to say "28% read" and stop, which left the one book the reader
 * is actually in the middle of as the book the app said least about on screen.
 * The finish date and the daily pace already existed — `trajectoryOf` works them
 * out for the book's own details page — and this brings them to the front door,
 * where "am I going to finish this?" is the question actually being asked.
 *
 * ## Why it stays quiet about a book it cannot forecast
 *
 * A trajectory needs about a quarter of an hour of reading and 5% of the book
 * before a finish date is worth printing. Until then the strip says so in one
 * line, rather than printing a date it would have to take back or leaving a gap
 * that reads as something which failed to load.
 */
/**
 * Minutes read on each of the last seven days, oldest first, this book only.
 *
 * Seven entries always, including the zeroes. A wave drawn from "the days you
 * read" would hide the days you did not, which are exactly the days the reader
 * is looking for. `StoredSession.day` is already the local calendar day, so
 * this never touches a timezone.
 */
function lastSevenDays(sessions: readonly StoredSession[], now: Date): number[] {
  const byDay = new Map<string, number>()
  for (const session of sessions) {
    byDay.set(session.day, (byDay.get(session.day) ?? 0) + session.activeMs)
  }

  const days: number[] = []
  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
    const key = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`
    days.push(Math.round((byDay.get(key) ?? 0) / 60000))
  }
  return days
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `trajectoryOf` writes its status for a reader; the strip wants it as a key. */
function statusKey(status: string): PaceStatus {
  if (status === 'Ahead') return 'ahead'
  if (status === 'Behind') return 'behind'
  return 'on_track'
}

function CurrentDetail({ entry }: { entry: ShelfEntry }) {
  const { book, percent } = entry
  const [pace, setPace] = useState<Trajectory | undefined>()
  const [week, setWeek] = useState<number[]>([])
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    // Only a book in progress, matching `BookInfo`: a finished book has no
    // finish to forecast, and one never opened has nothing to forecast from.
    if (percent === undefined || percent <= 0 || percent >= 100) {
      setPace(undefined)
      setSettled(true)
      return
    }
    let cancelled = false
    setSettled(false)
    sessionStore
      .forBook(book.id)
      .then((sessions) => {
        if (cancelled) return
        setPace(trajectoryOf(sessions, percent, new Date()))
        setWeek(lastSevenDays(sessions, new Date()))
        setSettled(true)
      })
      .catch(() => {
        if (cancelled) return
        setPace(undefined)
        setWeek([])
        setSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [book.id, percent])

  const finish = pace?.finishOn
  const forecast = pace !== undefined && !pace.calibrating && finish !== undefined

  return (
    <div className={styles.currentDetail}>
      {/*
        One button, not two. "Continue reading" was a third door onto the book —
        the cover opens it and so does the title — and a card whose most
        prominent control repeats what tapping anywhere else already does
        teaches the reader that the buttons are decoration.
        Chapter summaries is the only thing here that goes somewhere new.
      */}
      <Link to={`/book/${book.id}/chapters`} className={styles.currentAction}>
        Chapter summaries
      </Link>

      {/* Held back until the lookup answers. A strip that says "still learning"
          for a moment and then prints a date is a strip that changed its mind
          in front of the reader. */}
      {settled && (
        forecast ? (
          <PaceHorizon
            historicalMinutes={week}
            projectedDays={pace.daysRemaining}
            estimatedFinishDate={shortDate(finish)}
            pacePerDay={`${pace.velocity}m / day`}
            status={statusKey(pace.status)}
          />
        ) : (
          <div className={styles.trajectory}>
            <div className={styles.trajectoryHead}>
              <span className={styles.trajectoryKicker}>Trajectory</span>
            </div>
            <p className={styles.trajectoryNote}>
              {percent !== undefined && percent > 0
                ? 'Still learning how fast you read this one.'
                : 'Open it once and a finish date appears here.'}
            </p>
          </div>
        )
      )}
    </div>
  )
}

function BookTile({
  entry,
  coverSrc,
  large = false,
  detail,
}: {
  entry: ShelfEntry
  coverSrc?: string
  large?: boolean
  /**
   * Extra content for the column beside the cover — the hero's button and its
   * trajectory. It sits *inside* the tile rather than under it so that the
   * cover's own bottom edge is the bottom of the card, and the book can stand
   * on the plank instead of hovering above a strip of text.
   *
   * It cannot go inside `.tileInfo`, which is itself a link to the book: a
   * button nested in a link is a control the browser has no sane answer for.
   */
  detail?: ReactNode
}) {
  const { book, percent } = entry
  return (
    <div className={large ? `${styles.tile} ${styles.tileLarge}` : styles.tile}>
      <div className={styles.mediaWrap}>
        {/* Decorative duplicate of the tileInfo link below — the title link
            already reaches this book by keyboard/screen reader, so this one
            steps out of the tab order rather than announcing it twice. */}
        <Link to={`/book/${book.id}`} className={styles.tileMedia} aria-hidden="true" tabIndex={-1}>
          <Cover title={book.title} src={coverSrc} bookId={book.id} />
          {/* The fore edge, lit as far as you have read. Only on the hero: a
              row of six small covers each with a lit edge is a row of stripes,
              and the percentage is already printed under every one of them
              there. Nothing is drawn at 0% — an untouched book must not carry a
              mark that says it was started. */}
          {large && percent !== undefined && percent > 0 && (
            <span
              className={styles.spineFill}
              style={{ '--fill': `${Math.min(percent, 100)}%` } as CSSProperties}
            />
          )}
        </Link>
        <Link
          to={`/book/${book.id}/info`}
          className={styles.infoButton}
          aria-label={`About ${book.title}`}
        >
          ⓘ
        </Link>
      </div>
      <div className={detail ? styles.tileColumn : styles.tileColumnBare}>
        <Link to={`/book/${book.id}`} className={styles.tileInfo}>
          <span className={styles.tileTitle}>{book.title}</span>
          {book.author && <span className={styles.tileAuthor}>{book.author}</span>}
          {/* On the hero the fore edge says this, and says it better. Everywhere
              else the number is the only thing that can. */}
          {!large && percent !== undefined && (
            <span className={styles.tileProgress}>{percent}% read</span>
          )}
        </Link>
        {detail}
      </div>
    </div>
  )
}
