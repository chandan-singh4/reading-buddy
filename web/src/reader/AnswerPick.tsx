/**
 * The card over words picked out of one of Veda's answers.
 *
 * ## Why the app paints the selection instead of letting the phone do it
 *
 * The same reason the book does, written out at `Reader.module.css`: a phone
 * raises its own Copy/Share bar the instant *it* holds a selection, no page can
 * ask it not to, and that bar lands directly above the words — exactly where a
 * card of our own has to go. The first build of this let the phone select and
 * put a card above it. The phone's bar covered it completely.
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

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { pivotFor, type SelectionEdge, type SelectionPivot, type SpanSelection } from './selection.ts'
import styles from './AnswerPick.module.css'

export interface AnswerPickProps {
  selection: SpanSelection
  /** Draw the wash and the handles. Off when the browser owns the selection. */
  painted: boolean
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
  const [dragging, setDragging] = useState(false)

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

  const startDrag = useCallback(
    (edge: SelectionEdge) => (event: React.PointerEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const pivot = pivotFor(selection, edge)
      drag.current = { pointerId: event.pointerId, pivot }
      setDragging(true)
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    },
    [selection],
  )

  const moveDrag = useCallback(
    (event: React.PointerEvent) => {
      const held = drag.current
      if (!held || held.pointerId !== event.pointerId) return
      event.preventDefault()
      onExtend(held.pivot, event.clientX, event.clientY)
    },
    [onExtend],
  )

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
  }, [])

  const handle = (edge: SelectionEdge) => {
    const rect = edge === 'start' ? selection.rects[0] : selection.rects[selection.rects.length - 1]
    if (!rect) return null
    const x = edge === 'start' ? rect.left : rect.left + rect.width

    return (
      <span
        key={edge}
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
        className={`${styles.card} ${place?.above ? styles.above : styles.below} ${
          dragging ? styles.hidden : ''
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
