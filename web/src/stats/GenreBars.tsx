import { useState } from 'react'
import { Link } from 'react-router'

import { genreOf, type GenreCount } from './genres.ts'
import type { BookMeta } from '../structure/index.ts'
import styles from './stats.module.css'

/**
 * What you read about, as book counts per genre.
 *
 * Independent of the scope toggle: a shelf is a shelf. Slicing it to "this
 * week" would answer a different and much less interesting question, and on a
 * quiet week it would answer nothing at all.
 *
 * The five hues carry no meaning — they separate adjacent bars and stop there.
 * The one colour on this screen that *does* mean something is violet, and it is
 * kept off this card entirely.
 */

const HUES = ['var(--g5)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g1)']

export default function GenreBars({
  genres,
  books,
  uncounted,
  fiction,
  nonfiction,
}: {
  genres: readonly GenreCount[]
  books: readonly BookMeta[]
  uncounted: number
  fiction: number
  nonfiction: number
}) {
  const [open, setOpen] = useState<string | undefined>()

  const split = fiction + nonfiction
  const max = Math.max(1, ...genres.map((g) => g.books))

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>Genres</div>

      {split > 0 && (
        <>
          <div className={styles.split} aria-hidden="true">
            <span
              className={styles.splitNf}
              style={{ width: `${(nonfiction / split) * 100}%` }}
            />
            <span className={styles.splitFi} style={{ width: `${(fiction / split) * 100}%` }} />
          </div>
          <div className={styles.splitKey}>
            Nonfiction {Math.round((nonfiction / split) * 100)}% · Fiction{' '}
            {Math.round((fiction / split) * 100)}%
          </div>
        </>
      )}

      {genres.length === 0 ? (
        <p className={styles.empty}>
          No subject headings yet. Genres appear once the catalogue has matched your books.
        </p>
      ) : (
        genres.map((genre, i) => (
          <div key={genre.name}>
            <button
              type="button"
              className={styles.gbar}
              aria-expanded={open === genre.name}
              onClick={() => setOpen(open === genre.name ? undefined : genre.name)}
            >
              <span className={styles.gbarLab}>{genre.name}</span>
              <span className={styles.gbarTrack}>
                <span
                  className={styles.gbarFill}
                  style={{
                    width: `${(genre.books / max) * 100}%`,
                    background: HUES[i % HUES.length],
                  }}
                />
              </span>
              <span className={styles.gbarVal}>{genre.books}</span>
            </button>

            {open === genre.name && (
              <ul className={styles.gbarBooks}>
                {books
                  .filter((book) => genreOf(book) === genre.name)
                  .map((book) => (
                    <li key={book.id}>
                      <Link to={`/book/${book.id}/info`}>
                        <em>{book.title}</em>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ))
      )}

      <div className={styles.cap}>
        From Google Books subject tags · tap a bar to see those books.
        {/* Said out loud rather than folded into an "Other" bar: an unmatched
            book is a gap in the catalogue, not a reading habit. */}
        {uncounted > 0 && ` ${uncounted} book${uncounted === 1 ? '' : 's'} uncounted.`}
      </div>
    </div>
  )
}
