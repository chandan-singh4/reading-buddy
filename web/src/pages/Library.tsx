import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { ACCEPTED_EXTENSIONS, ImportError, importBook, type ImportStage } from '../import/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import styles from './page.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; books: BookMeta[] }
  | { status: 'failed'; message: string }

type ImportState =
  | { status: 'idle' }
  | { status: 'busy'; stage: ImportStage; filename: string }
  | { status: 'failed'; message: string }

const STAGE_LABEL: Record<ImportStage, string> = {
  reading: 'Reading',
  parsing: 'Parsing',
  saving: 'Saving',
}

/**
 * The home screen: every imported book, newest first, plus the file picker that
 * puts them there. Reads and writes through the WP-03 repository.
 */
export default function Library() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [importing, setImporting] = useState<ImportState>({ status: 'idle' })

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

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = ''
    if (!file) return

    setImporting({ status: 'busy', stage: 'reading', filename: file.name })

    try {
      await importBook(file, {
        onStage: (stage) => {
          setImporting({ status: 'busy', stage, filename: file.name })
        },
      })
      setImporting({ status: 'idle' })
      setState({ status: 'ready', books: await repository.listBooks() })
    } catch (error: unknown) {
      // `ImportError` messages are already written for a reader; anything else
      // is unexpected, so show it rather than hide it behind a friendly lie.
      setImporting({
        status: 'failed',
        message:
          error instanceof ImportError
            ? error.message
            : `Something went wrong importing “${file.name}”. ${
                error instanceof Error ? error.message : String(error)
              }`,
      })
    }
  }

  const busy = importing.status === 'busy'

  return (
    <>
      <h1 className={styles.title}>Library</h1>

      <div className={styles.importer}>
        <input
          id="import-file"
          className={styles.fileInput}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          disabled={busy}
          onChange={(event) => {
            void onPick(event)
          }}
        />
        <label htmlFor="import-file" className={styles.importButton} aria-disabled={busy}>
          {busy ? 'Importing…' : 'Add a book'}
        </label>
        <p className={styles.pending}>
          EPUB, PDF, Markdown, plain text or Word (.docx). Kindle books (.azw3,
          .kfx) can’t be opened — convert one to EPUB first, with Calibre.
        </p>

        {busy && (
          <p className={styles.pending} role="status">
            {STAGE_LABEL[importing.stage]} “{importing.filename}”… Large books can
            take a few seconds.
          </p>
        )}

        {importing.status === 'failed' && (
          <div className={styles.error} role="alert">
            <p>Couldn’t import that file.</p>
            <p className={styles.pending}>{importing.message}</p>
          </div>
        )}
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
          <p>Add one with the button above.</p>
        </div>
      )}

      {state.status === 'ready' && state.books.length > 0 && (
        <ul className={styles.list}>
          {state.books.map((book) => (
            <li key={book.id} className={styles.card}>
              <Link to={`/book/${book.id}`}>
                <span className={styles.emptyTitle}>{book.title}</span>
                <p className={styles.pending}>
                  {book.author ? `${book.author} · ` : ''}
                  {book.type === 'dense-technical' ? 'Dense' : 'Fiction'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
