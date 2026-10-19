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
import { Markdown } from '../reader/markdown.tsx'
import { modelName } from '../reader/tutor.ts'
import { shapeMark } from '../journal/shapeMark.ts'
import { LevelMark, VoiceMark } from '../journal/marks.tsx'
import {
  shapeEntry,
  SHAPE_BLURB,
  SHAPE_LABEL,
  SHAPE_LEVELS,
  type ShapeLevel,
} from '../journal/shape.ts'
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
  /** The level being asked for right now, or null when nothing is in flight. */
  const [working, setWorking] = useState<ShapeLevel | null>(null)

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

  /**
   * Ask a model for one shape, then store it beside the raw words.
   *
   * The entry in state is updated from the row that was written, not from the
   * reply, so what the screen shows is what the table holds. A shape that
   * failed to save must not look saved.
   */
  async function give(level: ShapeLevel) {
    if (!entry || working) return
    setFailure('')
    setWorking(level)
    try {
      const shaping = await shapeEntry(level, entry.raw)
      await entryStore.setShaped(
        entry.id,
        { level, model: shaping.model, at: new Date().toISOString(), text: shaping.text },
        shaping.title,
      )
      const saved = await entryStore.getEntry(entry.id)
      if (saved) {
        setEntry(saved)
        setSide('shaped')
      }
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : 'That didn’t work just now.')
    } finally {
      setWorking(null)
    }
  }

  async function dropShape() {
    if (!entry) return
    await entryStore.clearShaped(entry.id)
    const saved = await entryStore.getEntry(entry.id)
    if (saved) {
      setEntry(saved)
      setSide('raw')
    }
  }

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
            <LevelMark level={shaped.level} className={entryStyles.sideMark} />
            {shapeMark(entry)}
          </button>
          <button
            type="button"
            aria-pressed={showing === 'raw'}
            className={entryStyles.side}
            onClick={() => setSide('raw')}
          >
            <VoiceMark className={entryStyles.sideMark} />
            Your words
          </button>
        </div>
      )}

      {/*
        * The shaped copy is markdown — the two stronger levels write headings
        * and lists — and goes through the renderer the tutor's answers use, so
        * a model cannot put HTML on this page. The raw copy is printed exactly
        * as the recogniser left it, because that is the whole claim it makes.
        */}
      {showing === 'shaped' ? (
        <Markdown text={words} className={entryStyles.shapedProse} />
      ) : (
        <article className={entryStyles.prose}>{words}</article>
      )}

      <p className={entryStyles.note}>
        {showing === 'raw'
          ? 'Exactly what the microphone heard. Nothing added, nothing taken away.'
          : `Written by ${shaped ? modelName(shaped.model) : 'a model'}`}
      </p>

      <section className={entryStyles.give} aria-label="Give these words a shape">
        <h2 className={entryStyles.giveHead}>
          {shaped ? 'Give it a different shape' : 'Give it a shape'}
        </h2>
        <p className={entryStyles.giveLede}>
          A free model reads your words and writes a second copy. Your own words
          stay exactly as you spoke them.
        </p>
        <div className={entryStyles.levels}>
          {SHAPE_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={entryStyles.level}
              disabled={working !== null}
              aria-busy={working === level}
              onClick={() => {
                void give(level)
              }}
            >
              <LevelMark level={level} className={entryStyles.levelMark} />
              <span className={entryStyles.levelName}>
                {working === level ? `${SHAPE_LABEL[level]}ing…` : SHAPE_LABEL[level]}
              </span>
              <span className={entryStyles.levelBlurb}>{SHAPE_BLURB[level]}</span>
            </button>
          ))}
        </div>
      </section>

      {failure && <p className={styles.error}>{failure}</p>}

      <div className={entryStyles.actions}>
        {shaped && !confirming && (
          <button
            type="button"
            className={entryStyles.quiet}
            onClick={() => {
              void dropShape()
            }}
          >
            Remove the shape
          </button>
        )}
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
