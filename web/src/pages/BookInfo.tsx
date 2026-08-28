import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { forgetLibraryMemory } from '../app/libraryMemory.ts'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { fullTitle } from '../app/title.ts'
import { forgetCovers, useCovers } from '../app/useCovers.ts'
import { catalogueDeps, refreshBook } from '../catalogue/index.ts'
import { isOutOfDate, reparseBooks } from '../import/index.ts'
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

/** Re-reading this one book from the file it was imported from. */
type UpdateState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done' }
  | { status: 'failed'; message: string }

/** Asking Google about this one book. */
type CatalogueState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'matched' }
  /** Asked, and genuinely not in the catalogue. A real answer, said as one. */
  | { status: 'unmatched' }
  /** Never asked — the network, not the book. Said differently on purpose. */
  | { status: 'failed'; message: string }

/**
 * The one control at the top left, which is not always the same control.
 *
 * Reached from the shelf, this page is a destination and the way out is home.
 * Reached from inside the book — by tapping its title in the reading overlay —
 * it is a detour, and the reader wants the page they were on, not the library.
 * A home icon there throws away their place in a way that looks deliberate.
 *
 * The reading page says where it sent them from in the router's `state`, so
 * this needs no history guessing and behaves the same on a cold load of the URL
 * (no state, so: home).
 *
 * ## Back goes back, it does not go *to*
 *
 * The arrow pops history rather than navigating to the book, and that is the
 * whole point of it. Navigating pushes a third entry — book, About, book — so
 * the phone's own back gesture then walks the reader between the last two for
 * ever and can never reach the shelf. Popping leaves the stack as it was before
 * the detour, so the next back gesture goes where it always would have.
 *
 * It keeps a real `href` regardless: the link must still be a link to a long
 * press, to a screen reader, and to anyone opening it in a new tab.
 */
function ExitControl({ bookId, fromReader }: { bookId: string; fromReader: boolean }) {
  const navigate = useNavigate()

  if (fromReader) {
    return (
      <Link
        to={`/book/${bookId}`}
        className={styles.back}
        aria-label="Back to the book"
        onClick={(event) => {
          // Leave the modified clicks alone — those are "open it elsewhere",
          // and the browser's own handling of them is right.
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return
          event.preventDefault()
          navigate(-1)
        }}
      >
        <Icon name="back" />
      </Link>
    )
  }
  return (
    <Link to="/" className={styles.back} aria-label="Home">
      <Icon name="home" />
    </Link>
  )
}

/**
 * Google's subject headings, cut into single terms.
 *
 * They arrive as paths — `Body, Mind & Spirit / Mindfulness & Meditation` —
 * and a book carries a dozen of them that overlap heavily, so the card filled
 * with long chips that said "Philosophy" four times in four different phrases.
 * Cut on the slash and the same word appears once, which is what a tag is for.
 *
 * Two rules beyond the split:
 *
 * - Matching is case-insensitive, but the first spelling seen is the one kept.
 *   Google is not consistent about case and the reader should not see both.
 * - A bare `General` is dropped. It is the filler at the end of a path
 *   (`Body, Mind & Spirit / General`) and says nothing on its own; the part of
 *   the path before it is already a chip.
 * - A machine token is dropped. An EPUB's `dc:subject` is copied out of the
 *   file verbatim, and a publishing pipeline sometimes leaves its own field
 *   names in there — `review_metadata` turned up as the only "subject" on a
 *   real book. The test is deliberately narrow: no space *and* an underscore.
 *   A heading a person wrote is words, so it has a space or it is a plain one;
 *   `Self-Help` and `Philosophy` are untouched by this.
 *
 * Order is first-seen, so the headings Google thought most important stay in
 * front. A comma is *not* a separator: `Body, Mind & Spirit` is one heading.
 */
/** `review_metadata`, `book_id` — a field name that escaped a publisher's tools. */
function isMachineToken(tag: string): boolean {
  return !/\s/.test(tag) && tag.includes('_')
}

