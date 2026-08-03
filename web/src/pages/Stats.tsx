import { useEffect, useState } from 'react'

import { shelvesOf, type HomeShelves } from '../app/homeShelves.ts'
import { repository } from '../storage/index.ts'
import styles from './page.module.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; shelves: HomeShelves }
  | { status: 'failed'; message: string }

/**
 * Reading analytics, deliberately minimal (`backlog.md`): current book,
 * progress, books completed. No streaks, badges or goals unless the reader
 * sets one themselves — Product Principle 4 declines those outright.
 *
 * Shares `homeShelves.ts` with the Home screen rather than computing its own
 * numbers, so "Currently Reading" and "Finished" can never quietly disagree
 * between the two screens.
 */
export default function Stats() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    Promise.all([repository.listBooks(), repository.listPositions()])
      .then(([books, positions]) => {
        if (cancelled) return
        setState({ status: 'ready', shelves: shelvesOf(books, positions) })
      })
      .catch((error: unknown) => {
        if (cancelled) return
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
      <h1 className={styles.title}>Stats</h1>
      <p className={styles.lede}>
        What you’re reading, kept quiet — no streaks, no pressure, no goal unless
        you set one.
      </p>

      {state.status === 'loading' && <p className={styles.pending}>Loading…</p>}

      {state.status === 'failed' && (
        <div className={styles.error} role="alert">
          <p>Couldn’t load your stats.</p>
          <p className={styles.pending}>{state.message}</p>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Current book</h2>
            <div className={styles.card}>
              {state.shelves.currentlyReading ? (
                <>
                  <p className={styles.emptyTitle}>
                    {state.shelves.currentlyReading.book.title}
                  </p>
                  <p className={styles.pending}>
                    {state.shelves.currentlyReading.percent !== undefined
                      ? `${state.shelves.currentlyReading.percent}% read`
                      : 'In progress'}
                  </p>
                </>
              ) : (
                <p className={styles.pending}>Nothing open right now.</p>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Books completed</h2>
            <div className={styles.card}>
              <p className={styles.emptyTitle}>{state.shelves.finished.length}</p>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Reading time</h2>
            <div className={styles.card}>
              <p className={styles.pending}>
                Coming soon — nothing tracks session time yet.
              </p>
            </div>
          </section>
        </>
      )}
    </>
  )
}
