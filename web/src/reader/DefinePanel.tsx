/**
 * Define: a glass loupe held over the word the reader tapped.
 *
 * Drawn to `design-inspiration/define-panel-prototype.html` — the sections come
 * in that order and the shape is that file's. What this adds is the wiring:
 * real Merriam-Webster data, a panel anchored at the word instead of at a fixed
 * `top: 206px`, and glass that takes its colour from the reader's theme.
 *
 * ## Every section is optional
 *
 * A word with no recording, no synonyms and no etymology is a perfectly good
 * entry with three fewer boxes in it. Nothing here renders an empty container
 * with a heading over it, because a labelled empty box reads as a failure while
 * an absent one reads as a word that simply has no synonyms.
 *
 * ## The reader is never dead-ended
 *
 * Each of the ways a lookup can come back with nothing offers Ask Veda. "No
 * dictionary entry for 'asdfghjkl'" is a complete answer; "no entry, and here
 * is the other thing you could do" is a useful one.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { lookUpWord, wordFrom, type Lookup } from './defineWord.ts'
import type { DefineEntry } from './dictionary.ts'
import { placeLoupe, type Loupe, type WordRect } from './loupe.ts'
import { wordStore, type WordStore } from '../storage/words.ts'
import styles from './DefinePanel.module.css'

export interface DefinePanelProps {
  /** What the reader had selected. The first word of it is looked up. */
  selected: string
  /** The selected word's lines, in viewport coordinates. */
  rects: readonly WordRect[]
  onClose: () => void
  /** Take this word to the tutor. The panel closes on the way. */
  onAsk: (word: string) => void
  /** Swapped for a scratch store in tests. */
  store?: WordStore
}

/** A speaker, for the pronunciation. */
function SayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.5 4.5 0 0016.5 12z" />
    </svg>
  )
}

/** The tutor's star, the same one the lamp uses. */
function VedaGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9l-4.4 3.4L16.6 18 12 14.8 7.4 18l1.5-5.6L4.5 9l5.6-1.4z" />
    </svg>
  )
}

function BookmarkGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z" />
    </svg>
  )
}

/**
 * The syllable dots, with the stressed syllable told apart.
 *
 * MW does not mark stress in `hw` — it is in the respelling, as `ˈ` — so this
 * does not guess at one. The prototype bolds a syllable; a bold syllable chosen
 * at random would be worse than none, so the dots are drawn plainly and the
 * stress stays where MW put it, in the respelling below.
 */
function Syllables({ said }: { said: string }) {
  return <div className={styles.syllables}>{said.split('·').join(' · ')}</div>
}

