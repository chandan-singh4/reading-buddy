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
 *
 * ## The Counsel is a second voice, and is drawn as one
 *
 * A shape is the reader's own words in a better order. A reading (WP-67) adds
 * something they did not say, so it is never mixed into the entry: it sits in
 * a drawer under everything else, shut until they open it, with the model's
 * name and a plain line saying it is not professional advice under every
 * reading rather than once in a settings screen.
 *
 * Inside that drawer sits one optional line (WP-68): the angle the reader
 * wants for the next reading. It is state on this screen and nothing else.
 * It is never written to the entry, to settings, or to the sync, and it is
 * empty again as soon as a reading comes back.
 *
 * ## Where it came from
 *
 * An entry told to the Scribe from a page carries the passage (WP-63). It is
 * shown under the entry, not above it: the reader's answer is the content and
 * the book's sentence is the footnote. The book is named by reading it, not by
 * a copy of its title, so renaming a book does not leave a wrong name here.
 *
 * When that re-shape fails — or never ran, because an installed app is still on
 * an older build — the entry carries `editedAt` and the credit line says the
 * shaped copy comes from earlier words. One press makes it again.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { entryStore, repository, type StoredEntry } from '../storage/index.ts'
import { Markdown } from '../reader/markdown.tsx'
import { modelName } from '../reader/tutor.ts'
import { shapeMark } from '../journal/shapeMark.ts'
import { CounselMark, LevelMark, VoiceMark } from '../journal/marks.tsx'
import {
  ANGLE_HINT,
  ANGLE_LABEL,
  ANGLE_LIMIT,
  askCounsel,
  COUNSEL_BLURB,
  COUNSEL_LABEL,
} from '../journal/counsel.ts'
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
  /** The name of the book an entry grew out of, when it grew out of one. */
  const [book, setBook] = useState('')
  /** The reading is shut until the reader opens it — the entry is the screen. */
  const [reading, setReading] = useState(false)
  const [asking, setAsking] = useState(false)
  /**
   * The angle the reader wants for the *next* reading, and only that one
   * (WP-68). It lives in this component's state and nowhere else: it is never
   * written to the entry, to settings, or to the sync, and it is cleared the
   * moment a reading comes back.
   */
  const [angle, setAngle] = useState('')

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

  /*
   * The book's name, for an entry told to the Scribe from a page (WP-63).
   *
   * Read separately rather than stored on the entry, because a book can be
   * renamed and a copy of its title would then be wrong. A book that has been
   * deleted leaves this empty, and the passage still reads — `decisions.md`
   * says the thought outlives the book.
   */
  const bookId = entry && entry !== null ? entry.link?.bookId : undefined
  useEffect(() => {
    if (!bookId) {
      setBook('')
      return
    }
    let cancelled = false
    void repository.getBook(bookId).then((meta) => {
      if (!cancelled) setBook(meta?.title ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [bookId])

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
   * Ask for one reading of the entry, and store it beside the words (WP-67).
   *
   * It reads `raw` and not the shaped copy. An opinion on a model's rewrite of
   * what the reader said is an opinion on the wrong text.
   */
  async function read() {
    if (!entry || asking) return
    setFailure('')
    setAsking(true)
    try {
      /*
       * One argument when there is no steer, so the call is the call it always
       * was. The angle is handed over here and is not saved with the result.
       */
      const steer = angle.trim()
      const read = steer ? await askCounsel(entry.raw, steer) : await askCounsel(entry.raw)
      await entryStore.setCounsel(entry.id, {
        ...(read.angle ? { angle: read.angle } : {}),
        model: read.model,
        at: new Date().toISOString(),
        text: read.text,
      })
      const saved = await entryStore.getEntry(entry.id)
      if (saved) setEntry(saved)
      setReading(true)
      // Empty again for the next request. Cleared only on success: a reader
      // whose model would not answer must not also lose what they typed.
      setAngle('')
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : 'That didn’t work just now.')
    } finally {
      setAsking(false)
    }
  }

  async function dropCounsel() {
    if (!entry) return
    await entryStore.clearCounsel(entry.id)
    const saved = await entryStore.getEntry(entry.id)
    if (saved) setEntry(saved)
    setReading(false)
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
  /*
   * The shape was made from words the reader has since corrected. The screen
   * says so rather than hoping: the re-shape after a correction can fail, and
   * an installed app that has not taken a new build may never have tried. A
   * stale copy that looks current is the one failure the reader cannot see.
   */
  const stale = Boolean(shaped && entry.editedAt)
  const counsel = entry.counsel

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
                {reshaping
                  ? 'Making it again…'
                  : stale
                    ? `${shapeMark(entry)} from your earlier words`
                    : `${shapeMark(entry)} by ${modelName(shaped.model)}`}
              </span>
              {stale && !reshaping && (
                <button
                  type="button"
                  className={entryStyles.swap}
                  disabled={working !== null}
                  onClick={() => {
                    void give(shaped.level)
                  }}
                >
                  {working === shaped.level ? 'Making it again…' : 'Make it again'}
                </button>
              )}
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
              <span>
                {reshaping
                  ? 'Making the shape again…'
                  : stale
                    ? 'Exactly what you said — the shaped copy is older'
                    : 'Exactly what you said'}
              </span>
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

      {/*
        * Where the thought came from, when it came from a page (WP-63). Under
        * the entry and under the credit line, because the reader's own words
        * are the content and the passage is the footnote to them — the other
        * way round on the sheet where the entry was spoken, where the passage
        * was the reason to speak and the words did not exist yet.
        */}
      {!editing && entry.link && (
        <section className={entryStyles.from} aria-label="The passage this came from">
          <blockquote className={entryStyles.fromQuote}>{entry.link.quote}</blockquote>
          <p className={entryStyles.fromBook}>
            {book ? (
              <Link to={`/book/${entry.link.bookId}`} className={entryStyles.fromLink}>
                {book}
              </Link>
            ) : (
              'A book that is no longer on the shelf'
            )}
          </p>
        </section>
      )}

      {failure && <p className={styles.error}>{failure}</p>}

      {/*
        * A drawer, always, shut until the reader opens it.
        *
        * It used to stand open on an entry with no shape, on the reasoning
        * that three cards and a paragraph were the right size for the one
        * decision a blank entry offers. Reported from the phone: on a new
        * entry the block fills the screen and there is nothing to close. The
        * entry is the screen, and that holds hardest on the entry that has
        * just been spoken.
        */}
      {!editing && (
        <section className={entryStyles.give} aria-label="Give these words a shape">
          {!choosing ? (
            <button
              type="button"
              className={entryStyles.giveToggle}
              onClick={() => setChoosing(true)}
            >
              {shaped ? 'Give it a different shape' : 'Give it a shape'}
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
              <button
                type="button"
                className={entryStyles.giveToggle}
                onClick={() => setChoosing(false)}
              >
                Not now
              </button>
            </>
          )}
        </section>
      )}

      {/*
        * The Counsel (WP-67). Shut by default, and the angle is the one line
        * that shows — the entry is the screen, and this is a second voice on
        * it. The angle is what the model says it is doing, and it is shown
        * whether or not the body is open, because the frame is the opinion.
        */}
      {!editing && (
        <section className={entryStyles.counsel} aria-label="A reading of this entry">
          {counsel ? (
            <>
              <button
                type="button"
                className={entryStyles.counselHead}
                onClick={() => setReading((open) => !open)}
                aria-expanded={reading}
              >
                <CounselMark className={entryStyles.creditMark} />
                <span className={entryStyles.counselAngle}>
                  {counsel.angle ?? 'One reading of your words'}
                </span>
                <span className={entryStyles.counselMore} aria-hidden="true">
                  {reading ? '−' : '+'}
                </span>
              </button>
              {reading && (
                <>
                  {counsel.stale && (
                    <p className={entryStyles.aside}>
                      This reading comes from your earlier words.
                    </p>
                  )}
                  <Markdown text={counsel.text} className={entryStyles.counselProse} />
                  {/*
                    * Said every time the body is open, not once in a settings
                    * screen. A reader a month from now opens this and has to
                    * be able to see what wrote it.
                    */}
                  <p className={entryStyles.counselFoot}>
                    {modelName(counsel.model)}. One reading, not advice from a professional.
                  </p>
                  {/*
                    * One optional line, used once (WP-68). The field starts
                    * empty by the reader's choice: a prefilled angle would
                    * steer them back to the frame the model already picked.
                    */}
                  <label className={entryStyles.angle}>
                    <span className={entryStyles.angleLabel}>{ANGLE_LABEL}</span>
                    <input
                      type="text"
                      className={entryStyles.angleField}
                      value={angle}
                      maxLength={ANGLE_LIMIT}
                      placeholder="Optional — say how you want it read"
                      onChange={(event) => setAngle(event.target.value)}
                    />
                    <span className={entryStyles.angleHint}>{ANGLE_HINT}</span>
                  </label>
                  <div className={entryStyles.counselActions}>
                    <button
                      type="button"
                      className={entryStyles.quiet}
                      disabled={asking}
                      onClick={() => {
                        void read()
                      }}
                    >
                      {asking ? 'Reading…' : 'Read it again'}
                    </button>
                    <button
                      type="button"
                      className={entryStyles.quiet}
                      onClick={() => {
                        void dropCounsel()
                      }}
                    >
                      Remove this reading
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                className={entryStyles.counselAsk}
                disabled={asking}
                onClick={() => {
                  void read()
                }}
              >
                <CounselMark className={entryStyles.creditMark} />
                <span>{asking ? 'Reading your words…' : COUNSEL_LABEL}</span>
              </button>
              <p className={entryStyles.counselLede}>{COUNSEL_BLURB}</p>
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