export function subjectTags(subjects: readonly string[]): string[] {
  const seen = new Set<string>()
  const kept: string[] = []

  for (const heading of subjects) {
    for (const part of heading.split('/')) {
      const tag = part.trim()
      const key = tag.toLowerCase()
      if (!tag || key === 'general' || isMachineToken(tag) || seen.has(key)) continue
      seen.add(key)
      kept.push(tag)
    }
  }
  return kept
}

/** A book is finished when its own position says so, and not before. */
function isFinished(position: ReadingPosition | undefined): boolean {
  return position?.percent !== undefined && position.percent >= 100
}

function dateOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * A thrown error, as the lowercase fragment the failure line needs.
 *
 * `CloudError` already carries a sentence written for a reader ("you’re
 * offline"), so its message is used as it is. Anything else is a bug rather
 * than a condition, and the reader gets told that something went wrong without
 * being shown a stack trace's worth of nouns.
 */
function reasonFrom(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  return message.length > 0 && message.length < 120 ? message : 'something went wrong'
}

/**
 * The year, for the metadata line.
 *
 * Google returns anything from `1995` to `1995-03-02`, and this line is one
 * phone wide with three other facts already on it. The year is the part anyone
 * reads at a glance; the full date is still in the catalogue if it matters.
 */
function yearOf(published: string | undefined): string | undefined {
  if (!published) return undefined
  const year = /^\d{4}-/.test(published) ? published.slice(0, 4) : published
  /*
   * A year nobody could have published in is dropped, not shown.
   *
   * An EPUB carries whatever its packager typed, and one on this shelf says
   * `0101`. Printed on the line beside the page count it reads as a fact about
   * the book. Anything outside 1400 to next year is a typing accident, so the
   * line simply goes one fact shorter.
   */
  if (!/^\d{4}$/.test(year)) return undefined
  const value = Number(year)
  return value >= 1400 && value <= new Date().getFullYear() + 1 ? year : undefined
}

/**
 * A book's own screen — the reading desk.
 *
 * Built from `design-inspiration/reading-desk-v2.html`. The page has two
 * states and they are driven by one fact, whether the book is finished:
 *
 * - **In progress.** The brown button continues the book. The violet one opens
 *   "Coming back to it". Veda's block sits below with the way in to the chapter
 *   summaries.
 * - **Finished.** The brown button starts the book again. The violet one *is*
 *   the chapter summaries, so Veda's block folds away entirely — the same door
 *   must never appear twice on one screen.
 */
export default function BookInfo() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  // Set only by the title in the reading overlay. See `ExitControl`.
  const fromReader = (useLocation().state as { fromReader?: boolean } | null)?.fromReader === true
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [updating, setUpdating] = useState<UpdateState>({ status: 'idle' })
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'idle' })
  /** Whether the file this book came from is still kept — see `updateThis`. */
  const [hasSource, setHasSource] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      repository.getBook(id),
      repository.getPosition(id),
      repository.booksWithSource(),
    ]).then(([book, position, withSource]) => {
      if (cancelled) return
      setState(book ? { status: 'ready', book, position } : { status: 'missing' })
      setHasSource(withSource.has(id))
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const covers = useCovers(useMemo(() => (state.status === 'ready' ? [id] : []), [state.status, id]))

  async function rate(value: number | undefined) {
    if (state.status !== 'ready') return
    setState({ ...state, book: { ...state.book, rating: value } })
    await repository.rateBook(id, value)
  }

  /**
   * Start the book again from its first paragraph.
   *
   * The position is moved rather than deleted. Deleting it would take "Last
   * read" and the finished mark with it, and a reader who reads a book twice
   * has not un-read it the first time.
   */
  async function startAgain() {
    const sections = await repository.listSections(id)
    const first = sections[0]?.paragraphs[0]?.anchor
    if (first) await repository.savePosition(id, first, 0)
    navigate(`/book/${id}`)
  }

  /**
   * Re-read this one book from the file it was imported from.
   *
   * The panel at launch does the whole shelf in one sweep, which is the right
   * shape for "everything is behind at once". This is for the leftovers: a book
   * the sweep couldn't manage, whose failure the reader can now see a reason
   * for and retry on its own — a shelf-wide button gives neither.
   */
  async function updateThis() {
    if (state.status !== 'ready') return
    setUpdating({ status: 'busy' })

    const [outcome] = await reparseBooks([state.book])
    if (!outcome || outcome.status === 'failed') {
      setUpdating({ status: 'failed', message: outcome?.message ?? 'Nothing happened.' })
      return
    }

    // A re-parse picks its cover afresh, so this book's stored art is stale —
    // and only this book's. The two shelf memories hold the old title and
    // position for it as well.
    forgetCovers([id])
    forgetShelfMemory()
    forgetLibraryMemory()

    const book = await repository.getBook(id)
    if (book) setState({ ...state, book })
    setUpdating({ status: 'done' })
  }

  /**
   * Ask Google Books about this book again.
   *
   * Here rather than only in the launch sweep for the same reason the Update
   * button is: the sweep handles "everything is behind at once", and this
   * handles the leftovers — the four or five books it couldn't match, and the
   * one whose cover came back wrong. It re-asks even for a book already
   * stamped, because the reader pressing it *is* the reason to ask.
   */
  async function refreshFromCatalogue() {
    if (state.status !== 'ready') return
    setCatalogue({ status: 'busy' })

    // Everything from here down is inside the catch, on purpose. `lookupBook`
    // reports a network failure as `failed` rather than throwing, so the only
    // way out of `busy` used to be a value coming back. Anything that threw
    // instead left the line reading "Looking…" with nothing on its way to
    // replace it. A control that can get stuck is worse than one that says no.
    try {
      const outcome = await refreshBook(state.book, catalogueDeps())
      if (outcome.status === 'failed') {
        setCatalogue({ status: 'failed', message: outcome.reason })
        return
      }

      // A fetched cover lands in the book's assets, so this book's cached art
      // is stale — and only this book's.
      forgetCovers([id])
      const book = await repository.getBook(id)
      if (book) setState({ ...state, book })
      setCatalogue({ status: outcome.status })
    } catch (error) {
      setCatalogue({ status: 'failed', message: reasonFrom(error) })
    }
  }

  if (state.status === 'loading') {
    return (
      <div className={styles.page}>
        <ExitControl bookId={id} fromReader={fromReader} />
        <p className={styles.pending}>Loading…</p>
      </div>
    )
  }

  if (state.status === 'missing') {
    return (
      <div className={styles.page}>
        <ExitControl bookId={id} fromReader={fromReader} />
        <p className={styles.pending}>This book isn’t on your shelf anymore.</p>
      </div>
    )
  }

  const { book, position } = state
  const finished = isFinished(position)
  // Cut and deduplicated here, so the row is hidden when nothing survives the
  // cut — a book whose only heading was `General` has no subjects to show.
  const tags = subjectTags(book.subjects ?? [])
  const shown = fullTitle(book.title, book.subtitle)
  /*
   * Forty characters, past which the title steps down a size.
   *
   * A full title carries its subtitle — "Braiding Sweetgrass: Indigenous
   * Wisdom, Scientific Knowledge and the Teachings of Plants" — and at 30px
   * that is four lines of Playfair standing over the cover it belongs to. The
   * cover is meant to be the subject of this screen. Forty is where a title
   * stops fitting on two lines on a 360px phone.
   */
  const long = shown.length > 40
  const summariesHref = `/book/${book.id}/chapters?from=${encodeURIComponent(`/book/${book.id}/info`)}`
  // Only the facts this book actually has. A missing page count must not leave
  // " · pp · " sitting in the line.
  const meta = [
    FORMAT_LABELS[book.source],
    book.pageCount ? `${book.pageCount} pp` : undefined,
    yearOf(book.published),
  ].filter((part): part is string => part !== undefined)

  return (
    <div className={styles.page}>
      <ExitControl bookId={id} fromReader={fromReader} />

      <div className={styles.coverStage}>
        <div className={styles.coverMedia}>
          <Cover title={book.title} src={covers.get(id)} />
        </div>
        <div className={styles.shelf} aria-hidden="true" />
      </div>

      <h1 className={long ? `${styles.title} ${styles.titleLong}` : styles.title}>{shown}</h1>
      {book.author && <p className={styles.author}>{book.author}</p>}

      <p className={styles.metaline}>
        {book.genre && (
          <>
            <span className={styles.metaGenre}>{book.genre}</span>
            {meta.length > 0 && ' · '}
          </>
        )}
        {meta.join(' · ')}
      </p>

      {/*
       * The pair. The brown one moves the reader through the book; the violet
       * one opens what Veda wrote about it. Which page each opens changes with
       * the state, but the colours never swap — violet is Veda's alone.
       */}
      <div className={styles.actionPair}>
        {finished ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              void startAgain()
            }}
          >
            Start again
          </button>
        ) : (
          <Link to={`/book/${id}`} className={styles.primary}>
            Continue reading
          </Link>
        )}

        <Link
          to={finished ? summariesHref : `/book/${book.id}/last-time`}
          className={styles.recap}
        >
          <Icon name={finished ? 'summaries' : 'recall'} />
          <span>{finished ? 'Read chapter summaries' : 'Coming back to it'}</span>
        </Link>
      </div>

      <div className={styles.progressBlock}>
        <p className={styles.progress}>
          {finished && position
            ? `Finished · ${dateOf(position.at)}`
            : position?.percent !== undefined
              ? `Reading · ${position.percent}%`
              : position
                ? 'Reading'
                : 'Not started'}
        </p>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Reading progress"
          aria-valuenow={position?.percent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={styles.progressFill} style={{ width: `${position?.percent ?? 0}%` }} />
        </div>
      </div>

      <div className={styles.rule}>
        <span>On this book</span>
      </div>
      {book.description ? (
        <Blurb text={book.description} />
      ) : (
        <p className={styles.pending}>
          {book.metadataFetchedAt
            ? // Said plainly. This book is genuinely not in the catalogue,
              // which is a fact about Google and not about the book.
              'Google Books has no record of this one.'
            : 'Nothing has been looked up for this book yet.'}
        </p>
      )}

      {/*
       * Veda's block, and only while the book is unfinished.
       *
       * Once it is finished the violet action above *is* the chapter
       * summaries, and the same door twice on one screen is a design fault,
       * not a convenience.
       */}
      {!finished && (
        <Link to={summariesHref} className={styles.study}>
          <span className={styles.studyEyebrow}>
            <span className={styles.vedaSig}>Veda</span>
            <span className={styles.eyebrow}>study companion</span>
          </span>
          <span className={styles.studyItem}>
            <span className={styles.studyMark}>
              <Icon name="summaries" />
            </span>
            <span>
              <span className={styles.studyTitle}>Chapter summaries</span>
              <span className={styles.studyNote}>
                Each finished chapter in plain words, and what you asked about it.
              </span>
            </span>
            <span className={styles.studyChev}>
              <Icon name="chevron" />
            </span>
          </span>
        </Link>
      )}

      <div className={styles.ratingStrip}>
        <span className={styles.ratingLabel}>Your rating</span>
        <StarRow label="Your rating" value={book.rating} onChange={rate} />
      </div>

      <section className={styles.details}>
        <h2 className={styles.detailsTitle}>Book details</h2>

        <dl>
          <Detail icon="calendar" label="Added" value={dateOf(book.importedAt)} />
          {position && <Detail icon="check" label="Last read" value={dateOf(position.at)} />}
          {book.publisher && <Detail icon="building" label="Publisher" value={book.publisher} />}
          {/* The file's own ISBN first: it identifies the edition actually on
              the shelf, where Google's identifies the one it matched. */}
          {isbnOf(book) && <Detail icon="barcode" label="ISBN" value={isbnOf(book)!} />}
          {/* Never one without the other. Every average in this library rests
              on one or two votes, and "4.5" alone reads as a verdict. */}
          {book.averageRating !== undefined && book.ratingsCount !== undefined && (
            <Detail
              icon="star"
              label="Readers"
              value={`${book.averageRating.toFixed(2)} out of 5 · ${book.ratingsCount.toLocaleString()} ${
                book.ratingsCount === 1 ? 'rating' : 'ratings'
              }`}
            />
          )}
          {tags.length > 0 && (
            <div className={styles.detail}>
              <Icon name="tag" />
              <div className={styles.detailBody}>
                <dt className={styles.detailLabel}>Subjects</dt>
                <dd className={styles.subjects}>
                  {tags.map((subject) => (
                    <span key={subject} className={styles.subject}>
                      {subject}
                    </span>
                  ))}
                </dd>
              </div>
            </div>
          )}
        </dl>

        <button
          type="button"
          className={styles.refresh}
          disabled={catalogue.status === 'busy'}
          onClick={() => {
            void refreshFromCatalogue()
          }}
        >
          <Icon name="refresh" />
          {catalogue.status === 'busy' ? 'Looking…' : 'Refresh from Google Books'}
        </button>

        {catalogue.status === 'matched' && (
          <p className={styles.said} role="status">
            Updated from Google Books.
          </p>
        )}
        {catalogue.status === 'unmatched' && (
          <p className={styles.said} role="status">
            Google Books has no record of this one. Nothing about the book has changed.
          </p>
        )}
        {/* Deliberately not the same sentence as "no record". One means the
            catalogue answered; this means it never did, and the difference is
            whether pressing again is worth anything. */}
        {catalogue.status === 'failed' && (
          <p className={styles.said} role="status">
            Couldn’t ask Google Books — {catalogue.message}. Nothing about the book was changed.
          </p>
        )}
      </section>

      {isOutOfDate(book) && updating.status !== 'done' && (
        <section className={styles.repair}>
          <h2 className={styles.repairTitle}>This book can be improved</h2>
          <p className={styles.pending}>
            It was read by an older version of Reading Buddy.{' '}
            {hasSource
              ? 'Re-reading it from the original file improves its links, pictures and chapter breaks. Your place in it is kept.'
              : 'It was imported before Reading Buddy kept the original file, so it can’t be updated in place — remove it from the Library and import the file again.'}
          </p>

          {hasSource && (
            <button
              type="button"
              className={styles.repairButton}
              disabled={updating.status === 'busy'}
              onClick={() => {
                void updateThis()
              }}
            >
              {updating.status === 'busy' ? 'Updating…' : 'Update this book'}
            </button>
          )}

          {/* The reason, not just the fact. A book that fails the shelf-wide
              sweep silently is a book with no way forward — the message is
              usually the difference between "try again" and "re-import it". */}
          {updating.status === 'failed' && (
            <p className={styles.said} role="status">
              It couldn’t be updated — {updating.message}. The book itself is unchanged and still
              reads exactly as before.
            </p>
          )}
        </section>
      )}

      {updating.status === 'done' && (
        <p className={styles.said} role="status">
          Updated. This book has been re-read with the current version.
        </p>
      )}
    </div>
  )
}

