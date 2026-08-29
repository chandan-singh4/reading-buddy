import { useState } from 'react'

import { type BookActivity, type DayActivity, type ReadingSession } from './gather.ts'
import styles from './stats.module.css'

/**
 * A day's reading, told as a commit log.
 *
 * ## Why a commit log
 *
 * The reader's own analogy, and it is the right one. A day's total is a
 * diffstat: true, and impossible to check. What makes a git log readable is
 * that it groups by repository, hangs each change off one line, and squashes
 * the noise — and a day of reading has exactly those three problems. Two books
 * are two repositories. A sitting is a commit. A ten-second look at the subject
 * tags is the typo fix nobody needs to see.
 *
 * ## Squashing
 *
 * Anything under a minute is folded into one row that says how many were
 * folded, and opens when tapped. Nothing is thrown away — a squashed commit is
 * still in the history — but the default view is the reading, not the
 * bookkeeping.
 *
 * ## The nodes
 *
 * A filled node is a sitting. A hollow one is a lookup: a minute or two, which
 * is the shape of opening a book to check a reference. The distinction is drawn
 * rather than labelled, because it is a hint and not a claim.
 */

/** Under this many minutes, a session reads as a lookup rather than a sitting. */
const LOOKUP_MINUTES = 2

/** `9:05 pm`. The 12-hour clock, because the rest of the screen reads as prose. */
export function clockTime(at: number): string {
  const d = new Date(at)
  const h = d.getHours()
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${
    h < 12 ? 'am' : 'pm'
  }`
}

/** `1h 3m`, or `43 min`. Hours only once there are hours. */
export function spell(minutes: number): string {
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${rest}m`
}

/**
 * The chapter and section, with anything that merely repeats itself dropped.
 *
 * Two kinds of repetition, both common and both from the book rather than from
 * us. A first chapter often carries the book's own name, so "Walden · Walden ·
 * Economy" is noise. And an EPUB heading often has the contributor glued to the
 * end of it — "Part 1: Approaching the Unconscious Carl G. Jung" — which the
 * author line directly above has already said.
 */
export function heading(
  line: ReadingSession,
  bookTitle: string | undefined,
  author?: string,
): string {
  const trailing = author?.trim()
  const trim = (part: string): string => {
    if (trailing === undefined || trailing === '') return part
    const end = part.slice(-trailing.length)
    return end.toLowerCase() === trailing.toLowerCase()
      ? part.slice(0, -trailing.length).replace(/[\s—–-]+$/u, '')
      : part
  }

  const seen = new Set([bookTitle?.trim().toLowerCase()])
  const parts: string[] = []
  for (const raw of [line.chapterTitle, line.sectionTitle]) {
    const part = raw === undefined ? undefined : trim(raw)
    const key = part?.trim().toLowerCase()
    if (part === undefined || key === undefined || key === '' || seen.has(key)) continue
    seen.add(key)
    parts.push(part)
  }
  // No chapter recorded — true of every session written before the app tracked
  // the place, and of a session that ended before the first page rendered.
  return parts.length === 0 ? 'Reading' : parts.join(' · ')
}

/**
 * `1h 3m · 2 highlights · 3 chats with Veda · 11 Q&A`, zeroes left out.
 *
 * This is the diff line of the commit: what changed in that sitting, not just
 * how long it took. Time alone says the reader was present. The marks and the
 * conversation say what they did while they were there.
 */
export function meta(line: ReadingSession): { text: string; veda: boolean }[] {
  const parts = [{ text: spell(line.durationMinutes), veda: false }]
  if (line.highlightCount > 0) {
    parts.push({
      text: `${line.highlightCount} highlight${line.highlightCount === 1 ? '' : 's'}`,
      veda: false,
    })
  }
  if (line.chatCount > 0) {
    parts.push({
      text: `${line.chatCount} chat${line.chatCount === 1 ? '' : 's'} with Veda`,
      veda: true,
    })
    // Only alongside the chats it happened in. On its own it would be a count
    // with nothing to attach to.
    if (line.qaCount > 0) parts.push({ text: `${line.qaCount} Q&A`, veda: true })
  }
  return parts
}

function Commit({
  line,
  bookTitle,
  author,
}: {
  line: ReadingSession
  bookTitle: string | undefined
  author: string | undefined
}) {
  return (
    <li className={styles.commit}>
      <span
        className={`${styles.node} ${
          line.durationMinutes < LOOKUP_MINUTES ? styles.nodeLookup : ''
        }`}
        aria-hidden="true"
      />
      <div className={styles.commitBody}>
        <div className={styles.commitHead}>
          <span className={styles.commitAt}>{clockTime(line.startTime)}</span>
          <span className={styles.commitWhat}>{heading(line, bookTitle, author)}</span>
        </div>
        {/* Violet is Veda's and nothing else's, everywhere in this app. The
            separators stay in the quiet colour so the eye follows the words. */}
        <div className={styles.commitMeta}>
          {meta(line).map((part, i) => (
            <span key={part.text}>
              {i > 0 && ' · '}
              <span className={part.veda ? styles.metaVeda : undefined}>{part.text}</span>
            </span>
          ))}
        </div>
      </div>
    </li>
  )
}

function BookLog({ book }: { book: BookActivity }) {
  const [open, setOpen] = useState(false)

  const sittings = book.sessions.filter((line) => !line.micro)
  const micro = book.sessions.filter((line) => line.micro)

  return (
    <section className={styles.repo}>
      <header className={styles.repoHead}>
        <span className={styles.repoIcon} aria-hidden="true">
          📖
        </span>
        <div className={styles.repoNames}>
          <h4 className={styles.repoTitle}>
            {book.bookTitle ?? 'A book no longer in your library'}
          </h4>
          {book.author !== undefined && <div className={styles.repoBy}>{book.author}</div>}
        </div>
        <span className={styles.repoTime}>{spell(book.totalMinutes)}</span>
      </header>

      <ol className={styles.tree}>
        {sittings.map((line) => (
          <Commit key={line.id} line={line} bookTitle={book.bookTitle} author={book.author} />
        ))}

        {micro.length > 0 &&
          (open ? (
            micro.map((line) => (
              <Commit
                key={line.id}
                line={line}
                bookTitle={book.bookTitle}
                author={book.author}
              />
            ))
          ) : (
            <li className={`${styles.commit} ${styles.squash}`}>
              <span className={`${styles.node} ${styles.nodeSquash}`} aria-hidden="true" />
              <button type="button" className={styles.squashBtn} onClick={() => setOpen(true)}>
                {micro.length} micro-session{micro.length === 1 ? '' : 's'} (&lt; 1 min) squashed
              </button>
            </li>
          ))}
      </ol>
    </section>
  )
}

export default function DayLog({ day }: { day: DayActivity | undefined }) {
  if (day === undefined || day.books.length === 0) return null

  const sessions = day.books.reduce((sum, book) => sum + book.sessions.length, 0)

  return (
    <div className={styles.log}>
      <div className={styles.logSum}>
        {day.books.length} book{day.books.length === 1 ? '' : 's'} · {sessions} session
        {sessions === 1 ? '' : 's'} · {spell(day.totalMinutes)} total
      </div>
      {day.books.map((book) => (
        <BookLog key={book.bookId} book={book} />
      ))}
    </div>
  )
}
