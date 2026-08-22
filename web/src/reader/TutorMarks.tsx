/**
 * The marks a conversation leaves on the page: an ink stroke under the words
 * that were discussed, and a small paper slip tucked into the top edge of the
 * paragraph. Tapping either reopens that passage's thread under the lamp.
 *
 * ## Why this is HandDrawn's machinery and not a CSS class
 *
 * The brief writes the ink as `.passage-mark`, a class on "the anchored text
 * run" — which assumes a text run that can carry a class. This page has no
 * such element: the passage is a quote inside a paragraph the parser owns,
 * and wrapping its text nodes in a span would mutate the book's own DOM,
 * which every measurer in this file's neighbourhood watches. The browser's
 * highlight API cannot draw it either — `::highlight()` takes a colour, not a
 * background image.
 *
 * So the stroke is painted the way `HandDrawn` paints marker ink, with the
 * same exported helpers: real elements portalled *into* the anchored
 * paragraph, one per line of the passage, placed in the paragraph's own
 * coordinates. Everything that made that survive page turns, the toolbar's
 * scale and column-broken paragraphs — the scale division, the fold/pitch
 * arithmetic, the origin on the first fragment — applies unchanged, which is
 * exactly why it is shared rather than re-derived. The stroke itself is the
 * brief's repeating SVG, riding as the element's background.
 *
 * The slip is an absolutely positioned button in the same portalled layer —
 * positioned, never in the margin, so no text reflows. It sits at the end of
 * the passage's last inked line, not at a fixed corner of the paragraph:
 * two conversations in one paragraph must wear two visibly separate slips,
 * each on its own sentence, or the second thread is unreachable under the
 * first's sticker.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { blockOf, blocksOf, clipTo, linesOf } from './HandDrawn.tsx'
import { rangeOfQuote } from './selection.ts'
import type { StoredTutorThread } from '../storage/db.ts'
import styles from './TutorMarks.module.css'

/** One line of one passage's ink, in its paragraph's own coordinates. */
interface Stroke {
  key: string
  top: number
  left: number
  width: number
  height: number
}

/** Everything one paragraph carries for one thread: strokes, and one slip. */
interface Mark {
  key: string
  block: HTMLElement
  thread: StoredTutorThread
  strokes: Stroke[]
  /** Where the slip sits, in the paragraph's own coordinates. `null` on the
   *  continuation paragraphs of a passage — only its last one wears it. */
  slip: { top: number; left: number } | null
}

function same(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false
  return a.every((one, index) => {
    const other = b[index]!
    if (
      one.block !== other.block ||
      one.thread !== other.thread ||
      one.slip?.top !== other.slip?.top ||
      one.slip?.left !== other.slip?.left ||
      one.strokes.length !== other.strokes.length
    ) {
      return false
    }
    return one.strokes.every((stroke, at) => {
      const twin = other.strokes[at]!
      return (
        stroke.top === twin.top &&
        stroke.left === twin.left &&
        stroke.width === twin.width &&
        stroke.height === twin.height
      )
    })
  })
}

export interface TutorMarksProps {
  threads: readonly StoredTutorThread[]
  root: HTMLElement | null
  /** Anything whose change should force a re-measure — the section on screen. */
  watch?: unknown
  onOpen: (thread: StoredTutorThread) => void
  /**
   * A hold on the ink or the slip, with the finger's position. The page raises
   * a small menu there — continue, or delete. Left out, a hold does nothing and
   * the mark keeps its tap.
   */
  onHold?: (thread: StoredTutorThread, at: { x: number; y: number }) => void
}

/** How long a press has to last to be a hold. The platform figure. */
const HOLD_MS = 500

/**
 * How far the finger may travel and still be holding.
 *
 * A finger resting on glass drifts a few pixels; a finger starting a scroll
 * does not stop at ten. Below this the press is still a press.
 */
const SLOP = 10

