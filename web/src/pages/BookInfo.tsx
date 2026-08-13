import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { forgetLibraryMemory } from '../app/libraryMemory.ts'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { fullTitle } from '../app/title.ts'
import { forgetCovers, useCovers } from '../app/useCovers.ts'
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
 * author, format, status and a 1–5 rating live here; WP-48 adds quotes and
 * WP-49 adds notes to the same page rather than inventing new ones.
 */
export default function BookInfo() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [quotes, setQuotes] = useState<StoredQuote[]>([])
  const [updating, setUpdating] = useState<UpdateState>({ status: 'idle' })
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
          <h1 className={styles.title}>{fullTitle(book.title, book.subtitle)}</h1>
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

      <Link to={`/book/${id}`} className={styles.readButton}>
        {startLabel}
      </Link>
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
      <span className={styles.ratingLabel}>{label}</span>
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
