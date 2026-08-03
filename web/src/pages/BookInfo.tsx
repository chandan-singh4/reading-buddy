import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { useCovers } from '../app/useCovers.ts'
import { repository, type StoredQuote } from '../storage/index.ts'
import type { ReadingPosition } from '../storage/db.ts'
import type { BookId, BookMeta, SecondaryRatingAxis } from '../structure/index.ts'
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

/** A fixed candidate list rather than free text — a shelf of tags only stays
    scannable if the reader picks from the same small set every time. */
const MOOD_OPTIONS = [
  'Cozy',
  'Nostalgic',
  'Thoughtful',
  'Emotional',
  'Inspiring',
  'Melancholic',
  'Exciting',
  'Calming',
] as const

const SECONDARY_AXES: ReadonlyArray<{ axis: SecondaryRatingAxis; label: string }> = [
  { axis: 'writingStyle', label: 'Writing style' },
  { axis: 'pacing', label: 'Pacing' },
  { axis: 'emotionalImpact', label: 'Emotional impact' },
]

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
  const [quotes, setQuotes] = useState<StoredQuote[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([repository.getBook(id), repository.getPosition(id), repository.listQuotes(id)]).then(
      ([book, position, savedQuotes]) => {
        if (cancelled) return
        setState(book ? { status: 'ready', book, position } : { status: 'missing' })
        setQuotes(savedQuotes)
      },
    )
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

  async function rateAxis(axis: SecondaryRatingAxis, value: number | undefined) {
    if (state.status !== 'ready') return
    setState({
      ...state,
      book: { ...state.book, secondaryRatings: { ...state.book.secondaryRatings, [axis]: value } },
    })
    await repository.rateBookAxis(id, axis, value)
  }

  async function toggleMood(mood: string) {
    if (state.status !== 'ready') return
    const current = state.book.moods ?? []
    const next = current.includes(mood) ? current.filter((m) => m !== mood) : [...current, mood]
    setState({ ...state, book: { ...state.book, moods: next } })
    await repository.setMoods(id, next)
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
        <StarRow label="Overall" value={book.rating} onChange={rate} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Mood</h2>
        <div className={styles.moods}>
          {MOOD_OPTIONS.map((mood) => {
            const active = book.moods?.includes(mood) ?? false
            return (
              <button
                key={mood}
                type="button"
                className={active ? `${styles.mood} ${styles.moodActive}` : styles.mood}
                aria-pressed={active}
                onClick={() => toggleMood(mood)}
              >
                {mood}
              </button>
            )
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>More ratings</h2>
        <div className={styles.axisList}>
          {SECONDARY_AXES.map(({ axis, label }) => (
            <StarRow
              key={axis}
              label={label}
              value={book.secondaryRatings?.[axis]}
              onChange={(value) => rateAxis(axis, value)}
            />
          ))}
        </div>
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

/** A row of five tap-to-rate stars, shared by the overall rating and each
    secondary axis (WP-49). Tapping the star that already sets the value
    clears it, the same escape hatch the overall rating has always had. */
function StarRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <div className={styles.ratingRow}>
      <span className={styles.ratingLabel}>{label}</span>
      <div className={styles.stars} role="group" aria-label={label}>
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            className={styles.star}
            aria-pressed={value !== undefined && star <= value}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onClick={() => onChange(value === star ? undefined : star)}
          >
            {value !== undefined && star <= value ? '★' : '☆'}
          </button>
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
      rows={4}
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
