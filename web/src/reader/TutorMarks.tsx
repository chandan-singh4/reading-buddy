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
  /**
   * Where the slip sits and how big it is, in the paragraph's own coordinates.
   * `null` on the continuation paragraphs of a passage — only its last one
   * wears it. The size varies: a slip tucked into the gap between two lines is
   * drawn to fit that gap.
   */
  slip: { top: number; left: number; width: number; height: number } | null
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
      one.slip?.height !== other.slip?.height ||
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

/** The slip's drawn size, in the paragraph's own pixels. */
const SLIP_W = 30
const SLIP_H = 22

/**
 * How small a slip may be drawn when it tucks into the gap between two lines.
 *
 * The gap is the leading, and it is smaller than it looks: at the reader's own
 * 18px on 30.6px, two lines of ink are about 9px apart. A slip that fits there
 * is a tab rather than a sticker — no star on it, just a scrap of bronze-edged
 * paper. That is the whole trade: the mark shrinks, and in exchange it sits on
 * its own sentence and covers no word.
 *
 * Its *target* does not shrink with it. `.slip::before` holds that at a
 * finger's width whatever the paper is doing.
 *
 * Below this there is no gap worth using and the slip goes under the paragraph
 * instead.
 */
const MIN_SLIP_H = 7

/** A slip smaller than this has no room for the star, and wears none. */
const MARK_MIN_H = 16

/** Narrower than this, a tab stops reading as paper and starts reading as dirt. */
const MIN_SLIP_W = 14

/**
 * How a re-entered page is waited for: six looks, 80ms apart.
 *
 * Long enough — about half a second — to cover a section being parsed and laid
 * out again, and short enough that the reader does not watch it happen. The
 * ladder stops on the first measure that finds anything.
 */
const RETRIES = 6
const RETRY_MS = 80

