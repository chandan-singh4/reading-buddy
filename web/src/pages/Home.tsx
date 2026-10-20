/**
 * The split front door (WP-65): inhale and exhale.
 *
 * Two halves, one screen. The book is the dark board above; the journal is
 * paper below. Both doors are open at once, equally, at every hour — the app
 * does not guess which one the reader came for (`decisions.md`, 2026-10-18).
 *
 * ## Each half is a surface with zones, not one large button
 *
 * The common act in each half is direct: the cover and Resume go straight to
 * the saved page, the question and the circle go straight into a new entry.
 * Everything else in a half opens that half, and the other folds to a lip that
 * still reports its state. So the opened half *is* the home page — the app
 * gains no screen to hold the choice, it loses one.
 *
 * The "open this half" target is a button layered *behind* the content rather
 * than a `role="button"` wrapped around it. Links and buttons inside a button
 * are something the browser has no sane answer for, and the reader needs both.
 * See `.surface` in the stylesheet for how the layering works.
 *
 * ## What replaced what
 *
 * This screen used to be four curated shelves with a pace strip on the hero.
 * The shelf now lives in the opened reading half and, in full, at `/library` —
 * which already holds every book, search and filter. `PaceHorizon` stays on
 * the book's own details page; the front door keeps the forecast as one line.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { useOnVisit } from '../app/screenActive.tsx'
import { shelvesOf, type HomeShelves, type ShelfEntry } from '../app/homeShelves.ts'
import { warmLibrary } from '../app/libraryMemory.ts'
import { readShelfMemory, writeShelfMemory } from '../app/shelfMemory.ts'
import { moveBooks } from '../app/shelfTransition.ts'
import { loadCovers, useCovers, warmCovers } from '../app/useCovers.ts'
import { nudgeFor } from '../journal/prompts.ts'
import SpeakSheet from '../journal/SpeakSheet.tsx'
import type { BookId } from '../structure/index.ts'
import {
  entryStore,
  noteStore,
  repository,
  unavailableBooks,
  type EntryLink,
  type StoredEntry,
} from '../storage/index.ts'
import { minutesByDay, streakOf } from '../stats/gather.ts'
import { DAILY_MINUTES } from '../stats/goal.ts'
import { dayKey, sessionStore } from '../stats/sessions.ts'
import { trajectoryOf } from '../stats/trajectory.ts'
import styles from './Home.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; shelves: HomeShelves; total: number }
  | { status: 'failed'; message: string }

/** Which half is open. `both` is where the app starts, at every hour. */
type Door = 'both' | 'read' | 'write'

/** What the sheet was opened for. */
interface Writing {
  prompt?: string
  listen?: boolean
  link?: EntryLink
}

/** How the day is going on the board: the minutes, and the days before it. */
interface Day {
  minutes: number
  /** Consecutive days ending today, or yesterday while today is still empty. */
  streak: number
}

/** The reader's newest mark, as the door prints it. */
interface Mark {
  bookId: BookId
  anchor: unknown
  quote: string
}

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

/** Every book the shelf will actually draw, in the order it appears. */
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

