/**
 * The card over words picked out of one of Veda's answers, and the handles that
 * stretch them.
 *
 * ## Why the app paints the selection instead of letting the phone do it
 *
 * The same reason the book does, written out at the foot of
 * `Reader.module.css`: a phone raises its own Copy/Share bar the instant *it*
 * holds a selection, no page can ask it not to, and that bar lands directly
 * above the words — exactly where a card of our own has to go. The first build
 * of this let the phone select and put a card above it. The phone's bar covered
 * it completely.
 *
 * So on a touch screen the answer is not selectable at all. `StudyLamp` finds
 * the word under the finger with `wordAtIn`, and these are the boxes it draws.
 * There is never a native selection, so there is never a native bar.
 *
 * ## Why this is not `SelectionMenu`
 *
 * That component does this job for the book, and it carries what the book
 * needs: five highlight colours, sentence and paragraph snapping, chevrons that
 * step a whole unit at a time, and a `Define` that only makes sense on a word
 * in a book. Every one of them is filed against a paragraph's anchor, which an
 * answer has not got. What is shared is the machinery underneath — `wordAtIn`,
 * `spanBetween`, `pivotFor` — and that is shared, in `selection.ts`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  pivotFor,
  type SelectionEdge,
  type SelectionPivot,
  type SpanSelection,
} from './selection.ts'
import styles from './AnswerPick.module.css'

export interface AnswerPickProps {
  selection: SpanSelection
  /** Draw the wash and the handles. Off when the browser owns the selection. */
  painted: boolean
  /**
   * The answer the words were picked out of.
   *
   * The magnifier needs it. It shows the text under the finger enlarged, and
   * the only honest way to do that is to enlarge the real thing.
   */
  source: HTMLElement | null
  onExtend: (pivot: SelectionPivot, x: number, y: number) => void
  onCopy: () => void
  onSave: () => void
  onAsk: () => void
}

/** How far above or below the words the card sits. */
const GAP = 10
/** Kept clear of the edges, so the card never runs off the side. */
const MARGIN = 8

export function AnswerPick({
  selection,
  painted,
  source,
  onExtend,
  onCopy,
  onSave,
  onAsk,
}: AnswerPickProps) {
  const card = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState<{ top: number; left: number; above: boolean } | null>(null)
  /**
   * The drag in progress, held in a ref as well as in state.
   *
   * State is what hides the card; React commits it on its own schedule, and a
   * move arriving in the same task as the `pointerdown` reads the old value and
   * is thrown away. On a fast flick that is the whole first half of the gesture,
   * which feels exactly like a handle that will not move. `SelectionMenu` found
   * this out first.
   */
  const drag = useRef<{ pointerId: number; pivot: SelectionPivot } | null>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  /*
   * Measured, not guessed. The card's width depends on the words in it and on
   * the reader's type size, and a card centred on a guessed width points at the
   * wrong place. Layout effect, so it is placed before the browser paints and
   * the reader never sees it jump.
   */
  useLayoutEffect(() => {
    const element = card.current
    if (!element) return

    const box = element.getBoundingClientRect()
    const middle = (selection.rect.left + selection.rect.right) / 2
    const room = selection.rect.top - GAP
    // Above by preference — below the words is where the reader's hand is. It
    // flips only when there is not the room, which is a selection near the top.
    const above = room >= box.height + MARGIN

    setPlace({
      above,
      top: above ? selection.rect.top - GAP : selection.rect.bottom + GAP,
      left: Math.min(
        Math.max(middle, MARGIN + box.width / 2),
        window.innerWidth - MARGIN - box.width / 2,
      ),
    })
  }, [selection])

  /*
   * ## Why the moves are coalesced to a frame
   *
   * A finger reports moves faster than the screen redraws — 120 a second on a
   * good phone against 60 frames. Every one of them used to re-read the answer
   * from the DOM and rebuild the range, and the work between two frames was
   * thrown away unseen. The drag felt as though it were catching.
   *
   * So the point is remembered and one frame's worth of work is done per frame.
   * The last point before the frame is the one that counts, which is exactly
   * what the reader is looking at.
   */
  const pending = useRef<{ pivot: SelectionPivot; x: number; y: number } | null>(null)
  const frame = useRef(0)

  const flush = useCallback(() => {
    frame.current = 0
    const next = pending.current
    pending.current = null
    if (next) onExtend(next.pivot, next.x, next.y)
  }, [onExtend])

  const schedule = useCallback(
    (pivot: SelectionPivot, x: number, y: number) => {
      pending.current = { pivot, x, y }
      setAt({ x, y })
      if (frame.current === 0) frame.current = requestAnimationFrame(flush)
    },
    [flush],
  )

  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const startDrag = useCallback(
    (edge: SelectionEdge) => (event: React.PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      drag.current = { pointerId: event.pointerId, pivot: pivotFor(selection, edge) }
      setAt({ x: event.clientX, y: event.clientY })
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    },
    [selection],
  )

  const moveDrag = useCallback(
    (event: React.PointerEvent) => {
      const held = drag.current
      if (!held || held.pointerId !== event.pointerId) return
      event.preventDefault()
      schedule(held.pivot, event.clientX, event.clientY)
    },
    [schedule],
  )

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setAt(null)
  }, [])

  const handle = (edge: SelectionEdge) => {
    const rect = edge === 'start' ? selection.rects[0] : selection.rects[selection.rects.length - 1]
    if (!rect) return null
    const x = edge === 'start' ? rect.left : rect.left + rect.width

    return (
      <span
        key={edge}
        data-pick=""
        className={`${styles.handle} ${edge === 'start' ? styles.handleStart : styles.handleEnd}`}
        aria-hidden="true"
        style={{ top: `${rect.top}px`, left: `${x}px`, height: `${rect.height}px` }}
        onPointerDown={startDrag(edge)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className={styles.knob} />
      </span>
    )
  }

  return createPortal(
    <>
      {painted &&
        selection.rects.map((rect, index) => (
          <span
            key={index}
            data-pick=""
            className={styles.mark}
            aria-hidden="true"
            style={{
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
            }}
          />
        ))}

      {painted && handle('start')}
      {painted && handle('end')}

      {at && <Magnifier source={source} rects={selection.rects} at={at} />}

      {/*
        Hidden while a handle is moving, and not unmounted: the reader is
        watching the words, the card would be under their finger, and a card
        that unmounts loses the measurement it was placed by.

        `onPointerDown` with `preventDefault`: on a desktop, where the browser
        still owns the selection, a tap anywhere clears it before the click
        lands — and the button would fire with nothing selected.
      */}
      <div
        ref={card}
        data-pick=""
        className={`${styles.card} ${place?.above ? styles.above : styles.below} ${
          at ? styles.hidden : ''
        }`}
        style={{ top: place ? `${place.top}px` : 0, left: place ? `${place.left}px` : 0 }}
        role="group"
        aria-label="What to do with these words"
        onPointerDown={(event) => event.preventDefault()}
      >
        <button type="button" className={styles.action} onClick={onCopy}>
          Copy
        </button>
        <span className={styles.rule} aria-hidden="true" />
        <button type="button" className={styles.action} onClick={onSave}>
          Save
        </button>
        <span className={styles.rule} aria-hidden="true" />
        <button type="button" className={styles.action} onClick={onAsk}>
          Ask
        </button>
      </div>
    </>,
    document.body,
  )
}