export function TutorMarks({ threads, root, watch, onOpen, onHold }: TutorMarksProps) {
  const [marks, setMarks] = useState<Mark[]>([])

  /*
   * The marks as they stand, readable from inside `measure` without listing
   * them as a dependency — which would rebuild the measurer every time it
   * measured.
   */
  const held = useRef<Mark[]>([])
  held.current = marks

  /** The re-measure ladder: see the empty-measure branch below. */
  const tries = useRef(0)
  const later = useRef<number | undefined>(undefined)
  const again = useRef<() => void>(() => {})

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
         * ## Where the slip sits
         *
         * Back on its own sentence, which is where it belongs: two threads in
         * one paragraph have to wear two visibly separate slips or the second
         * one is unreachable, and a reader looking at a mark wants to know
         * *which* words it is about without reading the ink.
         *
         * It went to the paragraph's foot for one round, because the passage
         * usually ends mid-line and a slip there sat on top of the words that
         * follow. There is nowhere outside the paragraph to escape to: the page
         * clips at the paragraph's own width, so the margin is not ours.
         *
         * Three places, in order of preference, and none of them holds a word:
         *
         *   1. The trailing whitespace of the passage's own last line, when the
         *      passage ends near the line's end and there is room for a slip.
         *   2. The gap between that line and the next — the leading, which is
         *      empty by construction. The slip is drawn down to fit it, and its
         *      tap target stays full size (see `.slip::before`).
         *   3. Under the paragraph, when the passage ends on its last line.
         *
         * A second slip landing on the same row steps to the left of the first.
         */
        if (block === last) {
          const ink = mark.strokes[mark.strokes.length - 1]

          if (ink) {
            const home = document.createRange()
            home.selectNodeContents(block)
            // Every line of the paragraph, in the block's own coordinates — the
            // same fold arithmetic as the ink.
            const rows = linesOf(home)
              .map((rect) => {
                const column = fragmentOf(rect)
                return {
                  top: (rect.top - box.top + column * fold) / scale,
                  right: (rect.right - box.left - column * pitch) / scale,
                }
              })
              .sort((a, b) => a.top - b.top)

            const foot = ink.top + ink.height
            const under = rows.find((row) => row.top > ink.top + ink.height / 2)?.top
            /*
             * The room on this line is measured from the end of *the line's own
             * words*, not from the end of the passage.
             *
             * Measuring from the passage was the first attempt and it was
             * wrong in the ordinary case: a sentence usually ends in the middle
             * of a line, so there is plenty of space between it and the
             * paragraph's right edge — and every pixel of that space is the
             * next sentence. The slip landed on top of it.
             */
            const line = rows.reduce(
              (best, row) =>
                Math.abs(row.top - ink.top) < Math.abs(best.top - ink.top) ? row : best,
              rows[0] ?? { top: ink.top, right: ink.left + ink.width },
            )

            let place: { top: number; left: number; width: number; height: number }
            if (block.offsetWidth - line.right - 6 >= SLIP_W) {
              place = {
                top: ink.top + (ink.height - SLIP_H) / 2,
                left: line.right + 6,
                width: SLIP_W,
                height: SLIP_H,
              }
            } else if (under === undefined) {
              place = {
                top: foot + 2,
                left: Math.max(0, block.offsetWidth - SLIP_W - 2),
                width: SLIP_W,
                height: SLIP_H,
              }
            } else if (under - foot - 1 >= MIN_SLIP_H) {
              const gap = under - foot
              const height = Math.min(SLIP_H, gap - 1)
              const width = Math.max(MIN_SLIP_W, Math.round((height * SLIP_W) / SLIP_H))
              place = {
                top: foot + Math.max(0, (gap - height) / 2),
                left: Math.max(
                  0,
                  Math.min(ink.left + ink.width - width, block.offsetWidth - width),
                ),
                width,
                height,
              }
            } else {
              // A line-height too tight to tuck anything into. The foot of the
              // paragraph is the only empty place left.
              place = {
                top: foot + 2,
                left: Math.max(0, block.offsetWidth - SLIP_W - 2),
                width: SLIP_W,
                height: SLIP_H,
              }
            }

            // Two threads whose slips landed on the same row: the later one
            // steps left, so both stay visible and both stay tappable.
            const crowd = found.filter(
              (one) =>
                one.block === block &&
                one.slip &&
                Math.abs(one.slip.top - place.top) < place.height,
            ).length
            place.left = Math.max(0, place.left - crowd * (place.width + 4))
            mark.slip = place
          } else {
            mark.slip = {
              top: -11,
              left: Math.max(0, block.offsetWidth - 44),
              width: SLIP_W,
              height: SLIP_H,
            }
          }
        }

        if (mark.strokes.length > 0 || mark.slip) found.push(mark)
      }
    }

    /*
     * An empty measure has two very different causes.
     *
     * **A bad moment mid-turn.** The page is between paragraphs and the quotes
     * are briefly unfindable. Holding the marks is right, and it is the same
     * rule, for the same reason, as HandDrawn.
     *
     * **A page the reader came back to.** They left this page and returned, so
     * the Reader threw the paragraphs away and built new ones. The marks still
     * held point at nodes that are no longer in the document — so they portal
     * into nothing and the reader sees no slip at all. That is the reported
     * bug, and the flicker is the mark being drawn once before its paragraph
     * is replaced under it. Nothing measures again, because from the page's
     * point of view nothing has changed since.
     *
     * So: hold them while their paragraphs are still in the document. When the
     * paragraphs are gone, drop the marks and look again in a moment — the new
     * paragraphs may not be laid out yet.
     */
    if (found.length === 0) {
      const stranded = held.current.some((mark) => !mark.block.isConnected)
      if (!stranded) return
      setMarks((current) => (current.length === 0 ? current : []))
      if (tries.current < RETRIES) {
        tries.current += 1
        if (later.current !== undefined) window.clearTimeout(later.current)
        later.current = window.setTimeout(() => {
          later.current = undefined
          again.current()
        }, RETRY_MS)
      }
      return
    }

    tries.current = 0
    setMarks((current) => (same(current, found) ? current : found))
  }, [threads, root])

  again.current = measure

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
      if (later.current !== undefined) window.clearTimeout(later.current)
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
                style={{
                  top: mark.slip.top,
                  left: mark.slip.left,
                  width: mark.slip.width,
                  height: mark.slip.height,
                }}
                aria-label="Reopen the conversation about this passage"
                onClick={() => tap(mark.thread)}
                {...holding(mark.thread)}
              >
                {/* A tab in the gap between two lines is a few pixels tall.
                    The star does not fit, and half a star is worse than none. */}
                {mark.slip.height >= MARK_MIN_H && (
                  <span className={styles.slipMark} aria-hidden="true">
                    ✦
                  </span>
                )}
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
