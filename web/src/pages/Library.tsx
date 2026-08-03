import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import {
  ACCEPTED_EXTENSIONS,
  dropHasDirectory,
  filesFromDrop,
  importBooks,
  isOutOfDate,
  reparseBooks,
  shelfOf,
  type BatchProgress,
  type ImportOutcome,
  type ReparseOutcome,
  type ReparseProgress,
} from '../import/index.ts'
import type { BookId, BookMeta, Shelf } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import { rowId, useRowMemory } from '../app/useRowMemory.ts'
import styles from './page.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; books: BookMeta[] }
  | { status: 'failed'; message: string }

type ImportState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'busy'; progress: BatchProgress }
  | { status: 'done'; outcomes: ImportOutcome[] }

const STAGE_LABEL: Record<BatchProgress['stage'], string> = {
  reading: 'Reading',
  parsing: 'Parsing',
  saving: 'Saving',
}

/** Re-reading books from the files they were imported from. */
type UpdateState =
  | { status: 'idle' }
  | { status: 'busy'; progress: ReparseProgress }
  | { status: 'done'; outcomes: ReparseOutcome[] }

/** Fixed order, so the shelves don't rearrange themselves as books arrive. */
const SHELVES: readonly Shelf[] = ['book', 'paper', 'document']

const SHELF_LABEL: Record<Shelf, string> = {
  book: 'Books',
  paper: 'Research papers',
  document: 'Documents',
}

/** Singular, for the "move this one" control. */
const SHELF_SINGULAR: Record<Shelf, string> = {
  book: 'Book',
  paper: 'Research paper',
  document: 'Document',
}

/**
 * The full catalogue: every imported book, newest first, plus the three ways
 * in — pick files, pick a folder, or drop either onto the page. Reached from
 * Home's "See all books" rather than being the front door itself.
 */
/**
 * The books a search shows.
 *
 * Title and author, because those are the two things a reader knows about a
 * book they are hunting for. Every word has to match, in either field — typing
 * "jung red" should find *The Red Book* by Jung, which a single substring test
 * across the whole phrase would miss.
 */