/** How much bigger the words are inside the glass. */
const ZOOM = 1.9
const GLASS = { width: 168, height: 54 }
/** How far above the finger the glass floats, clear of the fingertip. */
const LIFT = 64

/**
 * The glass over the finger while a handle is dragged.
 *
 * ## What it is for
 *
 * A fingertip is about nine millimetres across and the text under it is about
 * two. While the reader drags a boundary, the one thing they need to see is the
 * one thing their own hand is covering. Chrome does this on the page and readers
 * expect it.
 *
 * ## How it is done, and what that costs
 *
 * Chrome's magnifier is drawn by the compositor from the real pixels. No web
 * page can reach those. So this enlarges the next best thing: a copy of the
 * answer's own markup, scaled, shifted so the finger's point sits in the middle
 * of the glass, and clipped to it.
 *
 * `cloneNode` and not any kind of string: nothing here ever builds HTML from
 * text, for the reason set out at the top of `markdown.tsx`, and a live clone
 * inherits the real styles anyway.
 *
 * The copy is a still. It does not re-clone as the selection grows, because the
 * wash is not part of the answer — it is drawn over it, and it is drawn again
 * here from the same rectangles. So what the reader sees inside the glass is
 * the real text with the real selection on it.
 */
function Magnifier({
  source,
  rects,
  at,
}: {
  source: HTMLElement | null
  rects: SpanSelection['rects']
  at: { x: number; y: number }
}) {
  const hold = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<DOMRect | null>(null)

  useLayoutEffect(() => {
    const slot = hold.current
    if (!slot || !source) return

    const copy = source.cloneNode(true) as HTMLElement
    // The clone is scenery. It must not answer to a finger, be found by a
    // search, or be read out — the real answer is still on the page behind it.
    copy.removeAttribute('id')
    copy.setAttribute('aria-hidden', 'true')
    copy.style.pointerEvents = 'none'
    copy.style.margin = '0'

    slot.replaceChildren(copy)
    setBox(source.getBoundingClientRect())

    return () => slot.replaceChildren()
  }, [source])

  if (!source) return null

  /*
   * Where the glass sits.
   *
   * Above the finger, and it stays above: a glass that flipped under the hand
   * would be covered by the hand, which is the whole thing it exists to stop.
   * Near the top of the screen it presses against the edge instead of flipping.
   */
  const top = Math.max(MARGIN, at.y - LIFT - GLASS.height)
  const left = Math.min(
    Math.max(at.x - GLASS.width / 2, MARGIN),
    window.innerWidth - MARGIN - GLASS.width,
  )

  /*
   * The shift that puts the finger's point in the middle of the glass.
   *
   * `translate(t) scale(Z)` with the origin at the top left means a point `p`
   * in the answer's own coordinates lands at `p * Z + t`. Setting that equal to
   * the middle of the glass and solving for `t` is the line below.
   */
  const shift = box
    ? {
        x: GLASS.width / 2 - (at.x - box.left) * ZOOM,
        y: GLASS.height / 2 - (at.y - box.top) * ZOOM,
      }
    : { x: 0, y: 0 }

  return (
    <div
      data-pick=""
      className={styles.glass}
      aria-hidden="true"
      style={{ top: `${top}px`, left: `${left}px`, width: `${GLASS.width}px`, height: `${GLASS.height}px` }}
    >
      <div
        className={styles.lens}
        style={{
          width: box ? `${box.width}px` : undefined,
          transform: `translate(${shift.x}px, ${shift.y}px) scale(${ZOOM})`,
        }}
      >
        <div ref={hold} />
        {/* The wash again, in the answer's own coordinates. Without it the
            glass would show plain text and the reader could not see where the
            boundary they are dragging has got to. */}
        {box &&
          rects.map((rect, index) => (
            <span
              key={index}
              className={styles.glassMark}
              style={{
                top: `${rect.top - box.top}px`,
                left: `${rect.left - box.left}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
              }}
            />
          ))}
      </div>
      {/* The point itself. A glass with nothing marked in it tells the reader
          the words but not which side of which letter they are on. */}
      <span className={styles.crosshair} />
    </div>
  )
}