/** One part of speech and its senses. Numbering runs on across the groups. */
function SenseGroup({
  group,
  from,
}: {
  group: DefineEntry['senseGroups'][number]
  from: number
}) {
  return (
    <div className={styles.group}>
      <div className={styles.label}>{group.pos}</div>
      {group.senses.map((sense, index) => (
        <div className={styles.sense} key={`${sense.text}-${index}`}>
          <span className={styles.num}>{from + index}</span>
          <span className={styles.def}>
            {sense.text}
            {sense.example && <span className={styles.example}>“{sense.example}”</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The Origin box: the chain where there is one, the prose where there is not. */
function Origin({ etymology }: { etymology: NonNullable<DefineEntry['etymology']> }) {
  const { chain, kin, prose } = etymology

  return (
    <div className={styles.etym}>
      <div className={styles.label}>Origin — tracing the root</div>
      {chain.length > 0 ? (
        <ul className={styles.chain}>
          {chain.map((node, index) => (
            <li key={`${node.root}-${index}`}>
              <span className={styles.root}>{node.root}</span>
              {node.lang && <span className={styles.era}>{node.lang}</span>}
              {node.gloss && <span className={styles.gloss}>{node.gloss}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.prose}>{prose}</p>
      )}
      {kin && kin.length > 0 && (
        <div className={styles.kin}>
          Shares its root with{' '}
          {kin.map((word, index) => (
            <span key={word}>
              {index > 0 && (index === kin.length - 1 ? ' and ' : ', ')}
              <i>{word}</i>
            </span>
          ))}
          .
        </div>
      )}
    </div>
  )
}

export function DefinePanel({ selected, rects, onClose, onAsk, store = wordStore }: DefinePanelProps) {
  const panel = useRef<HTMLDivElement>(null)
  const [found, setFound] = useState<Lookup | null>(null)
  const [saved, setSaved] = useState(false)
  const [asked, setAsked] = useState(() => wordFrom(selected))
  const [place, setPlace] = useState<Loupe | null>(null)
  /** Set when a recording refused to play. See `say`. */
  const [mute, setMute] = useState(false)

  /*
   * No `useBackDismiss` here, on purpose.
   *
   * `Reader` already keeps one history entry per open layer, and the loupe is
   * one of its layers. A second copy of the hook inside the panel kept its own
   * count of the same stack: the Reader's copy saw the entry the panel had just
   * pushed, read it as one of its own left behind, and went back — which the
   * panel's copy then read as the reader's back gesture and closed on. From the
   * phone that looked like Define doing nothing at all.
   */

  /*
   * The lookup, redone when a synonym chip is tapped.
   *
   * `live` is the guard every async effect in this app carries: the reader can
   * tap a second chip before the first answer lands, and without it the older
   * answer would arrive last and win.
   */
  useEffect(() => {
    let live = true
    setFound(null)
    setMute(false)
    void lookUpWord(asked, store).then((answer) => {
      if (live) setFound(answer)
    })
    return () => {
      live = false
    }
  }, [asked, store])

  useEffect(() => {
    let live = true
    void store.isSaved(asked).then((already) => {
      if (live) setSaved(already)
    })
    return () => {
      live = false
    }
  }, [asked, store])

  /*
   * Measured, then placed — the panel's height decides which side of the word
   * it can go on, so there is nothing to place until it has been drawn once.
   * `scrollHeight`, not the rect: once the cap is on, the rect reports the
   * capped height and measuring that would let the cap shrink itself on every
   * pass.
   */
  useLayoutEffect(() => {
    const node = panel.current
    if (!node) return
    setPlace(
      placeLoupe(rects, {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        wants: node.scrollHeight,
      }),
    )
  }, [rects, found])

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
  }, [])

  /*
   * A recording that will not play takes its own button away.
   *
   * There is still no error message: the word is defined either side of it, and
   * a sentence about audio would be the loudest thing in the panel. But a
   * speaker that does nothing when tapped is a lie, and the 2026-08-24 report
   * ("I tap the sound and hear nothing") was exactly that — a wrong URL behind
   * a button that looked perfectly healthy. Now the button leaves, and the
   * respelling beside it still says how the word sounds.
   */
  const say = useCallback((url: string) => {
    void new Audio(url).play().catch(() => setMute(true))
  }, [])

  const keep = useCallback(() => {
    if (found?.state !== 'entry') return
    const gloss = found.entry.senseGroups[0]?.senses[0]?.text
    setSaved(true)
    void store.saveWord(found.entry.headword, gloss ? { gloss } : {}).catch(() => setSaved(false))
  }, [found, store])

  const entry = found?.state === 'entry' ? found.entry : null

  /*
   * Senses are numbered straight through, across the parts of speech.
   *
   * The prototype numbers 1 and 2 under "adjective" and carries on at 3 under
   * "noun". Restarting at 1 in each group would be the other reasonable
   * reading, and it is not what the design does — a reader referring to "sense
   * 3" should find one sense 3 in the panel.
   */
  let counted = 0

  return createPortal(
    <>
      {/* A click, never a pointerdown. The house rule: a surface that closes on
          `pointerdown` is gone before the browser sends the `click` that
          follows, and the browser aims that click at whatever is underneath. */}
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />

      {place && (
        <span
          className={styles.stem}
          aria-hidden="true"
          style={{
            left: `${place.left + place.stemLeft - 9}px`,
            top: place.above ? `${place.top + Math.min(place.limit, panel.current?.scrollHeight ?? 0) - 9}px` : `${place.top - 8}px`,
            transform: `rotate(45deg)`,
          }}
        />
      )}

      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Define ${asked}`}
        tabIndex={-1}
        data-above={place ? String(place.above) : 'false'}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        style={
          place
            ? {
                top: `${place.top}px`,
                left: `${place.left}px`,
                width: `${place.width}px`,
                maxHeight: `${place.limit}px`,
              }
            : // Before the first measurement: off-screen but laid out, so the
              // height it wants is real rather than guessed.
              { top: '0', left: '-9999px', width: '340px', visibility: 'hidden' }
        }
      >
        <div className={styles.head}>
          <div>
            <div className={styles.word}>{entry?.headword ?? asked}</div>
            {entry && entry.syllables !== entry.headword && <Syllables said={entry.syllables} />}
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {entry && (
          <>
            {(entry.pronunciation || entry.partsOfSpeech.length > 0) && (
              <div className={styles.pron}>
                {entry.pronunciation?.audioUrl && !mute && (
                  <button
                    type="button"
                    className={styles.say}
                    aria-label={`Pronounce ${entry.headword}`}
                    onClick={() => say(entry.pronunciation!.audioUrl!)}
                  >
                    <SayGlyph />
                  </button>
                )}
                {entry.pronunciation && (
                  <span className={styles.respelling}>{entry.pronunciation.respelling}</span>
                )}
                <div className={styles.pos}>
                  {entry.partsOfSpeech.map((pos) => (
                    <span key={pos}>{pos}</span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.hair} />

            {entry.senseGroups.map((group) => {
              const from = counted + 1
              counted += group.senses.length
              return <SenseGroup key={group.pos} group={group} from={from} />
            })}

            {entry.synonyms.length > 0 && (
              <>
                <div className={styles.hair} />
                <div className={styles.group}>
                  <div className={styles.label}>Synonyms</div>
                  <div className={styles.chips}>
                    {entry.synonyms.map((word) => (
                      <button
                        key={word}
                        type="button"
                        className={styles.chip}
                        // A chip is another lookup, not a link away. The reader
                        // is following a meaning and should stay in the loupe.
                        onClick={() => setAsked(word)}
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {entry.etymology && <Origin etymology={entry.etymology} />}
          </>
        )}

        {!found && (
          <div className={styles.waiting} aria-label="Looking it up">
            <span />
            <span />
            <span />
          </div>
        )}

        {found?.state === 'none' && (
          <p className={styles.quiet}>
            No dictionary entry for <em>{found.word}</em>.
            {found.suggestions.length > 0 && ` Did you mean ${found.suggestions.slice(0, 3).join(', ')}?`}
          </p>
        )}

        {found?.state === 'offline' && (
          <p className={styles.quiet}>
            Can’t reach the dictionary right now — this word isn’t saved offline yet.
          </p>
        )}

        {found?.state === 'busy' && (
          <p className={styles.quiet}>
            The dictionary is out of lookups for today. It resets tomorrow.
          </p>
        )}

        {found?.state === 'failed' && (
          <p className={styles.quiet}>The dictionary couldn’t be reached. Try again in a moment.</p>
        )}

        <div className={styles.foot}>
          <button
            type="button"
            className={`${styles.act} ${styles.veda}`}
            onClick={() => onAsk(asked)}
          >
            <VedaGlyph />
            Ask Veda
          </button>
          {entry && (
            <button
              type="button"
              className={`${styles.act} ${styles.save}`}
              onClick={keep}
              disabled={saved}
            >
              <BookmarkGlyph />
              {saved ? 'Saved' : 'Save word'}
            </button>
          )}
        </div>

        {entry && <p className={styles.source}>{entry.source}</p>}
      </div>
    </>,
    document.body,
  )
}
