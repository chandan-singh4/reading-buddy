import { useState } from 'react'

import { type BookActivity, type DayActivity, type ReadingSession } from './gather.ts'
import type { SessionActivity } from '../storage/db.ts'
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

/**
 * A quiet tail this long is worth offering to trim. It matches the silence the
 * check-in waits for, so the log offers by hand exactly what the bar offers in
 * the moment — and never proposes trimming an ordinary pause.
 */
const QUIET_TO_OFFER = 10

/** `9:05 pm`. The 12-hour clock, because the rest of the screen reads as prose. */
export function clockTime(at: number): string {
  const d = new Date(at)
  const h = d.getHours()
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${
    h < 12 ? 'am' : 'pm'
  }`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Whether a sitting finished on a later calendar day than it began. */
export function pastMidnight(line: ReadingSession): boolean {
  const from = new Date(line.startTime)
  const to = new Date(line.endTime)
  return from.toDateString() !== to.toDateString()
}

/**
 * `11:41 pm – 12:25 am`, and `· Aug 29` when the sitting ran past midnight.
 *
 * A session belongs to the day it *began*, which is the right answer — one
 * sitting is one sitting, and a chapter finished at ten past midnight was read
 * in the evening, not in the small hours of a day the reader had not begun.
 * But the filing must not hide the fact. Naming the day it ended is the whole
 * of the fix: nothing moves, and nothing is unexplained.
 */
export function span(line: ReadingSession): string {
  const range = `${clockTime(line.startTime)} – ${clockTime(line.endTime)}`
  if (!pastMidnight(line)) return range
  const end = new Date(line.endTime)
  return `${range} · ${MONTHS[end.getMonth()]} ${end.getDate()}`
}

/** `1h 3m`, or `43 min`. Hours only once there are hours. */
export function spell(minutes: number): string {
  if (minutes < 1) return '<1 min'
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${rest}m`
}

/** What each screen of a book is called in the log. */
const ACTIVITY_NAMES: Record<SessionActivity, string | undefined> = {
  reading: undefined,
  details: 'Book details',
  chapters: 'Chapter summaries',
  notes: 'Notes',
  contents: 'Contents',
  bookmarks: 'Bookmarks',
  recap: 'Last time',
  veda: 'With Veda',
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
  /*
   * A visit spent somewhere other than the pages says so, and says it first.
   * "Reading" over a sitting that was the book details or the notes is not
   * wrong so much as unhelpful — the reader remembers what they did, and the
   * log has to agree with them before it can tell them anything.
   *
   * The chapter still follows it when there is one, because a look at the
   * notes is a look at the notes *of somewhere*. The section is dropped: three
   * parts is more than a one-line row can carry.
   */
  const doing = line.activity === undefined ? undefined : ACTIVITY_NAMES[line.activity]
  if (doing !== undefined) return parts.length === 0 ? doing : `${doing} · ${parts[0]}`

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
  /*
   * A sitting that crossed midnight lent only part of itself to this day, and
   * the day's total counts only that part. Saying "19 min of 44 min" is what
   * makes the column add up in the reader's head instead of looking wrong.
   */
  const time =
    line.dayMinutes < line.durationMinutes
      ? `${spell(line.dayMinutes)} of ${spell(line.durationMinutes)}`
      : spell(line.durationMinutes)

  const parts = [{ text: time, veda: false }]
  if (line.highlightCount > 0) {
    parts.push({
      text: `${line.highlightCount} highlight${line.highlightCount === 1 ? '' : 's'}`,
      veda: false,
    })
  }
  /*
   * Before the counts, because it is a length of time and the row's first part
   * is a length of time. "1h 3m · 20m with Veda" says at a glance what the
   * sitting was: most of an hour, a third of it talking.
   */
  if (line.vedaMinutes >= 1) {
    // A tilde on the sittings from before the lamp was timed. They are floors,
    // and a reader comparing two rows should be able to see which is which.
    const about = line.vedaMeasured ? '' : '~'
    parts.push({ text: `${about}${spell(line.vedaMinutes)} with Veda`, veda: true })
  }
  /*
   * Said plainly, and next to the time it came out of. A sitting that reads
   * "1h 12m · 22 min away" is one the reader can check against their memory —
   * which is the only way this figure earns any trust at all.
   */
  if (line.awayMinutes >= 1) {
    parts.push({ text: `${spell(line.awayMinutes)} away`, veda: false })
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

/**
 * The one correction the reader can make to a sitting.
 *
 * Two directions, never both. A sitting with time already taken off offers it
 * back; a sitting that ended in a long silence offers to take it off. The
 * second case is the flat battery and the phone left face-down — the check-in
 * never got an answer because nobody was there to close the book either.
 *
 * Deliberately not a general time editor. A reader who can set any number can
 * write themselves a streak, and then the whole screen is a diary rather than
 * a record.
 */
function Correction({
  line,
  onAdjust,
}: {
  line: ReadingSession
  onAdjust: Adjust
}) {
  if (line.awayMinutes >= 1) {
    return (
      <button
        type="button"
        className={styles.fixBtn}
        onClick={() => onAdjust(line.id, 0)}
      >
        I was reading — count it back
      </button>
    )
  }

  if (line.quietMinutes >= QUIET_TO_OFFER) {
    return (
      <button
        type="button"
        className={styles.fixBtn}
        onClick={() => onAdjust(line.id, line.quietMinutes * 60_000)}
      >
        I stepped away for the last {spell(line.quietMinutes)}
      </button>
    )
  }

  return null
}

function Commit({
  line,
  bookTitle,
  author,
  onAdjust,
}: {
  line: ReadingSession
  bookTitle: string | undefined
  author: string | undefined
  onAdjust?: Adjust
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
          <span className={styles.commitAt}>{span(line)}</span>
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
        {onAdjust !== undefined && <Correction line={line} onAdjust={onAdjust} />}
      </div>
    </li>
  )
}

function BookLog({ book, onAdjust }: { book: BookActivity; onAdjust?: Adjust }) {
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
          <Commit
            key={line.id}
            line={line}
            bookTitle={book.bookTitle}
            author={book.author}
            onAdjust={onAdjust}
          />
        ))}

        {micro.length > 0 &&
          (open ? (
            micro.map((line) => (
              <Commit
                key={line.id}
                line={line}
                bookTitle={book.bookTitle}
                author={book.author}
                onAdjust={onAdjust}
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

/** How a screen above hears that a sitting's away time should change. */
export type Adjust = (sessionId: string, awayMs: number) => void

export default function DayLog({
  day,
  onAdjust,
}: {
  day: DayActivity | undefined
  onAdjust?: Adjust
}) {
  // Open on arrival: the reader tapped a square to see this, so hiding it
  // behind a second tap would answer their question with a door.
  const [open, setOpen] = useState(true)

  if (day === undefined || day.books.length === 0) return null

  const sessions = day.books.reduce((sum, book) => sum + book.sessions.length, 0)

  return (
    <div className={styles.log}>
      {/* The summary is the button. A day with four books is a long list, and
          the one line above it already says most of what the reader came for —
          so the list folds away and the line stays. */}
      <button
        type="button"
        className={styles.logSum}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          {day.books.length} book{day.books.length === 1 ? '' : 's'} · {sessions} session
          {sessions === 1 ? '' : 's'} · {spell(day.totalMinutes)} total
        </span>
        <span className={styles.logFold} aria-hidden="true">
          {open ? '⌃' : '⌄'}
        </span>
      </button>
      {open &&
        day.books.map((book) => (
          <BookLog key={book.bookId} book={book} onAdjust={onAdjust} />
        ))}
    </div>
  )
}
