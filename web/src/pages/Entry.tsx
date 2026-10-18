/**
 * One entry, with the raw words and the shaped words as an equal pair (WP-61).
 *
 * ## Why a pair and not a replacement
 *
 * `decisions.md` settled it: the raw transcript is canonical and nothing
 * overwrites it. A shape is a second copy that the reader can remake or throw
 * away. So this screen never chooses for them — it shows both, one tap apart,
 * and says under each what it is.
 *
 * It opens on the shaped copy when one exists, because that is the readable
 * one, and on the raw words when it does not. The switch only appears when
 * there is something to switch to; WP-62 makes the shapes, and this screen
 * lights up on its own the first time one is written.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { entryStore, type StoredEntry } from '../storage/index.ts'
import { shapeMark } from '../journal/shapeMark.ts'
import styles from './page.module.css'
import journal from './Journal.module.css'
import entryStyles from './Entry.module.css'

type Side = 'shaped' | 'raw'

export default function Entry() {
  const { entryId } = useParams<{ entryId: string }>()
  const navigate = useNavigate()

  const [entry, setEntry] = useState<StoredEntry | null | undefined>(undefined)
  const [side, setSide] = useState<Side>('shaped')
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState('')

  useEffect(() => {
    if (!entryId) {
      setEntry(null)
      return
    }
    let cancelled = false
    void entryStore.getEntry(entryId).then((row) => {
      if (cancelled) return
      setEntry(row ?? null)
      // Open on whichever copy exists. Set here rather than in the initial
      // state, because at that moment there is no entry to ask.
      setSide(row?.shaped ? 'shaped' : 'raw')
    })
    return () => {
      cancelled = true
    }
  }, [entryId])

  async function remove() {
    if (!entry) return
    try {
      await entryStore.deleteEntry(entry.id)
    } catch {
      // Say so. A delete that quietly fails leaves the reader believing a
      // thought is gone when it is still on the list a tap away.
      setFailure('That didn’t delete. The entry is still here.')
      setConfirming(false)
      return
    }
    // `replace`, so Back from the journal does not return to an entry that is
    // no longer there.
    void navigate('/journal', { replace: true })
  }

  if (entry === undefined) {
    return (
      <div className={journal.page}>
        <p className={styles.pending}>Opening…</p>
      </div>
    )
  }

  if (entry === null) {
    return (
      <div className={journal.page}>
        <Link to="/journal" className={journal.back}>
          ← Journal
        </Link>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>That entry is gone</p>
          <p>It may have been deleted on this device.</p>
        </div>
      </div>
    )
  }

  const shaped = entry.shaped
  const showing: Side = shaped ? side : 'raw'
  const words = showing === 'shaped' && shaped ? shaped.text : entry.raw

  return (
    <div className={journal.page}>
      <header className={journal.head}>
        <Link to="/journal" className={journal.back}>
          ← Journal
        </Link>
        {entry.title && <h1 className={styles.title}>{entry.title}</h1>}
        <p className={entryStyles.when}>
          <time dateTime={entry.at}>{spoken(entry.at)}</time>
          <span className={journal.dot} aria-hidden="true" />
          <span>{shapeMark(entry)}</span>
        </p>
      </header>

      {shaped && (
        <div className={entryStyles.pair} role="group" aria-label="How to read this entry">
          <button
            type="button"
            aria-pressed={showing === 'shaped'}
            className={entryStyles.side}
            onClick={() => setSide('shaped')}
          >
            {shapeMark(entry)}
          </button>
          <button
            type="button"
            aria-pressed={showing === 'raw'}
            className={entryStyles.side}
            onClick={() => setSide('raw')}
          >
            Your words
          </button>
        </div>
      )}

      <article className={entryStyles.prose}>{words}</article>

      <p className={entryStyles.note}>
        {showing === 'raw'
          ? 'Exactly what the microphone heard. Nothing added, nothing taken away.'
          : `Written by ${shaped?.model ?? 'a model'} from your words. Your own words are kept.`}
      </p>

      {failure && <p className={styles.error}>{failure}</p>}

      <div className={entryStyles.actions}>
        {confirming ? (
          <>
            <button
              type="button"
              className={entryStyles.danger}
              onClick={() => {
                void remove()
              }}
            >
              Delete for good
            </button>
            <button
              type="button"
              className={entryStyles.quiet}
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            className={entryStyles.quiet}
            onClick={() => setConfirming(true)}
          >
            Delete this entry
          </button>
        )}
      </div>
    </div>
  )
}

/** The full moment, in the reader's own locale. */
function spoken(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'Undated'
  return at.toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