/**
 * Which ISBN to show.
 *
 * The file's own first, because it identifies the edition actually on the
 * shelf — Google's records the edition it *matched*, and the two disagree more
 * often than you would expect. `googleIsbn13` before `googleIsbn10` only
 * because the 13-digit form is the current standard.
 */
function isbnOf(book: BookMeta): string | undefined {
  return book.isbn ?? book.googleIsbn13 ?? book.googleIsbn10
}

/** One labelled fact in the details card: icon, label, value. */
function Detail({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className={styles.detail}>
      <Icon name={icon} />
      <div className={styles.detailBody}>
        <dt className={styles.detailLabel}>{label}</dt>
        <dd className={styles.detailValue}>{value}</dd>
      </div>
    </div>
  )
}

type IconName =
  | 'calendar'
  | 'check'
  | 'building'
  | 'barcode'
  | 'star'
  | 'tag'
  | 'refresh'
  | 'home'
  | 'back'
  | 'chevron'
  | 'recall'
  | 'summaries'

/**
 * The line icons, drawn rather than typed.
 *
 * SVG paths rather than an icon font or a Unicode glyph: a character a system
 * font happens not to carry renders as an empty box on somebody's phone, and it
 * fails silently. These are `currentColor`, so each takes the accent of the
 * thing around it — brown in the details card, violet inside Veda's block.
 */
