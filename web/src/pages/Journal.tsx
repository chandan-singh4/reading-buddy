/**
 * The journal — every thought the reader has spoken, newest first (WP-61).
 *
 * One stream, cut by day. Not notebooks: `decisions.md` settled that a
 * notebook is a saved filter over this one list, and WP-64 adds the filters.
 * Until then the stream is the whole screen, which is also the honest shape
 * for a journal with four entries in it.
 *
 * A card shows the shaped words when a shape exists, because that is the
 * readable copy, and says so on the card. Those words are markdown, so the
 * card strips the marks off them — see `journal/plain.ts`. The raw words are never gone — the
 * entry screen keeps both, side by side.
 *
 * Outside `AppShell`, like the reading screen, and not a fifth tab in the swipe
 * row. The journal is half the app rather than a sibling of Settings, and the
 * split front door (WP-65) is how both halves will be reached.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { plainWords } from '../journal/plain.ts'
import { shapeMark } from '../journal/shapeMark.ts'
import SpeakSheet from '../journal/SpeakSheet.tsx'
import { entryStore, type StoredEntry } from '../storage/index.ts'
import styles from './page.module.css'
import journal from './Journal.module.css'

export default function Journal() {
  const [entries, setEntries] = useState<StoredEntry[] | null>(null)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void entryStore.listEntries().then((rows) => {
      if (!cancelled) setEntries(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Put the new row straight on the list rather than re-reading the table. The
  // sheet already handed it over, and a second read would make the entry appear
  // a beat after the sheet dropped.
  const onSaved = useCallback((entry: StoredEntry) => {
    setEntries((rows) => [entry, ...(rows ?? [])])
  }, [])

  const days = useMemo(() => byDay(entries ?? []), [entries])

  return (
    <div className={journal.page}>
      <header className={journal.head}>
        <Link to="/" className={journal.back}>
          ← Reading
        </Link>
        <h1 className={styles.title}>Journal</h1>
        <p className={styles.lede}>Speak a thought. The words are yours and they stay.</p>
      </header>

      <button type="button" className={journal.speak} onClick={() => setSpeaking(true)}>
        Speak a thought
      </button>

      {entries !== null && entries.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing yet</p>
          <p>Your first entry will sit here.</p>
        </div>
      )}

      {days.map((day) => (
        <section key={day.key} className={journal.day}>
          <h2 className={journal.dayMark}>{day.mark}</h2>
          <ul className={journal.list}>
            {day.entries.map((entry) => (
              <li key={entry.id}>
                <Link to={`/journal/${entry.id}`} className={journal.entry}>
                  {entry.title && <span className={journal.entryTitle}>{entry.title}</span>}
                  {/* Words, never notation. A card has three lines, and
                      `## Dream recollection` spends one of them on a mark the
                      reader did not write and cannot read. */}
                  <p className={journal.snippet}>
                    {entry.shaped ? plainWords(entry.shaped.text) : entry.raw}
                  </p>
                  <span className={journal.meta}>
                    <time dateTime={entry.at}>{clock(entry.at)}</time>
                    <span className={journal.dot} aria-hidden="true" />
                    <span>{shapeMark(entry)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <SpeakSheet open={speaking} onClose={() => setSpeaking(false)} onSaved={onSaved} />
    </div>
  )
}

/** Entries under the day they were spoken on, in the order they arrived. */
interface Day {
  key: string
  mark: string
  entries: StoredEntry[]
}

/**
 * The list is already newest-first, so a day break is simply a card whose day
 * differs from the one before it. No sorting, no map of arrays.
 */
function byDay(entries: StoredEntry[]): Day[] {
  const days: Day[] = []
  for (const entry of entries) {
    const key = dayKey(new Date(entry.at))
    const last = days[days.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else days.push({ key, mark: dayMark(new Date(entry.at)), entries: [entry] })
  }
  return days
}

/**
 * The local calendar day, not the ISO date. A thought spoken at 23:40 belongs
 * to the reader's evening; in UTC it may already be tomorrow.
 */
function dayKey(at: Date): string {
  if (Number.isNaN(at.getTime())) return 'unknown'
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
}

function dayMark(at: Date): string {
  if (Number.isNaN(at.getTime())) return 'Undated'
  const today = new Date()
  if (dayKey(at) === dayKey(today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(at) === dayKey(yesterday)) return 'Yesterday'
  return at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** The reader's own locale, because this is the only clock they think in. */
function clock(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
