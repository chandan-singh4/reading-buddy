import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import {
  ACCEPTED_EXTENSIONS,
  dropHasDirectory,
  filesFromDrop,
  importBooks,
  type BatchProgress,
  type ImportOutcome,
} from '../import/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
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

/**
 * The home screen: every imported book, newest first, plus the three ways in —
 * pick files, pick a folder, or drop either onto the page.
 */
export default function Library() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [importing, setImporting] = useState<ImportState>({ status: 'idle' })
  const [dragging, setDragging] = useState(false)
  /** The book whose "Remove?" confirmation is showing, if any. */
  const [removing, setRemoving] = useState<BookMeta['id'] | null>(null)

  useEffect(() => {
    let cancelled = false

    repository
      .listBooks()
      .then((books) => {
        if (!cancelled) setState({ status: 'ready', books })
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

  const busy = importing.status === 'busy' || importing.status === 'scanning'

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
      setState({ status: 'ready', books: await repository.listBooks() })
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
      setState({ status: 'ready', books: await repository.listBooks() })
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message: `Couldn’t remove “${book.title}”. ${
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
      <h1 className={styles.title}>Library</h1>

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

      {state.status === 'loading' && <p className={styles.pending}>Loading…</p>}

      {state.status === 'failed' && (
        <div className={styles.error} role="alert">
          <p>Couldn’t open your library.</p>
          <p className={styles.pending}>{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && state.books.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No books yet</p>
          <p>Add some with the buttons above.</p>
        </div>
      )}

      {state.status === 'ready' && state.books.length > 0 && (
        <ul className={styles.list}>
          {state.books.map((book) => (
            <li key={book.id} className={styles.card}>
              <div className={styles.cardRow}>
                <Link to={`/book/${book.id}`} className={styles.cardLink}>
                  <span className={styles.emptyTitle}>{book.title}</span>
                  <p className={styles.pending}>
                    {book.author ? `${book.author} · ` : ''}
                    {book.type === 'dense-technical' ? 'Dense' : 'Fiction'}
                  </p>
                </Link>

                {removing === book.id ? (
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
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove ${book.title}`}
                    onClick={() => setRemoving(book.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
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
