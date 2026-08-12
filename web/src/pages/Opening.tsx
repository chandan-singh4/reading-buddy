/**
 * The book's cover, held for a moment while the reading screen gets ready.
 *
 * ## What this replaces
 *
 * Opening a book has two short waits in it — the book and its manifest, then
 * the section itself — and each had a word standing in for it: "Opening…", then
 * "Loading…". Both are honest and both are the wrong answer. They are text
 * appearing and being replaced by other text, on a screen the reader is looking
 * straight at, and they last an unpredictable fraction of a second: sometimes a
 * blink, sometimes long enough to read. That variability is the whole problem.
 * A wait you can't predict reads as the app struggling; the same wait behind a
 * cover reads as a book being opened.
 *
 * Borrowed, knowingly, from Google Books, which shows the cover for a beat
 * before the page. It works there for a reason worth naming: the cover is not a
 * spinner dressed up. It is *the thing being opened*, and it answers the only
 * question a reader has in that moment — did it take the tap, and is it the
 * right book.
 *
 * ## Why it is held for a minimum
 *
 * A cover shown for 40 ms is a flash, which is the fault this set out to
 * remove, not a fix for it. So the floor below is the point of the component as
 * much as the cover is: every open takes the same beat whether the section came
 * from memory or from disk, and identical openings are what stop the reader
 * noticing openings at all.
 *
 * It does cost that beat on a warm cache. That is the trade, made deliberately:
 * a predictable half-second is cheaper to the eye than an unpredictable
 * hundred milliseconds.
 *
 * ## The fade is on the way out, never on the way in
 *
 * The cover leaves by fading while the page sits underneath it, opaque, from
 * the first frame. Fading the *page* up instead would let the background show
 * through the seam — the camera-shutter flash this project has now met four
 * times, and which `styles/transitions.css` and `Reader.module.css` both carry
 * scars from. The same shape as the route transition, for the same reason.
 */

import { useEffect, useMemo, useState } from 'react'

import { Cover } from '../app/Cover.tsx'
import { useCovers } from '../app/useCovers.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import styles from './Opening.module.css'

/**
 * The shortest a cover is ever on screen.
 *
 * Long enough to register as a deliberate beat rather than a flicker, short
 * enough that a reader who taps a book and immediately wants the text does not
 * feel held. Under roughly 300 ms this reads as a glitch; much over 700 ms and
 * the app starts feeling slower than it is, which is the opposite of the
 * complaint. Google Books sits nearer a second — that is a network app opening
 * a book it does not have yet, and this one usually does.
 */
const HOLD_MS = 550

/**
 * The longest a cover will wait for a page that isn't coming.
 *
 * This screen is opaque, full-bleed and covers the way back, so "still loading"
 * and "wedged" look identical from behind it — and a book that never resolves
 * and never fails would trap the reader on a picture of its own cover. Generous
 * enough that no honest read is cut short, short enough to be an escape rather
 * than a wait. What's underneath is the reading screen's own "Loading…" and the
 * ← Library link, which is the state this replaced and a fine place to land.
 */
const GIVE_UP_MS = 10_000

/**
 * How long the fade takes, read from the token that sets it.
 *
 * ## Why not `animationend`
 *
 * That was the first version, and it is the tidier-looking one: the stylesheet
 * owns the duration, the component is simply told when it is over. It was
 * dropped because the event is not reliably delivered. A page that is not
 * compositing — a background tab, a phone with the screen off, a browser under
 * load — keeps the animation in `running` and never fires the end, and this
 * element is opaque and full-screen, so "never fires" means the reader is left
 * looking at a cover instead of their book. That is not a hypothetical: it is
 * what happened the first time this was watched from outside.
 *
 * A timer always fires. So the timer decides, and the stylesheet still owns the
 * number — this reads the very token the animation is written in terms of,
 * rather than restating it. The fallback matches the one in the CSS, for the
 * same reason it is there: an unresolvable token must not become a zero.
 */
function fadeMs(): number {
  // No animation to wait out under the preference — the rule in the stylesheet
  // cuts it to a millisecond, and holding the full duration over an element
  // that is already invisible would just be a pause.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0

  const token = getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-screen')
    .trim()
  const value = Number.parseFloat(token)
  if (!Number.isFinite(value) || value <= 0) return 300
  // `300ms` and `0.3s` are both legal here, and the token has been written both
  // ways in this project's history.
  return token.endsWith('ms') ? value : value * 1000
}

type Phase = 'showing' | 'leaving' | 'gone'

/**
 * Whether the cover is still owed some time, and when it may start to leave.
 *
 * Split out from the component because the timing is the part with the bugs in
 * it: the clock starts when the screen mounts, not when the text arrives, so a
 * section that took 900 ms to load has already served the hold and leaves at
 * once.
 */
function useHold(ready: boolean, abandon: boolean): Phase {
  const [phase, setPhase] = useState<Phase>('showing')
  // Mount time, captured once. `useState` rather than `useRef` only because the
  // initialiser is the natural place to read the clock.
  const [began] = useState(() => Date.now())

  useEffect(() => {
    if (phase === 'gone') return

    if (phase === 'leaving') {
      const done = window.setTimeout(() => setPhase('gone'), fadeMs())
      return () => {
        window.clearTimeout(done)
      }
    }

    // Nothing to wait for and nothing to show: the book is missing, or it
    // wouldn't open. Out of the way immediately and without a fade — an error
    // the reader has to sit through half a second of cover to reach is a worse
    // screen than the one this replaced.
    if (abandon) {
      setPhase('gone')
      return
    }

    if (!ready) {
      const bailout = window.setTimeout(() => setPhase('leaving'), GIVE_UP_MS)
      return () => {
        window.clearTimeout(bailout)
      }
    }

    const owed = HOLD_MS - (Date.now() - began)
    if (owed <= 0) {
      setPhase('leaving')
      return
    }

    const timer = window.setTimeout(() => setPhase('leaving'), owed)
    return () => {
      window.clearTimeout(timer)
    }
  }, [phase, ready, abandon, began])

  return phase
}

export interface OpeningProps {
  /**
   * Whatever is known about the book right now — from the shelf memories on the
   * first frame, from the store once it has answered. `undefined` only on a
   * cold deep link, where the cover is drawn blank rather than not at all.
   */
  book: BookMeta | undefined
  /** The book being opened, known from the URL before anything has loaded. */
  id: BookId
  /** There is text on screen underneath. */
  ready: boolean
  /** There will never be text — missing, or it failed to open. */
  abandon: boolean
}

export function Opening({ book, id, ready, abandon }: OpeningProps) {
  const phase = useHold(ready, abandon)
  const covers = useCovers(useMemo(() => [id], [id]))

  if (phase === 'gone') return null

  return (
    /*
     * `aria-hidden`, and no live region: a screen reader is not waiting on a
     * repaint, and announcing "cover of X" before announcing the chapter would
     * be one more thing to sit through. The title is already announced by the
     * page behind this.
     */
    <div
      className={phase === 'leaving' ? `${styles.opening} ${styles.leaving}` : styles.opening}
      aria-hidden="true"
    >
      <div className={styles.plate}>
        <div className={styles.art}>
          <Cover title={book?.title ?? ''} src={covers.get(id)} />
        </div>
        {book?.title && <p className={styles.title}>{book.title}</p>}
        {book?.author && <p className={styles.author}>{book.author}</p>}
      </div>
    </div>
  )
}
