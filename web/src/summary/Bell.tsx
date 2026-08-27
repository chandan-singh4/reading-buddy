import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import type { StoredAlert } from '../storage/db.ts'
import { alertStore } from '../storage/summaries.ts'
import { approve } from './engine.ts'
import styles from './bell.module.css'

/**
 * The bell on the Home screen.
 *
 * Two things arrive here, and they are opposites:
 *
 * - **A summary is ready.** News. Tapping it opens the chapter.
 * - **A book is waiting to be asked about.** A question. The reader says yes,
 *   and only then is a call paid for.
 *
 * The second is the reader's own rule. The book they opened last summarises
 * itself; everything else queues here. Without that, a shelf of forty half-read
 * books would spend a hundred calls the first time the app came up.
 *
 * Reads straight from the table rather than from a parent's state. The work
 * that fills it runs in the background and finishes whenever it finishes — very
 * often while the reader is on another screen entirely.
 */
export function Bell() {
  const [alerts, setAlerts] = useState<StoredAlert[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    setAlerts(await alertStore.list())
  }, [])

  useEffect(() => {
    void refresh()
    /*
     * Polled, not subscribed. The sweep writes rows from outside React, and a
     * five-second look at a table holding a handful of rows is cheaper than
     * wiring a change feed through Dexie for a feature this small. If the bell
     * ever needs to be instant, that is the change to make.
     */
    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [refresh])

  const unseen = alerts.filter((alert) => !alert.seen).length

  async function onToggle() {
    const next = !open
    setOpen(next)
    // Opening the bell is reading it. The count is "new since you last looked".
    if (next && unseen > 0) {
      await alertStore.markAllSeen()
      await refresh()
    }
  }

  async function onApprove(alert: StoredAlert) {
    setBusy(alert.id)
    try {
      await approve(alert.bookId, alert.chapter)
    } catch {
      // Left in the list, so the reader can try again. Nothing was spent.
    } finally {
      setBusy(undefined)
      await refresh()
    }
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.bell}
        onClick={() => void onToggle()}
        aria-expanded={open}
        aria-label={unseen > 0 ? `Notifications, ${unseen} new` : 'Notifications'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">
          <path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unseen > 0 && <span className={styles.count}>{unseen}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          {alerts.length === 0 ? (
            <p className={styles.empty}>
              Nothing yet. Summaries appear here as you finish chapters.
            </p>
          ) : (
            <ul className={styles.list}>
              {alerts.map((alert) => (
                <li key={alert.id} className={styles.item}>
                  <div className={styles.book}>{alert.bookTitle}</div>
                  <div className={styles.chapter}>
                    Chapter {alert.chapter} · {alert.chapterTitle}
                  </div>

                  {alert.kind === 'ready' ? (
                    <Link
                      className={styles.action}
                      to={`/book/${alert.bookId}/chapters?chapter=${alert.chapter}&from=${encodeURIComponent('/')}`}
                      onClick={() => setOpen(false)}
                    >
                      Read the summary
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={styles.approve}
                      disabled={busy === alert.id}
                      onClick={() => void onApprove(alert)}
                    >
                      {busy === alert.id ? 'Summarising…' : 'Summarise this chapter'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
