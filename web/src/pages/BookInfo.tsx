import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'

import { Cover } from '../app/Cover.tsx'
import { forgetLibraryMemory } from '../app/libraryMemory.ts'
import { forgetShelfMemory } from '../app/shelfMemory.ts'
import { useCovers } from '../app/useCovers.ts'
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

  async function rename(title: string) {
    if (state.status !== 'ready') return
    setState({ ...state, book: { ...state.book, title } })
    // Home and the library both show this title, and both remember what they
    // showed between visits so that returning doesn't visibly reload — see
    // `shelfMemory.ts` and `libraryMemory.ts`. Without this, a book renamed here
    // would keep its old name on both until something else cleared them.
    forgetShelfMemory()
    forgetLibraryMemory()
    await repository.renameBook(id, title)
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
          <TitleField title={book.title} onSave={rename} />
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

/** A row of five tap-to-rate stars. Tapping the star that already sets the
    value clears it — rating a book requires a way to say "actually, no
    opinion" again. */
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

/**
 * The title, with a manual rename a tap away. Some epubs' own metadata
 * mashes a subtitle, the author and a source credit into the title with no
 * punctuation between them (`cleanTitle` in `parse/epub.ts` strips the
 * author/ISBN/hash/credit part automatically, but can't always tell a
 * subtitle from the real title) — this is how a reader fixes what's left,
 * once, by hand.
 */
function TitleField({
  title,
  onSave,
}: {
  title: string
  onSave: (title: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)

  if (!editing) {
    return (
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        <button
          type="button"
          className={styles.titleEdit}
          aria-label="Edit title"
          onClick={() => {
            setValue(title)
            setEditing(true)
          }}
        >
          ✎
        </button>
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (trimmed) await onSave(trimmed)
    setEditing(false)
  }

  return (
    <form className={styles.titleEditForm} onSubmit={submit}>
      <input
        className={styles.titleInput}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Title"
        autoFocus
      />
      <button type="submit" className={styles.titleSave}>
        Save
      </button>
    </form>
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