export function TutorMarks({ threads, root, watch, onOpen, onHold }: TutorMarksProps) {
  const [marks, setMarks] = useState<Mark[]>([])

  /*
   * The hold, in three refs and no state: nothing here draws, and a press that
   * re-rendered the whole ink layer on every pointermove would be measurably
   * worse than one that does not.
   *
   * `fired` is the important one. A hold ends with the finger lifting, and a
   * lift on the same element is also a click — so without it, holding a mark
   * would raise the menu and reopen the thread underneath it.
   */
  const timer = useRef<number | undefined>(undefined)
  const from = useRef({ x: 0, y: 0 })
  const fired = useRef(false)

  const stopHold = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  // A mark can be measured away mid-press — a page turn, a font change — and a
  // timer that outlived its element would raise a menu about nothing.
  useEffect(() => stopHold, [stopHold])

  const startHold = useCallback(
    (thread: StoredTutorThread, event: React.PointerEvent) => {
      if (!onHold) return
      fired.current = false
      from.current = { x: event.clientX, y: event.clientY }
      const at = { x: event.clientX, y: event.clientY }
      stopHold()
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        fired.current = true
        onHold(thread, at)
      }, HOLD_MS)
    },
    [onHold, stopHold],
  )

  const moveHold = useCallback(
    (event: React.PointerEvent) => {
      if (timer.current === undefined) return
      const travelled = Math.hypot(event.clientX - from.current.x, event.clientY - from.current.y)
      if (travelled > SLOP) stopHold()
    },
    [stopHold],
  )

  /** A tap reopens — unless the hold already fired, in which case it is the
   *  same finger lifting and the menu is already up. */
  const tap = useCallback(
    (thread: StoredTutorThread) => {
      stopHold()
      if (fired.current) {
        fired.current = false
        return
      }
      onOpen(thread)
    },
    [onOpen, stopHold],
  )

  /** The same five handlers on the ink and on the slip. */
  const holding = useCallback(
    (thread: StoredTutorThread) => ({
      onPointerDown: (event: React.PointerEvent) => startHold(thread, event),
      onPointerMove: moveHold,
      onPointerUp: stopHold,
      onPointerCancel: stopHold,
      // The browser's own long-press menu would open over ours. This is a
      // control, not text to be copied.
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    }),
    [startHold, moveHold, stopHold],
  )

  const measure = useCallback(() => {
    if (!root || threads.length === 0) {
      setMarks((current) => (current.length === 0 ? current : []))
      return
    }

    const found: Mark[] = []

    for (const thread of threads) {
      const range = rangeOfQuote(thread.anchor, thread.excerpt)
      if (!range || !root.contains(range.commonAncestorContainer)) continue

      const first = blockOf(range.startContainer)
      const last = blockOf(range.endContainer) ?? first
      if (!first || !root.contains(first)) continue

      for (const block of blocksOf(first, last)) {
        if (!root.contains(block)) continue
        const part = clipTo(range, block)
        if (!part) continue

        const bounds = block.getBoundingClientRect()
        const scale = block.offsetWidth > 0 ? bounds.width / block.offsetWidth : 1
        if (scale <= 0) continue

        // The column-fold arithmetic, exactly as HandDrawn documents it: the
        // origin is the paragraph's first fragment, and a line in a later
        // fragment gets the offset that folds onto it.
        const frags = block.getClientRects()
        const box = frags[0] ?? bounds
        const pitch = frags.length > 1 ? frags[1]!.left - frags[0]!.left : 0
        const fold = frags.length > 1 ? frags[0]!.bottom - frags[1]!.top : 0
        const fragmentOf = (rect: DOMRect): number => {
          for (let i = frags.length - 1; i > 0; i -= 1) {
            const frag = frags[i]!
            if (rect.left >= frag.left - 1 && rect.top >= frag.top - 1) return i
          }
          return 0
        }

        const mark: Mark = {
          key: `${thread.id}:${block.id}`,
          block,
          thread,
          strokes: [],
          slip: null,
        }

        let line = 0
        for (const rect of linesOf(part)) {
          if (rect.width <= 0 || rect.height <= 0) continue
          const column = fragmentOf(rect)
          mark.strokes.push({
            key: `${thread.id}:${line}`,
            top: (rect.top - box.top + column * fold) / scale,
            left: (rect.left - box.left - column * pitch) / scale,
            width: rect.width / scale,
            height: rect.height / scale,
          })
          line += 1
        }

        /*
         * ## Where the slip sits, and why it moved
         *
         * It used to ride at the end of the passage's own last line. That put
         * it on top of the words that follow whenever a passage ended
         * mid-line, which is most of the time — reported from the phone.
         *
         * There is nowhere outside the paragraph to put it: the page clips at
         * the paragraph's own width, so the margin is not ours to use.
         *
         * So it goes to the end of the paragraph's **last line**, in the
         * whitespace a paragraph almost always leaves there. If that line runs
         * too close to the edge, it tucks just under the paragraph instead, in
         * the gap before the next one. Both places hold no words.
         *
         * The cost is real and worth naming: two threads in one paragraph no
         * longer wear their slips on their own sentences. They sit side by
         * side at the paragraph's end instead, stacked leftwards. The ink still
         * shows which words each is about, and the hold menu names the passage.
         */
        if (block === last) {
          const home = document.createRange()
          home.selectNodeContents(block)
          const lines = linesOf(home)
          const tail = lines[lines.length - 1]

          // One slip is 30px wide; 34 leaves a hair of daylight between two.
          const already = found.filter((one) => one.block === block && one.slip).length
          const shift = already * 34

          if (tail) {
            const column = fragmentOf(tail)
            const top = (tail.top - box.top + column * fold) / scale
            const right = (tail.right - box.left - column * pitch) / scale
            const room = block.offsetWidth - right - 6 - shift

            mark.slip =
              room >= 30
                ? { top: top + (tail.height / scale - 22) / 2, left: right + 6 + shift }
                : // No room on the line. The gap under the paragraph is the
                  // next place with no words in it.
                  {
                    top: top + tail.height / scale + 2,
                    left: Math.max(0, block.offsetWidth - 32 - shift),
                  }
          } else {
            mark.slip = { top: -11, left: Math.max(0, block.offsetWidth - 44 - shift) }
          }
        }

        if (mark.strokes.length > 0 || mark.slip) found.push(mark)
      }
    }

    // An empty measure while threads still exist is a bad moment mid-turn,
    // not an answer — the same rule, and the same reason, as HandDrawn.
    if (found.length === 0) return
    setMarks((current) => (same(current, found) ? current : found))
  }, [threads, root])

  useEffect(() => {
    if (!root) return

    measure()

    // One coalesced pass per burst, on a timer rather than a frame — a frame
    // callback never fires in a backgrounded tab. Same wiring as HandDrawn.
    let pending = 0
    const soon = () => {
      if (pending) return
      pending = window.setTimeout(() => {
        pending = 0
        measure()
      }, 0)
    }

    const ours = (node: Node): boolean =>
      node instanceof Element
        ? node.closest(`.${styles.layer}`) !== null
        : node.parentElement?.closest(`.${styles.layer}`) !== null

    const changes =
      typeof MutationObserver === 'function'
        ? new MutationObserver((records) => {
            if (records.every((record) => ours(record.target))) return
            soon()
          })
        : null
    changes?.observe(root, { childList: true, subtree: true, characterData: true })

    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(soon) : null
    sizes?.observe(root)

    window.addEventListener('resize', soon, { passive: true })
    root.addEventListener('load', soon, { capture: true })

    return () => {
      if (pending) window.clearTimeout(pending)
      changes?.disconnect()
      sizes?.disconnect()
      window.removeEventListener('resize', soon)
      root.removeEventListener('load', soon, { capture: true })
    }
  }, [measure, root, watch])

  // The paragraph becomes the positioned box the marks hang off, exactly as
  // HandDrawn does it — and `isolation` for the same page-turn reason.
  useEffect(() => {
    const touched = marks.map((mark) => mark.block)
    for (const block of touched) {
      block.style.position = 'relative'
      block.style.isolation = 'isolate'
    }
    return () => {
      for (const block of touched) {
        block.style.position = ''
        block.style.isolation = ''
      }
    }
  }, [marks])

  if (typeof document === 'undefined' || marks.length === 0) return null

  return (
    <>
      {marks.map((mark) =>
        createPortal(
          <span className={styles.layer}>
            {mark.strokes.map((stroke) => (
              <span
                key={stroke.key}
                className={styles.stroke}
                /*
                 * Ink, and nothing else. It used to be the reopen control as
                 * well, and that was a conflict rather than a convenience: the
                 * words under it are the book's own text, and a reader reaching
                 * for them to highlight, copy or look up instead reopened a
                 * conversation. The slip is the control now — one target, one
                 * meaning, and the sentence goes back to being a sentence.
                 */
                aria-hidden="true"
                style={{
                  top: stroke.top,
                  left: stroke.left,
                  width: stroke.width,
                  height: stroke.height,
                }}
              />
            ))}
            {mark.slip && (
              <button
                type="button"
                className={styles.slip}
                style={{ top: mark.slip.top, left: mark.slip.left }}
                aria-label="Reopen the conversation about this passage"
                onClick={() => tap(mark.thread)}
                {...holding(mark.thread)}
              >
                <span className={styles.slipMark} aria-hidden="true">
                  ✦
                </span>
              </button>
            )}
          </span>,
          mark.block,
          mark.key,
        ),
      )}
    </>
  )
}
