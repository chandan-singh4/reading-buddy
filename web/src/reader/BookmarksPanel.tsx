/**
 * The bookmarks tab: a stack of page-edge tabs, one per mark.
 *
 * Built to the reader's own prototype. The idea it carries, and the reason it
 * is not a list of rows: a bookmark is a physical thing. At rest you see the
 * edge of the page and a numbered flag poking out of the book. Tap it and the
 * page opens — a ribbon drops from the top, the passage you marked is there
 * with the words highlighted, and the way back to it is one more tap.
 *
 * One row is open at a time, like a book. Opening a second closes the first,
 * because two open pages in a stack of tabs is a shape a book cannot make and
 * an accordion that keeps everything open is just a long list with extra steps.
 *
 * Presentational, like the rest of `Chrome`. It is handed rows and told what to
 * call; it works nothing out about where a bookmark is.
 */

import { useState } from 'react'

import type { Anchor } from '../structure/index.ts'
import styles from './BookmarksPanel.module.css'

/**
 * Which of the four ribbon colours a mark wears.
 *
 * A field rather than a fixed rule, because it is a *category* the reader will
 * one day set — "blue is the argument, red is the bit I disagree with". Nothing
 * writes it yet, so the panel cycles the four in order, which at least makes a
 * stack of tabs easy to tell apart.
 */
export type BookmarkColor = 'a' | 'b' | 'c' | 'd'

const PALETTE: BookmarkColor[] = ['a', 'b', 'c', 'd']

/** The class per colour, spelled out so the class names survive minification. */
const RIBBON: Record<BookmarkColor, string> = {
  a: styles.ra ?? '',
  b: styles.rb ?? '',
  c: styles.rc ?? '',
  d: styles.rd ?? '',
}

const FLAG: Record<BookmarkColor, string> = {
  a: styles.fa ?? '',
  b: styles.fb ?? '',
  c: styles.fc ?? '',
  d: styles.fd ?? '',
}

/**
 * A bookmark as this panel needs it.
 *
 * Structural rather than `StoredBookmark`: `page` is not stored and cannot be
 * — see the note on `StoredBookmark` — so the reading page works it out from
 * the spine and hands it in. `null` for a book with no page numbers yet.
 */
export interface BookmarkRow {
  id: string
  anchor: Anchor
  /** The marked passage: the reader's name for it, or the paragraph's opening. */
  label: string
  chapter: number
  /** The chapter's own title. */
  chapterTitle: string
  /** The page the mark falls on, or `null` when the book has no page numbers. */
  page: number | null
  /** ISO 8601. */
  savedAt: string
  color?: BookmarkColor
}

export interface BookmarksPanelProps {
  bookmarks: readonly BookmarkRow[]
  onJumpToBookmark: (anchor: Anchor) => void
  onRenameBookmark: (id: string, label: string) => void
  onDeleteBookmark: (id: string) => void
}

/** "Ch 6 · p.91", or just the chapter for a book that has no page numbers. */
function whereItIs(bookmark: BookmarkRow): string {
  const chapter = bookmark.chapterTitle
  return bookmark.page === null ? chapter : `${chapter} · p.${bookmark.page}`
}

/**
 * When it was marked, in the reader's own locale.
 *
 * Date only. A bookmark made at 22:14 is not more findable for saying so, and
 * the line is a footnote under the passage rather than a record.
 */
function savedOn(iso: string): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'saved'
  return `saved ${when.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`
}

export function BookmarksPanel({
  bookmarks,
  onJumpToBookmark,
  onRenameBookmark,
  onDeleteBookmark,
}: BookmarksPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (bookmarks.length === 0) {
    return (
      <div className={styles.panel}>
        <p className={styles.empty}>
          No bookmarks yet. Tap the top right corner of the page to mark where you are,
          the way you’d fold a corner down.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <ul className={styles.list}>
        {bookmarks.map((bookmark, index) => {
          const open = openId === bookmark.id
          const colour = bookmark.color ?? PALETTE[index % PALETTE.length]!

          return (
            <li key={bookmark.id} className={styles.bk} data-open={open}>
              {/* The ribbon and the flag are the same colour and never both
                  visible: the flag is the closed page's marker, the ribbon is
                  the open one's. */}
              <span className={`${styles.ribbon} ${RIBBON[colour]}`} aria-hidden="true" />

              {bookmark.page !== null && (
                <span className={styles.flag} aria-hidden="true">
                  <span className={FLAG[colour]}>{bookmark.page}</span>
                </span>
              )}

              <button
                type="button"
                className={styles.bkHead}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : bookmark.id)}
              >
                <span className={styles.eyebrow}>{whereItIs(bookmark)}</span>
                <span className={styles.snip}>
                  <span className={styles.hl}>{bookmark.label}</span>
                </span>
              </button>

              <div className={styles.more}>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.go}
                    /* `inert` while furled: the row is closed, so nothing
                        inside it should be reachable by tab. */
                    inert={!open}
                    onClick={() => onJumpToBookmark(bookmark.anchor)}
                  >
                    {bookmark.page === null ? 'Go to this page' : `Go to page ${bookmark.page}`}
                  </button>

                  {/*
                    Rename through the browser's own prompt, deliberately. An
                    inline field inside a panel that closes on every navigation
                    is a lot of state to get wrong for something done rarely,
                    and `prompt` is already keyboard-accessible and already
                    dismissible. A cancelled prompt returns null, which must not
                    be read as "clear the name".
                  */}
                  <button
                    type="button"
                    className={styles.action}
                    inert={!open}
                    aria-label={`Rename ${bookmark.label}`}
                    onClick={() => {
                      const named = window.prompt('Name this bookmark', bookmark.label)
                      if (named !== null) onRenameBookmark(bookmark.id, named)
                    }}
                  >
                    <span aria-hidden="true">✎</span>
                  </button>

                  <button
                    type="button"
                    className={styles.action}
                    inert={!open}
                    aria-label={`Remove ${bookmark.label}`}
                    onClick={() => onDeleteBookmark(bookmark.id)}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>

                <p className={styles.meta2}>{savedOn(bookmark.savedAt)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
