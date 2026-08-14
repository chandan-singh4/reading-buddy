import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { forgetLibraryMemory } from '../app/libraryMemory.ts'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { fullTitle } from '../app/title.ts'
import { forgetCovers, useCovers } from '../app/useCovers.ts'
import { catalogueDeps, refreshBook } from '../catalogue/index.ts'
import { isOutOfDate, reparseBooks } from '../import/index.ts'
import { repository, type StoredQuote } from '../storage/index.ts'
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
 * What goes in the narrow "Published" cell of the spec strip.
 *
 * Google returns anything from `1995` to `1995-03-02`, and the cell is a third
 * of a phone wide. The year is the part anyone reads at a glance; the full date
 * is still in the catalogue if it ever matters.
 */
function publishedLabel(published: string | undefined): string {
  if (!published) return '—'
  return /^\d{4}-/.test(published) ? published.slice(0, 4) : published
}

/**
 * A book's own screen (WP-47) — reached from a shelf tile's "ⓘ", not from
 * tapping the cover, which still opens straight into the reader. Title,
 * author, format, status and a 1–5 rating live here; WP-48 adds quotes and
 * WP-49 adds notes to the same page rather than inventing new ones.
 */
export default function BookInfo() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [quotes, setQuotes] = useState<StoredQuote[]>([])
  const [updating, setUpdating] = useState<UpdateState>({ status: 'idle' })
  const [catalogue, setCatalogue] = useState<CatalogueState>({ status: 'idle' })
  /** Whether the file this book came from is still kept — see `updateThis`. */
  const [hasSource, setHasSource] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      repository.getBook(id),
      repository.getPosition(id),
      repository.listQuotes(id),
      repository.booksWithSource(),
    ]).then(([book, position, savedQuotes, withSource]) => {
      if (cancelled) return
      setState(book ? { status: 'ready', book, position } : { status: 'missing' })
      setQuotes(savedQuotes)
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
   * Re-read this one book from the file it was imported from.
   *
   * The panel at launch does the whole shelf in one sweep, which is the right
   * shape for "everything is behind at once". This is for the leftovers: a book
   * the sweep couldn't manage, whose failure the reader can now see a reason
   * for and retry on its own — a shelf-wide button gives neither. The badge on
   * the tile says "can be improved" and this is what it means.
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
   * stamped, because the reader pressing the button *is* the reason to ask.
   */
  async function refreshFromCatalogue() {
    if (state.status !== 'ready') return
    setCatalogue({ status: 'busy' })

    const outcome = await refreshBook(state.book, catalogueDeps())
    if (outcome.status === 'failed') {
      setCatalogue({ status: 'failed', message: outcome.reason })
      return
    }

    // A fetched cover lands in the book's assets, so this book's cached art is
    // stale — and only this book's.
    forgetCovers([id])
    const book = await repository.getBook(id)
    if (book) setState({ ...state, book })
    setCatalogue({ status: outcome.status })
  }

  async function saveNotes(notes: string) {
    if (state.status !== 'ready') return
    setState({ ...state, book: { ...state.book, notes: notes || undefined } })
    await repository.setNotes(id, notes)
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
  const startLabel = position ? 'Continue reading' : 'Read'

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
          <h1 className={styles.title}>{fullTitle(book.title, book.subtitle)}</h1>
          {book.author && <p className={styles.author}>{book.author}</p>}
          {book.genre && <p className={styles.genre}>{book.genre}</p>}
        </div>
      </div>

      {/*
       * Format, length and year, side by side above the button that starts the
       * book. Three facts rather than a list of nine: this is the strip a
       * reader's eye crosses on the way to "Continue reading", so it holds only
       * what helps them decide to press it. Everything else waits below.
       */}
      <div className={styles.spec}>
        <div className={styles.specCell}>
          <span className={styles.specValue}>{FORMAT_LABELS[book.source]}</span>
          <span className={styles.specLabel}>Format</span>
        </div>
        <div className={styles.specCell}>
          <span className={styles.specValue}>{book.pageCount ?? '—'}</span>
          <span className={styles.specLabel}>Pages</span>
        </div>
        <div className={styles.specCell}>
          <span className={styles.specValue}>{publishedLabel(book.published)}</span>
          <span className={styles.specLabel}>Published</span>
        </div>
      </div>

      <Link to={`/book/${id}`} className={styles.readButton}>
        {startLabel}
      </Link>
      {/* The status and the bar together, directly under the button they
          describe. The bar used to live down beside the stars, which put the
          same percentage in two places on one screen — and the wrong one of
          them next to the reader's own rating, which has nothing to do with
          how far through they are. */}
      <div className={styles.progressBlock}>
        <p className={styles.progress}>{readingStatus(position)}</p>
        {position?.percent !== undefined && (
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Reading progress"
            aria-valuenow={position.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.progressFill} style={{ width: `${position.percent}%` }} />
          </div>
        )}
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>About this book</h2>
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
      </section>

      {isOutOfDate(book) && updating.status !== 'done' && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>This book can be improved</h2>
          <p className={styles.pending}>
            It was read by an older version of Reading Buddy.{' '}
            {hasSource
              ? 'Re-reading it from the original file improves its links, pictures and chapter breaks. Your place in it is kept.'
              : 'It was imported before Reading Buddy kept the original file, so it can’t be updated in place — remove it from the Library and import the file again.'}
          </p>

          {hasSource && (
            <button
              type="button"
              className={styles.updateButton}
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
            <p className={styles.updateFailed} role="status">
              It couldn’t be updated — {updating.message}. The book itself is unchanged and still
              reads exactly as before.
            </p>
          )}
        </section>
      )}

      {updating.status === 'done' && (
        <p className={styles.pending} role="status">
          Updated. This book has been re-read with the current version.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Book details</h2>

        {/* A tinted card of paired facts rather than a table of rows. Two
            columns, each cell an icon, a label and a value — the same amount of
            information in half the vertical space, and it reads as one object
            belonging to the book instead of a database dump. */}
        <dl className={styles.details}>
          <Detail icon="calendar" label="Added" value={dateOf(book.importedAt)} />
          {position && <Detail icon="check" label="Last read" value={dateOf(position.at)} />}
          {book.publisher && (
            <Detail icon="building" label="Publisher" value={book.publisher} wide />
          )}
          {/* The file's own ISBN first: it identifies the edition actually on
              the shelf, where Google's identifies the one it matched. */}
          {isbnOf(book) && <Detail icon="barcode" label="ISBN" value={isbnOf(book)!} wide />}
          {/* Never one without the other. Every average in this library rests on
              one or two votes, and "4.5" alone reads as a verdict. */}
          {book.averageRating !== undefined && book.ratingsCount !== undefined && (
            <Detail
              icon="star"
              label="Readers"
              wide
              value={`${book.averageRating.toFixed(2)} out of 5 · ${book.ratingsCount.toLocaleString()} ${
                book.ratingsCount === 1 ? 'rating' : 'ratings'
              }`}
            />
          )}
          {/* Google's own subject headings, as chips. Finer than the single
              genre pill at the top, and the only place they've ever been shown
              — they have been stored on every matched book all along. */}
          {book.subjects && book.subjects.length > 0 && (
            <div className={`${styles.detail} ${styles.detailWide}`}>
              <Icon name="tag" />
              <div className={styles.detailBody}>
                <dt className={styles.detailLabel}>Subjects</dt>
                <dd className={styles.subjects}>
                  {book.subjects.map((subject) => (
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
          className={styles.refreshButton}
          disabled={catalogue.status === 'busy'}
          onClick={() => {
            void refreshFromCatalogue()
          }}
        >
          <Icon name="refresh" />
          {catalogue.status === 'busy' ? 'Looking…' : 'Refresh from Google Books'}
        </button>

        {catalogue.status === 'matched' && (
          <p className={styles.pending} role="status">
            Updated from Google Books.
          </p>
        )}
        {catalogue.status === 'unmatched' && (
          <p className={styles.pending} role="status">
            Google Books has no record of this one. Nothing about the book has changed.
          </p>
        )}
        {/* Deliberately not the same sentence as "no record". One means the
            catalogue answered; this means it never did, and the difference is
            whether pressing the button again is worth anything.

            The reason is a lowercase fragment that finishes this sentence
            ("…couldn't ask Google Books — you're offline"), so that each cause
            says what to do rather than quoting a status number twice over. */}
        {catalogue.status === 'failed' && (
          <p className={styles.updateFailed} role="status">
            Couldn’t ask Google Books — {catalogue.message}. Nothing about the book was changed.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Your rating</h2>
        <StarRow label="Overall" value={book.rating} onChange={rate} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Notes &amp; reflections</h2>
        <NotesField initial={book.notes} onSave={saveNotes} />
      </section>

      <Quotes
        bookId={id}
        quotes={quotes}
        onAdd={async (text) => {
          await repository.addQuote(id, text)
          setQuotes(await repository.listQuotes(id))
        }}
        onRemove={async (quoteId) => {
          setQuotes((current) => current.filter((quote) => quote.id !== quoteId))
          await repository.deleteQuote(id, quoteId)
        }}
      />
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

/** One labelled fact in the details card. `wide` spans both columns — for the
    values (a publisher, an ISBN) that don't survive being cut to half a phone. */
function Detail({
  icon,
  label,
  value,
  wide,
}: {
  icon: IconName
  label: string
  value: string
  wide?: boolean
}) {
  return (
    <div className={wide ? `${styles.detail} ${styles.detailWide}` : styles.detail}>
      <Icon name={icon} />
      <div className={styles.detailBody}>
        <dt className={styles.detailLabel}>{label}</dt>
        <dd className={styles.detailValue}>{value}</dd>
      </div>
    </div>
  )
}

type IconName = 'calendar' | 'check' | 'building' | 'barcode' | 'star' | 'tag' | 'refresh'

/**
 * The line icons in the details card, drawn rather than typed.
 *
 * SVG paths rather than an icon font or a Unicode glyph for the same reason
 * the half-star and the chevron are drawn: a character that a system font
 * happens not to carry renders as an empty box on somebody's phone, and it
 * fails silently. These are `currentColor`, so they take the accent from the
 * rule around them and follow every theme without a second definition.
 */
const ICON_PATHS: Readonly<Record<IconName, string>> = {
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  check: 'M4 12.5l5 5L20 6.5',
  building: 'M5 21V4h9v17M14 10h5v11M8 8h3M8 12h3M8 16h3',
  barcode: 'M4 5v14M8 5v14M11 5v14M14 5v10M17 5v14M20 5v14',
  star: 'M12 3.5l2.7 5.6 6 .9-4.35 4.3 1.03 6.1L12 17.5l-5.38 2.9 1.03-6.1L3.3 10l6-.9z',
  tag: 'M3 12.5V4h8.5L21 13.5 12.5 22zM7.5 7.5h.01',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

/**
 * The publisher's blurb, folded to a few lines with a chevron to open it.
 *
 * These run to a full paragraph of marketing copy, and unfolded they push the
 * reader's own notes and quotes off the bottom of the screen — the parts of
 * this page that belong to them, buried under the part that doesn't. Folded is
 * the honest default: enough to recognise the book, and one tap to the rest.
 */
function Blurb({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.blurbBox}>
      <p className={open ? styles.blurbOpen : styles.blurb}>{text}</p>
      <button
        type="button"
        className={styles.blurbToggle}
        aria-expanded={open}
        aria-label={open ? 'Show less' : 'Show more'}
        onClick={() => setOpen(!open)}
      >
        <span className={open ? styles.chevronUp : styles.chevron} aria-hidden="true" />
      </button>
    </div>
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
 * `⯪` and friends are missing from enough system fonts to render as a box on
 * somebody's phone, and the fallback is silent. So each star is an outline `☆`
 * with a filled `★` laid over it and clipped to 0%, 50% or 100% of its width.
 * That works in any font that has the two characters this already relied on,
 * and it is the same technique that will draw Google's fractional average
 * rating when that lands beside this one.
 *
 * The buttons are transparent overlays rather than the visible thing, because
 * half a star is about 20 px wide — too small a target on its own. They are
 * stretched to the full height of the row to buy back vertically what the
 * split costs horizontally, which is the same compromise every half-star rater
 * makes.
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
    <div className={styles.ratingRow}>
      {/* No visible label: the section heading above already says "Your
          rating", and a second word beside the stars only pushed them off
          centre. The group keeps the name for a screen reader. */}
      <div className={styles.stars} role="group" aria-label={label}>
        {STARS.map((star) => (
          <span key={star} className={styles.star}>
            <span className={styles.starEmpty} aria-hidden="true">
              ☆
            </span>
            {/* `aria-hidden` on both glyphs: the buttons carry the labels, and
                a screen reader announcing "star star star" over the top of
                them would be noise, not information. */}
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
    </div>
  )
}


/** Saved on blur rather than on every keystroke — a reflection is written a
    sentence at a time, not fast enough to need debouncing. */
function NotesField({
  initial,
  onSave,
}: {
  initial: string | undefined
  onSave: (notes: string) => Promise<void>
}) {
  const [value, setValue] = useState(initial ?? '')
  return (
    <textarea
      className={styles.notesInput}
      placeholder="What did you take away from this book?"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onSave(value)}
      rows={3}
    />
  )
}

/**
 * Favorite quotes (WP-48). Typed in by hand — see the doc comment on
 * `StoredQuote` for why this isn't a "select text in the reader" flow yet.
 */
function Quotes({
  quotes,
  onAdd,
  onRemove,
}: {
  bookId: BookId
  quotes: readonly StoredQuote[]
  onAdd: (text: string) => Promise<void>
  onRemove: (quoteId: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSaving(true)
    await onAdd(text)
    setDraft('')
    setSaving(false)
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeading}>Favorite quotes</h2>

      {quotes.length > 0 && (
        <ul className={styles.quoteList}>
          {quotes.map((quote) => (
            <li key={quote.id} className={styles.quote}>
              <blockquote className={styles.quoteText}>“{quote.text}”</blockquote>
              <button
                type="button"
                className={styles.quoteRemove}
                aria-label="Remove this quote"
                onClick={() => onRemove(quote.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.quoteForm} onSubmit={submit}>
        <textarea
          className={styles.quoteInput}
          placeholder="Add a passage worth remembering…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
        />
        <button type="submit" className={styles.quoteSave} disabled={saving || draft.trim() === ''}>
          Save quote
        </button>
      </form>
    </section>
  )
}