function matching(books: readonly BookMeta[], query: string): BookMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...books]

  return books.filter((book) => {
    const haystack = `${book.title} ${book.author ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

export default function Library() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [importing, setImporting] = useState<ImportState>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)
  /** The book whose "Remove?" confirmation is showing, if any. */
  const [removing, setRemoving] = useState<BookMeta['id'] | null>(null)

  /**
   * Which books are ticked, or `null` when not selecting at all.
   *
   * `null` rather than an empty set, because "not selecting" and "selecting
   * nothing" have to look different: the row controls only make sense in one of
   * them, and a shelf permanently covered in checkboxes is a worse default for
   * the thing people do most, which is read.
   */
  const [selected, setSelected] = useState<Set<BookMeta['id']> | null>(null)

  /** Guards the "delete these 35 books" confirmation. */
  const [confirmingBulk, setConfirmingBulk] = useState(false)

  /** What has been typed into the shelf search. Empty means "show everything". */
  const [query, setQuery] = useState('')

  const [updating, setUpdating] = useState<UpdateState>({ status: 'idle' })

  /**
   * Which books still have the file they were imported from.
   *
   * Held apart from the books themselves because it answers a different
   * question and is fetched a different way — one read of the key index, no
   * blobs touched. A book without its file can still be brought up to date, but
   * only the long way, and the shelf has to be able to say which is which
   * rather than offering a button that fails per book.
   */
  const [withSource, setWithSource] = useState<Set<BookId>>(new Set())

  const books = state.status === 'ready' ? state.books : []
  const visible = matching(books, query)
  const allShown = visible.length > 0 && visible.every((book) => selected?.has(book.id))

  // Waits for the books, because the shelf's height depends on them — restoring
  // a position against a half-drawn list is what put the reader at the bottom.
  // Remembered by book rather than by pixel offset — see the hook for why
  // the offset kept landing somewhere arbitrary.
  const rememberRow = useRowMemory('library-row', state.status === 'ready')

  useEffect(() => {
    let cancelled = false

    Promise.all([repository.listBooks(), repository.booksWithSource()])
      .then(([books, sources]) => {
        if (cancelled) return
        setState({ status: 'ready', books })
        setWithSource(sources)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // Surfaced rather than swallowed: on a phone, a blocked or full
        // IndexedDB is a real failure mode and a blank screen hides it.
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const busy =
    importing.status === 'busy' ||
    importing.status === 'scanning' ||
    updating.status === 'busy'

  /** Books an improved parser could do better with — see `parse/version.ts`. */
  const outdated = books.filter(isOutOfDate)
  const updatable = outdated.filter((book) => withSource.has(book.id))
  const stranded = outdated.length - updatable.length

  /** Re-read the shelf and which books still have their file. */
  async function reload() {
    const [books, sources] = await Promise.all([
      repository.listBooks(),
      repository.booksWithSource(),
    ])
    setState({ status: 'ready', books })
    setWithSource(sources)
  }

  /**
   * Bring every book that can be updated up to the current parser.
   *
   * The books keep their identity throughout — same id, same shelf, same place
   * in the list, same reading position — so this is genuinely an update rather
   * than a delete and a re-import wearing a friendlier name.
   */
  async function runUpdate() {
    if (updatable.length === 0) return

    setUpdating({
      status: 'busy',
      progress: { index: 1, total: updatable.length, title: updatable[0]!.title, stage: 'reading' },
    })

    const outcomes = await reparseBooks(updatable, {
      onProgress: (progress) => setUpdating({ status: 'busy', progress }),
    })

    setUpdating({ status: 'done', outcomes })

    try {
      await reload()
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * `fromFolder` decides whether an unreadable file is worth reporting: a
   * hand-picked one is, a stray file swept up from a folder isn't.
   */
  async function runImport(files: File[], fromFolder: boolean) {
    if (files.length === 0) {
      setImporting({ status: 'done', outcomes: [] })
      return
    }

    setImporting({ status: 'busy', progress: { index: 1, total: files.length, filename: files[0]!.name, stage: 'reading' } })

    const outcomes = await importBooks(files, {
      skipUnsupported: fromFolder,
      onProgress: (progress) => setImporting({ status: 'busy', progress }),
    })

    setImporting({ status: 'done', outcomes })

    try {
      await reload()
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Deleting cascades — the book, its manifest, chapters and every section, in
   * one transaction (see `repository.deleteBook`). Orphaned sections would be
   * invisible and unreachable while still eating the phone's storage quota.
   */
  async function remove(book: BookMeta) {
    setRemoving(null)
    try {
      await repository.deleteBook(book.id)
      await reload()
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: `Couldn’t remove “${book.title}”. ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }

  function toggleSelected(id: BookMeta['id']) {
    setSelected((current) => {
      const next = new Set(current ?? [])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * Remove everything ticked, in one transaction.
   *
   * Deliberately behind a confirmation that names the number. Removing one book
   * by mistake is annoying; removing thirty-five is a small disaster, and the
   * books are gone — there is no undo, because the original files were never
   * kept.
   */
  async function removeSelected() {
    const ids = [...(selected ?? [])]
    setConfirmingBulk(false)
    if (ids.length === 0) return

    try {
      await repository.deleteBooks(ids)
      setSelected(null)
      await reload()
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: `Couldn’t remove ${ids.length === 1 ? 'that book' : `those ${ids.length} books`}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }

  /**
   * Moving is always the reader's decision, so it's recorded as an override —
   * nothing later gets to re-guess a shelf that's been corrected by hand.
   */
  async function move(book: BookMeta, shelf: Shelf) {
    try {
      await repository.saveBook({ ...book, shelf, shelfOverridden: true })
      setState({ status: 'ready', books: await repository.listBooks() })
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: `Couldn’t move “${book.title}”. ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>, fromFolder: boolean) {
    const files = Array.from(event.target.files ?? [])
    // Reset immediately so picking the same files twice still fires a change.
    event.target.value = ''
    void runImport(files, fromFolder)
  }

  async function onDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (busy) return

    const fromFolder = dropHasDirectory(event.dataTransfer)
    setImporting({ status: 'scanning' })
    // Walking a dropped folder is itself async, and on a big shelf it is slow
    // enough to need its own "looking through that folder…" state.
    const files = await filesFromDrop(event.dataTransfer)
    void runImport(files, fromFolder)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        void onDrop(event)
      }}
    >
      <h1 className={styles.title}>All books</h1>

      <div className={`${styles.importer} ${dragging ? styles.importerDragging : ''}`}>
        <div className={styles.importActions}>
          <input
            id="import-files"
            className={styles.fileInput}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            disabled={busy}
            onChange={(event) => onPick(event, false)}
          />
          <label htmlFor="import-files" className={styles.importButton} aria-disabled={busy}>
            {busy ? 'Importing…' : 'Add books'}
          </label>

          <input
            id="import-folder"
            className={styles.fileInput}
            type="file"
            multiple
            disabled={busy}
            // Not in React's typings; the attribute is what makes the picker
            // choose a folder instead of files, so it is set directly.
            ref={(element) => {
              element?.setAttribute('webkitdirectory', '')
            }}
            onChange={(event) => onPick(event, true)}
          />
          <label htmlFor="import-folder" className={styles.importButton} aria-disabled={busy}>
            Add a folder
          </label>
        </div>

        <p className={styles.pending}>
          Pick several at once, choose a whole folder, or drag either onto this
          page. EPUB, PDF, Markdown, plain text or Word (.docx) — Kindle books
          (.azw3, .kfx) can’t be opened, so convert one to EPUB first, with
          Calibre.
        </p>

        {importing.status === 'scanning' && (
          <p className={styles.pending} role="status">
            Looking through that folder…
          </p>
        )}

        {importing.status === 'busy' && (
          <p className={styles.pending} role="status">
            {STAGE_LABEL[importing.progress.stage]} “{importing.progress.filename}” —{' '}
            {importing.progress.index} of {importing.progress.total}. Large books
            can take a few seconds each.
          </p>
        )}

        {importing.status === 'done' && <ImportReport outcomes={importing.outcomes} />}
      </div>

      {/*
        The reason this screen now keeps the original files.

        A parsed book is a snapshot, so improving the parser does nothing for
        books already on the shelf and says nothing about itself — the reader
        sees the old behaviour and reasonably concludes the fix didn't work.
        This is the shelf telling them, and offering the one tap that fixes it.
      */}
      {/* Deliberately still shown after a run that left some books behind: the
          report says what happened, and the banner says what is still true. */}
      {state.status === 'ready' && outdated.length > 0 && (
        <div className={styles.update}>
          <p className={styles.emptyTitle}>
            {outdated.length === 1
              ? 'One book can be improved'
              : `${outdated.length} books can be improved`}
          </p>
          <p className={styles.pending}>
            {outdated.length === 1 ? 'It was' : 'They were'} read by an older version of
            Reading Buddy. Updating re-reads{' '}
            {outdated.length === 1 ? 'it' : 'them'} from the original file — links,
            figures and chapter breaks all improve. Your place in{' '}
            {outdated.length === 1 ? 'the book' : 'each book'} is kept.
          </p>

          {updatable.length > 0 && (
            <button
              type="button"
              className={styles.importButton}
              disabled={busy}
              onClick={() => {
                void runUpdate()
              }}
            >
              {updating.status === 'busy'
                ? 'Updating…'
                : `Update ${updatable.length} ${updatable.length === 1 ? 'book' : 'books'}`}
            </button>
          )}

          {/* Said plainly rather than left as a button that quietly does
              nothing for some rows: these predate the kept file, so the long
              way round is genuinely the only way. */}
          {stranded > 0 && (
            <p className={styles.pending}>
              {stranded === 1
                ? 'One of them was'
                : `${stranded} of them were`}{' '}
              imported before Reading Buddy kept the original file, so{' '}
              {stranded === 1 ? 'it' : 'they'} can’t be updated in place — remove{' '}
              {stranded === 1 ? 'it' : 'them'} and import the{' '}
              {stranded === 1 ? 'file' : 'files'} again. That is the last time this
              will be needed.
            </p>
          )}

          {updating.status === 'busy' && (
            <p className={styles.pending} role="status">
              {STAGE_LABEL[updating.progress.stage]} “{updating.progress.title}” —{' '}
              {updating.progress.index} of {updating.progress.total}.
            </p>
          )}
        </div>
      )}

      {updating.status === 'done' && <UpdateReport outcomes={updating.outcomes} />}

      {state.status === 'loading' && <p className={styles.pending}>Loading…</p>}

      {state.status === 'failed' && (
        <div className={styles.error} role="alert">
          <p>Couldn’t open your library.</p>
          <p className={styles.pending}>{state.message}</p>
        </div>
      )}

      {/*
        Selecting. Hidden until asked for: a shelf permanently covered in
        checkboxes is a worse default for the thing people do most, which is
        open a book.
      */}
      {/* Only once there are enough books for finding one to be a job. Below
          that the whole shelf is already on screen and a search box is furniture
          between the reader and their books. */}
      {state.status === 'ready' && books.length > 8 && (
        <div className={styles.search}>
          <input
            type="search"
            className={styles.searchInput}
            value={query}
            placeholder="Search by title or author"
            aria-label="Search your shelf"
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
          {query !== '' && (
            <span className={styles.pending} role="status">
              {visible.length} of {books.length}
            </span>
          )}
        </div>
      )}

      {state.status === 'ready' && state.books.length > 0 && (
        <div className={styles.selectBar}>
          {selected === null ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setSelected(new Set())}
            >
              Select
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  setSelected(null)
                  setConfirmingBulk(false)
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  // One control, both jobs: once everything is ticked the only
                  // thing left to want is to untick it.
                  //
                  // "All" means everything *on screen*. With a search typed,
                  // ticking books the reader cannot see and then deleting them
                  // would be the worst bug this screen could have.
                  setSelected(allShown ? new Set() : new Set(visible.map((book) => book.id)))
                  setConfirmingBulk(false)
                }}
              >
                {allShown ? 'Select none' : 'Select all'}
              </button>

              <span className={styles.pending} role="status">
                {selected.size} selected
              </span>

              {confirmingBulk ? (
                <span className={styles.confirm}>
                  <button type="button" className={styles.danger} onClick={() => void removeSelected()}>
                    Delete {selected.size}
                  </button>
                  <button type="button" className={styles.iconButton} onClick={() => setConfirmingBulk(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.danger}
                  disabled={selected.size === 0}
                  onClick={() => setConfirmingBulk(true)}
                >
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Named rather than counted, because "35 books" is a number nobody
          checks and there is no undo — the original files were never kept. */}
      {confirmingBulk && selected && selected.size > 0 && (
        <p className={styles.error} role="alert">
          Remove {selected.size} {selected.size === 1 ? 'book' : 'books'} for good? This
          can’t be undone.
        </p>
      )}

      {state.status === 'ready' && state.books.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No books yet</p>
          <p>Add some with the buttons above.</p>
        </div>
      )}

      {/* An empty shelf and an empty *search* are different situations, and
          "No books yet" over a shelf of 35 would be alarming nonsense. */}
      {state.status === 'ready' && books.length > 0 && visible.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing matches “{query}”</p>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              setQuery('')
            }}
          >
            Clear the search
          </button>
        </div>
      )}

      {state.status === 'ready' &&
        state.books.length > 0 &&
        SHELVES.map((shelf) => {
          const shelved = visible.filter((book) => shelfOf(book) === shelf)
          // An empty shelf isn't shown at all: someone who only reads books
          // should never see a "Research papers" heading over nothing.
          if (shelved.length === 0) return null

          return (
            <section key={shelf}>
              <h2 className={styles.shelfHeading}>
                {SHELF_LABEL[shelf]} <span className={styles.pending}>({shelved.length})</span>
              </h2>

              <ul className={styles.list}>
                {shelved.map((book) => (
                  <li key={book.id} id={rowId(book.id)} className={styles.card}>
                    <div className={styles.cardRow}>
                      {selected !== null && (
                        <input
                          type="checkbox"
                          className={styles.tick}
                          checked={selected.has(book.id)}
                          aria-label={`Select ${book.title}`}
                          onChange={() => toggleSelected(book.id)}
                        />
                      )}

                      {/*
                        While selecting, the title ticks the box instead of
                        opening the book. Half a screen of tappable title that
                        does something other than what the checkboxes beside it
                        do is how a reader loses a shelf by accident.
                      */}
                      {selected !== null ? (
                        <button
                          type="button"
                          className={`${styles.cardLink} ${styles.cardLinkPlain}`}
                          onClick={() => toggleSelected(book.id)}
                        >
                          <span className={styles.emptyTitle}>{book.title}</span>
                          <p className={styles.pending}>
                            {book.author ? `${book.author} · ` : ''}
                            {book.type === 'dense-technical' ? 'Dense' : 'Fiction'}
                            {/* So the banner's number has faces. Without this
                                "4 books can be improved" is a claim the reader
                                has no way to check. */}
                            {isOutOfDate(book) && (
                              <span className={styles.outdated}> · can be improved</span>
                            )}
                          </p>
                        </button>
                      ) : (
                        <Link
                          to={`/book/${book.id}`}
                          className={styles.cardLink}
                          onClick={() => rememberRow(book.id)}
                        >
                          <span className={styles.emptyTitle}>{book.title}</span>
                          <p className={styles.pending}>
                            {book.author ? `${book.author} · ` : ''}
                            {book.type === 'dense-technical' ? 'Dense' : 'Fiction'}
                            {/* So the banner's number has faces. Without this
                                "4 books can be improved" is a claim the reader
                                has no way to check. */}
                            {isOutOfDate(book) && (
                              <span className={styles.outdated}> · can be improved</span>
                            )}
                          </p>
                        </Link>
                      )}

                      {/* The per-book controls step aside while selecting —
                          two ways to delete on one row, one of them for a
                          different set of books, is a trap. */}
                      {selected !== null ? null : removing === book.id ? (
                        <div className={styles.confirm}>
                          <span className={styles.pending}>Remove?</span>
                          <button
                            type="button"
                            className={styles.danger}
                            onClick={() => {
                              void remove(book)
                            }}
                          >
                            Remove
                          </button>
                          <button type="button" onClick={() => setRemoving(null)}>
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className={styles.confirm}>
                          <select
                            className={styles.shelfSelect}
                            aria-label={`Shelf for ${book.title}`}
                            value={shelf}
                            onChange={(event) => {
                              void move(book, event.target.value as Shelf)
                            }}
                          >
                            {SHELVES.map((option) => (
                              <option key={option} value={option}>
                                {SHELF_SINGULAR[option]}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={`Remove ${book.title}`}
                            onClick={() => setRemoving(book.id)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
    </div>
  )
}

/**
 * What happened to each book that was re-read.
 *
 * Named rather than counted where something went wrong, for the same reason the
 * import report is: "one book couldn't be updated" is not actionable, and the
 * book that failed is still sitting on the shelf reading exactly as it did
 * before — which is the one saving grace worth stating out loud.
 */
function UpdateReport({ outcomes }: { outcomes: ReparseOutcome[] }) {
  const updated = outcomes.filter((outcome) => outcome.status === 'updated')
  const failed = outcomes.filter((outcome) => outcome.status === 'failed')

  return (
    <div className={failed.length > 0 ? styles.error : undefined} role="status">
      <p>
        {updated.length > 0
          ? `Updated ${updated.length} ${updated.length === 1 ? 'book' : 'books'}.`
          : 'No books were updated.'}
        {failed.length > 0 &&
          ` ${failed.length} couldn’t be — ${
            failed.length === 1 ? 'it is' : 'they are'
          } unchanged and still readable:`}
      </p>

      {failed.length > 0 && (
        <ul className={styles.failureList}>
          {failed.map((outcome) => (
            <li key={outcome.bookId} className={styles.pending}>
              <strong>{outcome.title}</strong> — {outcome.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * What happened, per file. A batch has no single answer — "9 imported, 3
 * couldn't be opened" is the truth, and each of those three needs its own
 * reason next to its own filename.
 */
function ImportReport({ outcomes }: { outcomes: ImportOutcome[] }) {
  if (outcomes.length === 0) {
    return (
      <div className={styles.error} role="alert">
        <p>Nothing there to import.</p>
        <p className={styles.pending}>
          No EPUB, PDF, Markdown, text or Word files were found.
        </p>
      </div>
    )
  }

  const imported = outcomes.filter((outcome) => outcome.status === 'imported')
  const duplicates = outcomes.filter((outcome) => outcome.status === 'duplicate')
  const failed = outcomes.filter((outcome) => outcome.status === 'failed')

  // A single duplicate is the common case — you re-dropped one book — and it
  // deserves the plain sentence, not a one-item list under a summary.
  if (outcomes.length === 1 && duplicates.length === 1) {
    return (
      <p className={styles.pending} role="status">
        {duplicates[0]!.message}
      </p>
    )
  }

  return (
    <div className={failed.length > 0 ? styles.error : undefined} role="status">
      <p>
        {imported.length > 0
          ? `Imported ${imported.length} ${imported.length === 1 ? 'book' : 'books'}.`
          : 'Nothing new was imported.'}
        {duplicates.length > 0 && ` ${duplicates.length} already on your shelf.`}
        {failed.length > 0 && ` ${failed.length} couldn’t be opened:`}
      </p>

      {failed.length > 0 && (
        <ul className={styles.failureList}>
          {failed.map((outcome) => (
            <li key={outcome.filename} className={styles.pending}>
              <strong>{outcome.filename}</strong> — {outcome.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
