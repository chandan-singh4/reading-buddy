import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { applyUpdate, onUpdateReady } from '../app/updates.ts'
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
 * - **A new build is waiting.** The reason the bell exists at all. Reading
 *   Buddy asks before it updates itself, and a reader who misses that one panel
 *   has no other way to take the update — four fixes once sat on the server for
 *   days because the prompt was dismissed. This is the second door.
 *
 * Reads straight from the table rather than from a parent's state. The work
 * that fills it runs in the background and finishes whenever it finishes — very
 * often while the reader is on another screen entirely.
 *
 * The update line is the exception: it is live state, never a stored row. A
 * stored "an update is waiting" would survive the update that answered it and
 * sit there lying. `onUpdateReady` tells a late subscriber immediately, so the
 * bell learns about a build that was found before it mounted.
 */
export function Bell() {
  const [alerts, setAlerts] = useState<StoredAlert[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | undefined>()
  const [updateWaiting, setUpdateWaiting] = useState(false)

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

  useEffect(() => onUpdateReady(() => setUpdateWaiting(true)), [])

  /*
   * A waiting build always counts, even after the bell has been opened.
   *
   * Every other line is marked seen the moment the reader looks. This one is
   * not: the badge is the only thing standing between a missed panel and a
   * phone that never updates again. It clears when the update is taken, and in
   * no other way.
   */
  const unseen = alerts.filter((alert) => !alert.seen).length + (updateWaiting ? 1 : 0)

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
          {updateWaiting && (
            <div className={styles.update}>
              <div className={styles.updateTitle}>A new version is ready</div>
              <p className={styles.updateNote}>
                Reading Buddy will reload and put you back on the same page.
              </p>
              <button type="button" className={styles.updateAction} onClick={() => applyUpdate()}>
                Update now
              </button>
            </div>
          )}

          {alerts.length === 0 && !updateWaiting ? (
            <p className={styles.empty}>
              Nothing yet. Summaries appear here as you finish chapters.
            </p>
          ) : alerts.length === 0 ? null : (
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
