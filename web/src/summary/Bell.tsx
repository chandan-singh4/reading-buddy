import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { applyUpdate, onUpdateReady } from '../app/updates.ts'
import type { StoredAlert } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'
import { alertStore } from '../storage/summaries.ts'
import { groupApprovals, readyAlerts, type BookGroup } from './bellGroups.ts'
import { approve } from './engine.ts'
import styles from './bell.module.css'

/**
 * The bell on the Home screen.
 *
 * Two things arrive here, and they are opposites:
 *
 * - **A summary is ready.** News. Tapping it opens the chapter.
 * - **A book is waiting to be asked about.** A question, one line per *book*.
 *   Opening it lists the finished chapters that have no summary yet. The reader
 *   can take the whole book or pick chapters, and only then is a call paid for.
 *   Unread chapters are never offered: a recap of a chapter you have not
 *   reached is a spoiler, and this is a reading app.
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
  /* Which book's chapter list is open. One at a time: the panel is 320px on a
     phone, and two expanded books would push the rest off the bottom. */
  const [picking, setPicking] = useState<BookId | undefined>()
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
      await approve(alert.bookId, alert.chapter, partOf(alert))
    } catch {
      // Left in the list, so the reader can try again. Nothing was spent.
    } finally {
      setBusy(undefined)
      await refresh()
    }
  }

  /**
   * Every waiting chapter of one book, in reading order.
   *
   * One at a time rather than all at once. Each chapter is a paid call, and a
   * failure halfway through should leave the chapters before it done and the
   * ones after it still on the list — which is what happens, because a finished
   * chapter's line turns into a summary and stops being a question.
   */
  async function onApproveBook(group: BookGroup) {
    for (const [index, alert] of group.chapters.entries()) {
      setBusy(`${group.bookId}:${index + 1}/${group.chapters.length}`)
      try {
        await approve(alert.bookId, alert.chapter, partOf(alert))
      } catch {
        // One chapter failing must not abandon the rest of the book.
      }
    }
    setBusy(undefined)
    await refresh()
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
              {readyAlerts(alerts).map((alert) => (
                <li key={alert.id} className={styles.item}>
                  <div className={styles.book}>{alert.bookTitle}</div>
                  <div className={styles.chapter}>
                    Chapter {alert.chapter} · {alert.chapterTitle}
                  </div>
                  <Link
                    className={styles.action}
                    to={`/book/${alert.bookId}/chapters?chapter=${alert.chapter}&from=${encodeURIComponent('/')}`}
                    onClick={() => setOpen(false)}
                  >
                    Read the summary
                  </Link>
                </li>
              ))}

              {groupApprovals(alerts).map((group) => {
                const many = group.chapters.length > 1
                const running = busy?.startsWith(`${group.bookId}:`) ?? false
                return (
                  <li key={group.bookId} className={styles.item}>
                    <div className={styles.book}>{group.bookTitle}</div>
                    <div className={styles.chapter}>{countLabel(group.chapters)}</div>

                    <div className={styles.choices}>
                      <button
                        type="button"
                        className={styles.approve}
                        disabled={busy !== undefined}
                        onClick={() => void onApproveBook(group)}
                      >
                        {running
                          ? `Summarising ${busy?.split(':')[1]}…`
                          : many
                            ? 'Summarise the book'
                            : 'Summarise it'}
                      </button>

                      {/* Only offered when there is a choice to make. One
                          chapter behind a "pick which" step is a step for
                          nothing. */}
                      {many && (
                        <button
                          type="button"
                          className={styles.pick}
                          aria-expanded={picking === group.bookId}
                          onClick={() =>
                            setPicking(picking === group.bookId ? undefined : group.bookId)
                          }
                        >
                          {picking === group.bookId ? 'Hide chapters' : 'Pick chapters'}
                        </button>
                      )}
                    </div>

                    {picking === group.bookId && (
                      <ul className={styles.chapterList}>
                        {group.chapters.map((alert) => (
                          <li key={alert.id} className={styles.chapterRow}>
                            <span className={styles.chapterName}>{labelOf(alert)}</span>
                            <button
                              type="button"
                              className={styles.pick}
                              disabled={busy !== undefined}
                              onClick={() => void onApprove(alert)}
                            >
                              {busy === alert.id ? 'Summarising…' : 'Summarise'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** The section a line is about, in the shape the engine wants. */
function partOf(alert: StoredAlert) {
  if (alert.section === undefined) return undefined
  return { section: alert.section, title: alert.sectionTitle ?? '' }
}

/** How one waiting line reads in the picker. */
function labelOf(alert: StoredAlert): string {
  if (alert.section === undefined) return `${alert.chapter} · ${alert.chapterTitle}`
  // Indented under its chapter by the em space, so a reader scanning the list
  // can see at a glance which rows are parts of something bigger.
  return `\u2003${alert.sectionTitle}`
}

/**
 * "3 finished chapters", "2 parts of chapter 4", or both.
 *
 * Counted separately because they are different things and cost differently. A
 * reader deciding whether to spend should be told what they are buying.
 */
function countLabel(rows: readonly StoredAlert[]): string {
  const chapters = rows.filter((row) => row.section === undefined).length
  const parts = rows.length - chapters
  const said: string[] = []
  if (chapters > 0) said.push(`${chapters} finished ${chapters === 1 ? 'chapter' : 'chapters'}`)
  if (parts > 0) said.push(`${parts} named ${parts === 1 ? 'section' : 'sections'}`)
  return `${said.join(' and ')} with no summary yet`
}
