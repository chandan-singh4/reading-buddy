/**
 * One entry: the reader's own words, and the shape a model gave them (WP-61).
 *
 * ## The entry is the screen
 *
 * Everything else on this page is a control, and a control must not come
 * between the title and the first line. So the title is followed by the words
 * and by nothing else. Which copy is being read, who wrote it, and how to ask
 * for another shape all sit *under* the entry, quietly, in the order a reader
 * reaches for them.
 *
 * ## Why a pair and not a replacement
 *
 * `decisions.md` settled it: the raw transcript is canonical and no model
 * overwrites it. A shape is a second copy the reader can remake or throw away.
 * So this screen never chooses for them — it opens on the shaped copy when one
 * exists, because that is the readable one, and the reader's own words are one
 * press away under it.
 *
 * ## Correcting, and re-shaping
 *
 * The reader can edit their own words here (2026-10-19). The recogniser
 * mishears, and a transcript they cannot fix is not their words either. When a
 * shape exists it is made again at the same strength straight afterwards,
 * because a shape built from a sentence that no longer exists is worse than no
 * shape at all.
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
  /** The three levels are a drawer once a shape exists, and open before that. */
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState(false)
  /** True only while a correction is being re-shaped, which is a different
   *  thing to the reader asking for a shape. */
  const [remaking, setRemaking] = useState(false)
  const [draft, setDraft] = useState('')

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
  async function give(level: ShapeLevel, words?: string) {
    if (!entry || working) return
    setFailure('')
    setWorking(level)
    try {
      const shaping = await shapeEntry(level, words ?? entry.raw)
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
      setChoosing(false)
      return true
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : 'That didn’t work just now.')
      return false
    } finally {
      setWorking(null)
    }
  }

  /**
   * Keep the correction, then make the shape again from the corrected words.
   *
   * In that order, and the words are saved before the model is asked. A model
   * that will not answer must never cost the reader their edit.
   */
  async function keepEdit() {
    if (!entry) return
    const words = draft.trim()
    if (!words || words === entry.raw) {
      setEditing(false)
      return
    }
    setFailure('')
    try {
      await entryStore.setRaw(entry.id, words)
    } catch {
      setFailure('That didn’t save. Your words are still on the screen.')
      return
    }
    setEditing(false)
    const corrected = await entryStore.getEntry(entry.id)
    if (corrected) setEntry(corrected)

    const level = entry.shaped?.level
    if (!level) return
    setRemaking(true)
    const madeAgain = await give(level, words)
    setRemaking(false)
    if (!madeAgain) {
      setFailure('Your words are saved. The shaped copy still comes from the older words.')
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
  const reshaping = remaking

  return (
    <div className={journal.page}>
      <header className={journal.head}>
        <Link to="/journal" className={journal.back}>
          ← Journal
        </Link>
        {entry.title && <h1 className={styles.title}>{entry.title}</h1>}
        <p className={entryStyles.when}>
          <time dateTime={entry.at}>{spoken(entry.at)}</time>
        </p>
      </header>

      {/*
        * The entry, and immediately after the title. The shaped copy is
        * markdown — the two stronger levels write headings and lists — and
        * goes through the renderer the tutor's answers use, so a model cannot
        * put HTML on this page. The raw copy is printed exactly as the
        * recogniser left it, because that is the whole claim it makes.
        */}
      {editing ? (
        <div className={entryStyles.editing}>
          <textarea
            className={entryStyles.editor}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Your words"
            rows={10}
            autoFocus
          />
          <div className={entryStyles.editActions}>
            <button
              type="button"
              className={entryStyles.strong}
              onClick={() => void keepEdit()}
            >
              Keep the change
            </button>
            <button
              type="button"
              className={entryStyles.quiet}
              onClick={() => setEditing(false)}
            >
              Leave it as it was
            </button>
          </div>
          {shaped && (
            <p className={entryStyles.aside}>
              The shaped copy is made again from your corrected words.
            </p>
          )}
        </div>
      ) : showing === 'shaped' ? (
        <Markdown text={words} className={entryStyles.shapedProse} />
      ) : (
        <article className={entryStyles.prose}>{words}</article>
      )}

      {/*
        * Under the entry, in one quiet line: what this copy is, and the way to
        * the other one. It was a two-up switch above the words, which put a
        * control between the title and the first sentence of the reader's own
        * thought. The entry is the screen; this is a footnote to it.
        */}
      {!editing && (
        <p className={entryStyles.credit}>
          {showing === 'shaped' && shaped ? (
            <>
              <LevelMark level={shaped.level} className={entryStyles.creditMark} />
              <span>
                {reshaping ? 'Making it again…' : `${shapeMark(entry)} by ${modelName(shaped.model)}`}
              </span>
              <button
                type="button"
                className={entryStyles.swap}
                onClick={() => setSide('raw')}
              >
                Your words
              </button>
            </>
          ) : (
            <>
              <VoiceMark className={entryStyles.creditMark} />
              <span>{reshaping ? 'Making the shape again…' : 'Exactly what you said'}</span>
              <button
                type="button"
                className={entryStyles.swap}
                onClick={() => {
                  setDraft(entry.raw)
                  setEditing(true)
                }}
              >
                Correct it
              </button>
              {shaped && (
                <button
                  type="button"
                  className={entryStyles.swap}
                  onClick={() => setSide('shaped')}
                >
                  {shapeMark(entry)}
                </button>
              )}
            </>
          )}
        </p>
      )}

      {failure && <p className={styles.error}>{failure}</p>}

      {/*
        * A drawer once a shape exists, and open before one does. Three cards
        * and two paragraphs is the right size for the one decision on a blank
        * entry, and far too much room for a decision already made.
        */}
      {!editing && (
        <section className={entryStyles.give} aria-label="Give these words a shape">
          {shaped && !choosing ? (
            <button
              type="button"
              className={entryStyles.giveToggle}
              onClick={() => setChoosing(true)}
            >
              Give it a different shape
            </button>
          ) : (
            <>
              <h2 className={entryStyles.giveHead}>
                {shaped ? 'Give it a different shape' : 'Give it a shape'}
              </h2>
              {!shaped && (
                <p className={entryStyles.giveLede}>
                  A free model writes a second copy. Your own words stay as you spoke them.
                </p>
              )}
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
              {shaped && (
                <button
                  type="button"
                  className={entryStyles.giveToggle}
                  onClick={() => setChoosing(false)}
                >
                  Not now
                </button>
              )}
            </>
          )}
        </section>
      )}

      {!editing && (
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
      )}
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