const ICON_PATHS: Readonly<Record<IconName, readonly string[]>> = {
  calendar: ['M3 4h18v17H3zM3 9h18M8 2v4M16 2v4'],
  check: ['M20 6 9 17l-5-5'],
  building: ['M4 4h5v16H4zM11 4h4v16h-4zM17 5l3 1-3 14-3-1z'],
  barcode: ['M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14'],
  star: ['m12 3 2.6 5.6 6 .8-4.4 4.1 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z'],
  tag: ['M20.6 13.4 12 22l-9-9V4h9z', 'M8 8h.01'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20h14V9.5'],
  back: ['M15 6l-6 6 6 6'],
  chevron: ['m9 6 6 6-6 6'],
  // An open book, held in two hands: coming back to something already read.
  recall: [
    'M3 5h7a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H3z',
    'M21 5h-7a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H21z',
  ],
  // A written page: the summaries are a document, not a book.
  summaries: ['M4 4h13l3 3v13H4z', 'M8 9h8M8 13h8M8 17h5'],
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}

/**
 * The publisher's blurb, clamped to four lines with a word to open it.
 *
 * A real line clamp, not a fixed height: the cut lands after the fourth *line*
 * whatever text size the reader's phone is set to. A pixel height cuts a
 * sentence in half through the middle of its letters on a large-text phone.
 */
function Blurb({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <p className={open ? styles.blurb : `${styles.blurb} ${styles.blurbClamped}`}>{text}</p>
      <button
        type="button"
        className={styles.more}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Read less ←' : 'Read more →'}
      </button>
    </>
  )
}

/**
 * How much of star number `star` is filled, for a rating of `value`.
 *
 * A percentage rather than a boolean because that is what half a star *is*
 * here: the filled glyph is drawn over the empty one and clipped to this
 * width. See `.starFill` for why it is done that way rather than with a
 * half-star character.
 */
function fillOf(value: number | undefined, star: number): string {
  if (value === undefined || value <= star - 1) return '0%'
  if (value >= star) return '100%'
  return '50%'
}

/**
 * A row of five tap-to-rate stars, each half of which is its own target — so
 * the row reads 0.5 to 5 in halves rather than 1 to 5 in whole numbers.
 *
 * Tapping the value that is already set clears it: rating a book requires a way
 * to say "actually, no opinion" again.
 *
 * ## Two buttons per star, one glyph
 *
 * The obvious build is a half-star character. There isn't a dependable one —
 * the half-star glyphs are missing from enough system fonts to render as a box
 * on somebody's phone, and the fallback is silent. So each star is an outline
 * with a filled one laid over it and clipped to 0%, 50% or 100% of its width.
 *
 * The buttons are transparent overlays rather than the visible thing, because
 * half a star is about 20px wide — too small a target on its own. They are
 * stretched past the height of the row to buy back vertically what the split
 * costs horizontally.
 */
function StarRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  const pick = (next: number) => onChange(value === next ? undefined : next)

  return (
    <div className={styles.stars} role="group" aria-label={label}>
      {STARS.map((star) => (
        <span key={star} className={styles.star}>
          <span className={styles.starEmpty} aria-hidden="true">
            ☆
          </span>
          {/* `aria-hidden` on both glyphs: the buttons carry the labels, and a
              screen reader announcing "star star star" over the top of them
              would be noise, not information. */}
          <span
            className={styles.starFill}
            style={{ width: fillOf(value, star) }}
            aria-hidden="true"
          >
            ★
          </span>
          <button
            type="button"
            className={`${styles.starHit} ${styles.starHitHalf}`}
            aria-pressed={value === star - 0.5}
            aria-label={`${star - 0.5} stars`}
            onClick={() => pick(star - 0.5)}
          />
          <button
            type="button"
            className={`${styles.starHit} ${styles.starHitWhole}`}
            aria-pressed={value === star}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onClick={() => pick(star)}
          />
        </span>
      ))}
    </div>
  )
}
