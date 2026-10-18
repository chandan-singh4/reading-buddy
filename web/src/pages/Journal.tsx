/**
 * The journal, at its first slice (WP-60).
 *
 * Deliberately almost nothing: a way in to the sheet, and enough of a list to
 * prove an entry was kept. The real journal screen — entries, the raw and
 * shaped pair, filters — is WP-61 and replaces the body of this file.
 *
 * Outside `AppShell`, like the reading screen, and not a fifth tab in the swipe
 * row. The journal is half the app rather than a sibling of Settings, and the
 * split front door (WP-65) is how both halves will be reached.
 */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

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

      {entries !== null && entries.length > 0 && (
        <ul className={journal.list}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.card}>
              <time className={styles.pending} dateTime={entry.at}>
                {when(entry.at)}
              </time>
              <p className={journal.raw}>{entry.raw}</p>
            </li>
          ))}
        </ul>
      )}

      <SpeakSheet open={speaking} onClose={() => setSpeaking(false)} onSaved={onSaved} />
    </div>
  )
}

/** The reader's own locale, because this is the only clock they think in. */
function when(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