/** `Sep 24`. Local, and never near a timezone. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** `Sun 19 Oct`, for the journal half's own date line. */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateLine(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** `19:04`. */
function clock(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The first line of an entry, however it was shaped. */
function firstLine(entry: StoredEntry): string {
  const words = (entry.title ?? entry.shaped?.text ?? entry.raw).trim().replace(/\s+/g, ' ')
  return words.length > 90 ? `${words.slice(0, 90).trimEnd()}…` : words
}

export default function Home() {
  // Seeded from the last visit, so a return paints the door on its first frame
  // rather than showing an empty screen where the book was. A lazy initialiser:
  // it must read the memory on mount, not on every render.
  const [state, setState] = useState<LoadState>(() => {
    const memory = readShelfMemory()
    return memory ? { status: 'ready', ...memory } : { status: 'loading' }
  })
  const [door, setDoor] = useState<Door>('both')
  const [writing, setWriting] = useState<Writing | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const [day, setDay] = useState<Day | null>(null)

  /**
   * Which books were on which shelf, in what order, at the last paint.
   *
   * Only here to answer one question: did this re-read actually move anything?
   * Coming back from a book you merely looked at moves nothing, and starting a
   * crossing to animate nothing would make the app pause for 300 ms on every
   * visit to Home — a cost paid for a picture identical to the one on screen.
   */
  const arrangement = useRef(
    state.status === 'ready' ? shelfBookIds(state.shelves).join() : '',
  )

  // On arrival rather than on mount. The screen is kept alive between visits
  // (`app/screenActive.tsx`), so mounting happens once and is no longer the
  // same thing as the reader coming back — but the door still has to notice a
  // book deleted or renamed while they were on another tab.
  useOnVisit(() => {
    let cancelled = false

    // Whether this is the first paint of the session — nothing on screen yet,
    // no memory to have seeded it. See the wait below.
    const cold = readShelfMemory() === null

    Promise.all([repository.listBooks(), repository.listPositions()])
      .then(async ([listed, positions]) => {
        if (cancelled) return

        /*
         * Offline, the shelf listing includes books this device cannot open —
         * that is the point of it, and the library screen shows them greyed
         * out. The front door is the exception: its whole job is "pick up where
         * you left off", and a door offering books that all refuse to open is a
         * worse answer than a shorter, true one.
         */
        const away = await unavailableBooks(listed)
        const books = away.size === 0 ? listed : listed.filter((book) => !away.has(book.id))
        const shelves = shelvesOf(books, positions)

        /*
         * At launch, the covers are fetched *before* the door is shown. Every
         * other visit is instant because something earlier warmed the caches,
         * and this is the one visit where nothing did. So the first paint waits
         * for the reads it would otherwise race, and the door appears once,
         * finished. Only when cold: a return must never wait.
         */
        if (cold && books.length > 0) {
          await atMost(loadCovers(shelfBookIds(shelves)), COVER_WAIT_MS)
          if (cancelled) return
        }

        const next = shelfBookIds(shelves).join()
        // An empty string means nothing was on screen to move from — the first
        // paint of a session. Crossing from no shelf to a shelf is a pause
        // where an appearance should be.
        const moved = arrangement.current !== '' && arrangement.current !== next
        arrangement.current = next

        const apply = () => {
          writeShelfMemory({ shelves, total: books.length })
          setState({ status: 'ready', shelves, total: books.length })
        }
        if (moved) moveBooks(apply)
        else apply()

        // Every book, not just the ones the door draws. This is the one screen
        // that reads the whole list, so it is the one place that knows what the
        // library will need before the reader asks for it.
        warmCovers(books.map((book) => book.id))

        // And the *data* the library opens with, for the same reason and at the
        // same moment. See `libraryMemory.ts`.
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

  const current = state.status === 'ready' ? state.shelves.currentlyReading : undefined
  const currentId = current?.book.id

  /*
   * The two things the board reports that are not on the shelf: how long the
   * reader read today, and the last thing they marked.
   *
   * A second visit read rather than part of the first, because neither can hold
   * the door back. The shelf is what the reader looks at; a minute count that
   * arrives a frame later arrives in a line that was already there.
   */
  useOnVisit(() => {
    let cancelled = false
    const now = new Date()
    /*
     * Every session, not only today's, because the streak is a run of days and
     * a window would cap it: a reader on day 41 of a 40-day window would be
     * told 40. The Statistics screen reads the same rows the same way, and
     * both numbers come from `stats/gather.ts` so the front door and the
     * Statistics screen can never disagree about them.
     */
    void sessionStore
      .all()
      .then((sessions) => {
        if (cancelled) return
        const byDay = minutesByDay(sessions)
        setDay({
          minutes: byDay.get(dayKey(now)) ?? 0,
          streak: streakOf(byDay, now).current,
        })
      })
      .catch(() => {
        if (cancelled) return
        setDay(null)
      })
    return () => {
      cancelled = true
    }
  })

  useEffect(() => {
    let cancelled = false
    if (currentId === undefined) {
      setMark(null)
      return
    }
    void noteStore
      .listNotes(currentId)
      .then((notes) => {
        if (cancelled) return
        /*
         * The reader's own marks only, and only the ones with words of the
         * book attached. A tutor answer is not something the reader marked,
         * and a note on a whole paragraph has no sentence to print.
         */
        const mine = notes
          .filter((note) => note.author === 'you' && note.quote)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        const newest = mine[0]
        setMark(
          newest
            ? { bookId: newest.bookId, anchor: newest.anchor, quote: newest.quote! }
            : null,
        )
      })
      .catch(() => {
        if (cancelled) return
        setMark(null)
      })
    return () => {
      cancelled = true
    }
  }, [currentId])

  /*
   * Nothing appears before it is finished.
   *
   * The greeting used to sit outside this gate while the shelf sat inside it,
   * so a cold launch showed a heading alone on an empty page for about a second
   * and then dropped the books in underneath it. Reported 2026-08-25: "that
   * delay makes it feel lagging". One wait reads as faster than two.
   */
  if (state.status === 'loading') return <div className={styles.door} aria-busy="true" />

  if (state.status === 'failed') {
    return (
      <div className={styles.door}>
        <div className={styles.error} role="alert">
          <p>Couldn’t open your shelf.</p>
          <p className={styles.pending}>{state.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.door} data-door={door}>
      <ReadingHalf
        shelves={state.shelves}
        total={state.total}
        open={door === 'read'}
        folded={door === 'write'}
        onOpen={() => setDoor(door === 'read' ? 'both' : 'read')}
        onUnfold={() => setDoor('both')}
        day={day}
      />

      {/*
        The bridge, on the seam — a strip between the halves rather than a pill
        floating over them.
        
        It used to be absolutely positioned on the seam, and it covered the
        bottom of the book and the top of the journal. Reported 2026-10-19:
        "the bridge hides the content behind it". A thing that sits between two
        halves belongs *in* the column with them, so now it takes its height
        from both instead of borrowing their words.

        It says what it does, because the reader also asked what the point of it
        was. The passage is here and nowhere else now: the reading half no
        longer repeats it under the title.
      */}
      {door === 'both' && mark && (
        <button
          type="button"
          className={styles.bridge}
          onClick={() =>
            setWriting({
              link: { bookId: mark.bookId, anchor: mark.anchor as never, quote: mark.quote },
            })
          }
        >
          <span className={styles.bridgeLabel}>Write about your last mark</span>
          <span className={styles.bridgeQuote}>“{mark.quote}”</span>
          <span className={styles.bridgeGo} aria-hidden="true">→</span>
        </button>
      )}

      <JournalHalf
        open={door === 'write'}
        folded={door === 'read'}
        onOpen={() => setDoor(door === 'write' ? 'both' : 'write')}
        onUnfold={() => setDoor('both')}
        onWrite={(prompt) => setWriting({ prompt })}
        onSpeak={() => setWriting({ listen: true })}
      />

      <SpeakSheet
        open={writing !== null}
        onClose={() => setWriting(null)}
        {...(writing?.prompt ? { prompt: writing.prompt } : {})}
        {...(writing?.listen ? { listenAtOnce: true } : {})}
        {...(writing?.link ? { link: writing.link } : {})}
      />
    </div>
  )
}

/**
 * The book half.
 *
 * The cover stands in the left of the half, bleeding to the edges, and the
 * words sit beside it. It used to be a small thumbnail with the title bottom-
 * aligned, which left the top third of the board empty. Reported 2026-10-19:
 * "there is a lot of space above the title".
 *
 * The passage the reader marked used to be repeated here under the title. It
 * is on the bridge now, and on the bridge only.
 */
function ReadingHalf({
  shelves,
  total,
  open,
  folded,
  onOpen,
  onUnfold,
  day,
}: {
  shelves: HomeShelves
  total: number
  open: boolean
  folded: boolean
  onOpen: () => void
  /* The lip always comes back to even, never on to the other half. */
  onUnfold: () => void
  day: Day | null
}) {
  const current = shelves.currentlyReading
  // Up Next first, then the unread, which is the order a reader would pick in.
  // Only the no-book face uses the two as one row: with no book in hand there
  // is nothing for the two shelves to be "also" and "next" to.
  const rest = useMemo(
    () => [...shelves.upNext, ...shelves.unread.map((book) => ({ book }) as ShelfEntry)],
    [shelves],
  )

  if (folded) {
    return (
      <section className={`${styles.half} ${styles.read}`}>
        <button type="button" className={styles.lip} onClick={onUnfold} aria-expanded={false}>
          <span className={styles.chip}>
            <span className={styles.breath} aria-hidden="true" />
            Read
          </span>
          <span className={styles.lipNote}>
            {current ? current.book.title : `${total} on the shelf`}
          </span>
        </button>
      </section>
    )
  }

  return (
    <section className={`${styles.half} ${styles.read}`}>
      <button
        type="button"
        className={styles.surface}
        onClick={onOpen}
        aria-expanded={open}
        aria-label={open ? 'Close the reading half' : 'Open the reading half'}
      />

      <div className={styles.face}>
        <div className={styles.faceHead}>
          {/* The filled dot is the breath drawn in. The words "inhale" and
              "exhale" are gone — the materials, the fold and these two marks
              carry it now. */}
          <span className={styles.chip}>
            <span className={styles.breath} aria-hidden="true" />
            Read
          </span>
          <span className={styles.spacer} />
          {day !== null && <DayMeasure day={day} />}
        </div>

        <div className={styles.readBody}>
          {current ? (
            /* The book and everything said about it, in one card. Bare on
               the board the cover and the words read as two things that happen
               to be side by side; a panel with its own edge makes them one
               object. Asked for 2026-10-20. */
            <div className={styles.card}>
              {/* Decorative: "Continue reading" below reaches the same page,
                  and the title above it names the book. Two targets for one
                  job, because thumbs reach differently. */}
              {/* The book and its measure, as one column: the bar takes its
                  width from the cover above it, which is what makes the two
                  read as one object. Asked for again 2026-10-20, after a round
                  with the bar down among the words. */}
              <div className={styles.coverSide}>
                <Link
                  to={`/book/${current.book.id}`}
                  className={styles.coverLink}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <ShelfCover entry={current} />
                </Link>
                {current.percent !== undefined && <Progress percent={current.percent} />}
              </div>

              <div className={styles.readColumn}>
                <h1 className={styles.bookTitle}>{current.book.title}</h1>
                {current.book.author !== undefined && (
                  <p className={styles.bookAuthor}>{current.book.author}</p>
                )}
                <Link to={`/book/${current.book.id}`} className={styles.resume}>
                  Continue reading →
                </Link>
                <Link to={`/book/${current.book.id}/chapters`} className={styles.summaries}>
                  <span className={styles.summariesGlyph} aria-hidden="true">
                    ▤
                  </span>
                  Chapter summaries
                </Link>
                {/* With the book, not in the half's footer. Opened, the shelf
                    stands between the two, and a finish date under a row of
                    other books reads as a fact about those books. */}
                <Link to={`/book/${current.book.id}/info`} className={styles.summaries}>
                  <span className={styles.summariesGlyph} aria-hidden="true">
                    ⓘ
                  </span>
                  Book details
                </Link>
                <Forecast entry={current} />
              </div>
            </div>
          ) : (
            /* No book on the go, so the door does not presume a page to
               resume: the shelf stands in the face instead. */
            <div className={styles.readColumn}>
              <span className={styles.locline}>Nothing on the go</span>
              <h1 className={styles.bookTitle}>{total > 0 ? 'Pick one up' : 'No books yet'}</h1>
              {total > 0 ? (
                <ShelfRow entries={rest} />
              ) : (
                <p className={styles.marked}>
                  Add some from <Link to="/library">your library</Link>.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Only once the half is open. The room the fold frees is what the
            shelves are shown in — that is what makes the fold worth making.
            One shelf, named. It holds the books already in progress: the
            unread belong to the Library, which is one tap away in the footer
            and holds all 44 of them with search and filters. */}
        {open && current && (
          <div className={styles.shelves}>
            <Shelf label="Also reading" entries={shelves.upNext} />
          </div>
        )}

        <div className={styles.faceFoot}>
          <span className={styles.spacer} />
          <Link to="/library" className={styles.footLink}>
            Library ({total}) →
          </Link>
        </div>
      </div>
    </section>
  )
}

/** `1h 03m`, or `47m`. The same shape the Statistics screen prints. */
function clockOf(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/**
 * How the day is going: the two hours, and the run of days behind it.
 *
 * Both numbers come from `stats/gather.ts` and `stats/goal.ts`, which the
 * Statistics screen already uses. A second copy of either on the front door
 * would be a number that can disagree with the one on Statistics.
 *
 * The streak stands with the two hours, not in the top bar. It went up there
 * for one round and came back: the bar is shared with the Library, Statistics
 * and Settings, and the run of days is a fact about *today's reading*, so it
 * belongs with the minutes it is a run of.
 *
 * The journal still has no streak of its own, and that stands: a streak turns a
 * journal into a duty, and the night a reader does not feel like writing is the
 * night a streak tells them they failed. Reading is a habit the reader asked to
 * be shown. Writing is not.
 */
function DayMeasure({ day }: { day: Day }) {
  const done = Math.min(Math.round((day.minutes / DAILY_MINUTES) * 100), 100)
  const met = day.minutes >= DAILY_MINUTES
  return (
    <span className={styles.measure}>
      {day.streak > 0 && (
        <span className={styles.streak}>
          <span className={styles.flame} aria-hidden="true">
            🔥
          </span>
          {day.streak} {day.streak === 1 ? 'day' : 'days'}
        </span>
      )}
      <span className={met ? `${styles.goalWords} ${styles.met}` : styles.goalWords}>
        {clockOf(day.minutes)} / 2h
      </span>
      <span
        className={met ? `${styles.ring} ${styles.met}` : styles.ring}
        style={{ '--done': `${done}%` } as CSSProperties}
        role="img"
        aria-label={`${clockOf(day.minutes)} of your two hours today`}
      />
    </span>
  )
}

/** The journal half. */
function JournalHalf({
  open,
  folded,
  onOpen,
  onUnfold,
  onWrite,
  onSpeak,
}: {
  open: boolean
  folded: boolean
  onOpen: () => void
  /* The lip always comes back to even, never on to the other half. */
  onUnfold: () => void
  onWrite: (prompt: string) => void
  onSpeak: () => void
}) {
  const [entries, setEntries] = useState<StoredEntry[] | null>(null)
  const nudge = useMemo(() => nudgeFor(new Date()), [])
  const today = useMemo(() => dateLine(new Date()), [])

  useOnVisit(() => {
    let cancelled = false
    void entryStore
      .listEntries()
      .then((rows) => {
        if (cancelled) return
        setEntries(rows)
      })
      .catch(() => {
        if (cancelled) return
        setEntries([])
      })
    return () => {
      cancelled = true
    }
  })

  const all = entries ?? []
  const last = all[0]
  const todayKey = new Date().toDateString()
  const mine = all.filter((entry) => new Date(entry.at).toDateString() === todayKey)

  if (folded) {
    return (
      <section className={`${styles.half} ${styles.write}`}>
        <button type="button" className={styles.lip} onClick={onUnfold} aria-expanded={false}>
          <span className={styles.chip}>
            <span className={`${styles.breath} ${styles.out}`} aria-hidden="true" />
            Journal
          </span>
          <span className={styles.lipNote}>
            {mine.length > 0
              ? `${mine.length} today · last at ${clock(mine[0]!.at)}`
              : 'Nothing written today'}
          </span>
        </button>
      </section>
    )
  }

  return (
    <section className={`${styles.half} ${styles.write}`}>
      <button
        type="button"
        className={styles.surface}
        onClick={onOpen}
        aria-expanded={open}
        aria-label={open ? 'Close the journal half' : 'Open the journal half'}
      />

      <div className={styles.face}>
        <div className={styles.faceHead}>
          <span className={styles.chip}>
            <span className={`${styles.breath} ${styles.out}`} aria-hidden="true" />
            Journal
          </span>
          <span className={styles.spacer} />
          <span className={styles.plain}>{today}</span>
        </div>

        <div className={styles.writeBody}>
          <span className={styles.kicker}>{nudge.label}</span>
          {/*
            The question is the way in, so it is the control. A blank page is a
            wall; a question is a door — and the reader who taps it lands in the
            box with the question still on screen.
          */}
          <button
            type="button"
            className={styles.prompt}
            onClick={() => onWrite(nudge.question)}
          >
            {nudge.question}
          </button>
          <p className={styles.hint}>Tap to write, or press the circle and just talk.</p>

          <div className={styles.writeRow}>
            <button
              type="button"
              className={styles.circle}
              onClick={onSpeak}
              aria-label="Speak an entry"
            >
              <span aria-hidden="true" />
            </button>
            <span className={styles.circleWords}>
              <b>Speak it instead</b>
              <span>The screen stays awake while you talk</span>
            </span>
          </div>

          {open && mine.length > 0 && (
            <div className={styles.recent}>
              <span className={styles.kicker}>Earlier today</span>
              <ul className={styles.recentList}>
                {mine.map((entry) => (
                  <li key={entry.id}>
                    <Link to={`/journal/${entry.id}`} className={styles.recentEntry}>
                      <time dateTime={entry.at}>{clock(entry.at)}</time>
                      <span>{firstLine(entry)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.faceFoot}>
          {last && <span className={styles.lastLine}>“{firstLine(last)}”</span>}
          <span className={styles.spacer} />
          <Link to="/journal" className={styles.footLink}>
            Archive ({all.length}) →
          </Link>
        </div>
      </div>
    </section>
  )
}

/**
 * The finish forecast, as one line.
 *
 * The full strip (`PaceHorizon`) stays on the book's own details page. The
 * front door is asking "am I going to finish this?", and one line answers it
 * without taking a quarter of the half to do so.
 */
function Forecast({ entry }: { entry: ShelfEntry }) {
  const { book, percent } = entry
  const [words, setWords] = useState<Finish | string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (percent === undefined || percent <= 0 || percent >= 100) {
      setWords(null)
      return
    }
    void sessionStore
      .forBook(book.id)
      .then((sessions) => {
        if (cancelled) return
        const pace = trajectoryOf(sessions, percent, new Date())
        if (pace === undefined || pace.calibrating || pace.finishOn === undefined) {
          setWords('Still learning how fast you read this one.')
          return
        }
        setWords({ on: shortDate(pace.finishOn), velocity: pace.velocity })
      })
      .catch(() => {
        if (cancelled) return
        setWords(null)
      })
    return () => {
      cancelled = true
    }
  }, [book.id, percent])

  if (words === null) return null
  // Calibrating still says it in words. There is no figure to draw yet, and a
  // drawn gauge of an unknown is a claim.
  if (typeof words === 'string') return <span className={styles.forecast}>{words}</span>

  return (
    <span
      className={styles.forecast}
      role="img"
      aria-label={`Finishing ${words.on}, at ${words.velocity} minutes a day`}
    >
      <span className={styles.figure}>
        <span className={styles.figureGlyph} aria-hidden="true">
          ⚑
        </span>
        <span className={styles.figureValue}>{words.on}</span>
      </span>
      <span className={styles.figure}>
        <span className={styles.figureGlyph} aria-hidden="true">
          ◷
        </span>
        <span className={styles.figureValue}>{words.velocity}m / day</span>
      </span>
    </span>
  )
}

/** The day a book lands on, and the pace that gets it there. */
interface Finish {
  on: string
  velocity: number
}

/**
 * How far in, drawn rather than said.
 *
 * "76% · where you stopped" spent a line of the board on four words that the
 * bar says on its own. The numeral stays because a bar alone cannot be read to
 * the percent, and a reader who wants the figure wants the figure.
 *
 * The bar runs the width of the card's words and the figure sits under it. It
 * was beside the bar, under the cover; it now closes the block the same way the
 * shelf tiles below close theirs, so the two read as the same measure.
 */
function Progress({ percent }: { percent: number }) {
  return (
    <span
      className={styles.progress}
      role="img"
      aria-label={`${percent}% read`}
      style={{ '--read': `${percent}%` } as CSSProperties}
    >
      <span className={styles.progressTrack} />
      <span className={styles.progressValue}>{percent}% complete</span>
    </span>
  )
}

/**
 * One named shelf. It goes when it is empty, rather than printing a heading
 * over nothing — an empty "Up next" is a shelf the reader has to read to learn
 * it holds nothing.
 */
function Shelf({ label, entries }: { label: string; entries: ShelfEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className={styles.shelf}>
      <h2 className={styles.shelfLabel}>{label}</h2>
      <ShelfRow entries={entries} />
    </section>
  )
}

/** The shelf, in the room a fold frees. */
function ShelfRow({ entries }: { entries: ShelfEntry[] }) {
  const covers = useCovers(useMemo(() => entries.map((entry) => entry.book.id), [entries]))

  if (entries.length === 0) {
    return <p className={styles.marked}>Nothing else waiting.</p>
  }

  return (
    <div className={styles.shelfRow}>
      {entries.map((entry) => (
        <Link
          key={entry.book.id}
          to={`/book/${entry.book.id}`}
          className={styles.shelfTile}
        >
          <span className={styles.shelfArt}>
            <Cover
              title={entry.book.title}
              src={covers.get(entry.book.id)}
              bookId={entry.book.id}
            />
          </span>
          <span className={styles.shelfTitle}>{entry.book.title}</span>
          {/* Always rendered, empty or not. A book with no author would pull
              its own "% read" up a line and break the row. */}
          <span className={styles.shelfAuthor}>{entry.book.author ?? ''}</span>
          {entry.percent !== undefined && (
            <>
              {/* The same measure the card above draws, thinner. A bare figure
                  on a placeholder cover read as unfinished styling. */}
              <span
                className={styles.shelfTrack}
                style={{ '--read': `${entry.percent}%` } as CSSProperties}
              />
              <span className={styles.shelfPercent}>{entry.percent}% read</span>
            </>
          )}
        </Link>
      ))}
    </div>
  )
}

/** The book in hand, drawn as a cover. Its own hook, so the row keeps one. */
function ShelfCover({ entry }: { entry: ShelfEntry }) {
  const covers = useCovers(useMemo(() => [entry.book.id], [entry.book.id]))
  return (
    <span className={styles.coverArt}>
      <Cover
        title={entry.book.title}
        src={covers.get(entry.book.id)}
        bookId={entry.book.id}
      />
    </span>
  )
}
