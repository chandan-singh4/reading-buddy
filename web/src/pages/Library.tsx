import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import type { BookMeta } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import styles from './page.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; books: BookMeta[] }
  | { status: 'failed'; message: string }

/**
 * The home screen: every imported book, newest first. Reads through the WP-03
 * repository — this is the first place the storage seam is exercised by the UI.
 */
export default function Library() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

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

  return (
    <>
      <h1 className={styles.title}>Library</h1>

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
          <p>Importing arrives in a later waypoint.</p>
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
