import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import type { BookId, BookMeta } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import styles from './Reader.module.css'

/**
 * Placeholder reader. It resolves the book by id so the route and the storage
 * lookup are genuinely wired; the anchored, paginated renderer is WP-12 and the
 * tap-to-reveal nav overlay is WP-13.
 *
 * Rendered outside `AppShell` on purpose — reading is full-bleed, with no
 * persistent chrome stealing vertical space.
 */
export default function Reader() {
  const { bookId } = useParams<{ bookId: string }>()
  const [book, setBook] = useState<BookMeta | null | undefined>(undefined)

  useEffect(() => {
    if (!bookId) return
    let cancelled = false

    repository
      .getBook(bookId as BookId)
      .then((found) => {
        if (!cancelled) setBook(found ?? null)
      })
      .catch(() => {
        if (!cancelled) setBook(null)
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  return (
    <div className={styles.reader}>
      <Link to="/" className={styles.back}>
        ← Library
      </Link>

      {book === undefined && <p className={styles.note}>Opening…</p>}

      {book === null && (
        <p className={styles.note} role="alert">
          That book isn’t in your library.
        </p>
      )}

      {book && (
        <article className={styles.page}>
          <h1 className={styles.bookTitle}>{book.title}</h1>
          {book.author && <p className={styles.byline}>{book.author}</p>}
          <p className={styles.note}>
            The reader itself lands in WP-12 — anchored paragraphs, paginated.
          </p>
        </article>
      )}
    </div>
  )
}
