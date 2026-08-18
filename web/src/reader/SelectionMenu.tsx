/**
 * The menu that appears over a selection.
 *
 * Two things are being followed at once here, and they come from different
 * places. The *actions* are the prototype's — highlight, note, copy, save,
 * share, then define, translate, search, read aloud, then a block of the tutor's
 * own. The *look* is the platform's: a rounded card, a row of icon buttons
 * across the top, hairline-separated rows below it, monochrome line icons. A
 * reader who has used a phone already knows how to read this shape, and that is
 * worth more than a menu that matches the book.
 *
 * It is a real menu: `role="menu"`, arrow keys move between items, Escape
 * closes, and every item is reachable and visibly focused.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'

import { HIGHLIGHT_COLOURS } from './highlightStyle.ts'
import {
  pivotFor,
  type ReaderSelection,
  type SelectionEdge,
  type SelectionGrain,
  type SelectionPivot,
} from './selection.ts'
import styles from './SelectionMenu.module.css'

/** What the reader asked for. The Reader decides what any of it means. */
export type SelectionAction =
  | { kind: 'highlight'; colour: string }
  | { kind: 'unhighlight' }
  | { kind: 'select'; grain: SelectionGrain }
  | { kind: 'note' }
  | { kind: 'copy' }
  | { kind: 'save' }
  | { kind: 'share' }
  | { kind: 'define' }
  | { kind: 'translate' }
  | { kind: 'search' }
  | { kind: 'speak' }
  | { kind: 'ask'; ask: 'explain' | 'simply' | 'quiz' | 'discuss' }

export interface SelectionMenuProps {
  selection: ReaderSelection
  onAction: (action: SelectionAction) => void
  onDismiss: () => void
  /**
   * One end of the selection dragged to a point on screen.
   *
   * The pivot is the end that is *not* moving. Passing it rather than the edge
   * being dragged is what lets a handle cross the other one: once the finger is
   * on the far side, the pivot is still the pivot, and the two boundaries are
   * simply put back in order.
   */
  onExtend: (pivot: SelectionPivot, x: number, y: number) => void
  /**
   * The highlight already on these words, if there is one.
   *
   * It is what makes a swatch a toggle. Tapping the colour a passage already
   * wears takes the highlight off; tapping a different one recolours it; tapping
   * any of them on plain text adds one. Without this the same sentence could be
   * highlighted again and again, once per tap.
   */
  highlighted?: { id: string; colour: string } | null
  /**
   * The unit the selection is currently snapped to, if it is snapped to one.
   *
   * Set by tapping Sentence or Paragraph, and it changes what the two handles
   * are. Off, they are drag handles. On, they are chevrons that step the
   * selection out one whole unit at a time — and still drag, for the fine
   * adjustment a chevron cannot make.
   */
  unit?: SelectionGrain | null
  /** Grow the selection by one unit at this end. */
  onGrow?: (side: SelectionEdge) => void
  /**
   * Whether there is another unit to take at each end.
   *
   * The Reader works this out, because only it can see the page. A chevron with
   * nowhere to go is not shown at all: a button that does nothing teaches the
   * reader to doubt the menu.
   */
  canGrow?: { start: boolean; end: boolean }
}

/** How far the card stays from the edge of the screen, and from the selection. */
const MARGIN = 8
const GAP = 10

/**
 * How far a finger may wander and still count as a tap on a chevron.
 *
 * A finger never lands still. Nothing under this is a drag, so a reader who
 * meant "one more sentence" gets one more sentence rather than a selection
 * dragged three characters sideways.
 */
const SLOP = 6

/** The chevron's own size, in pixels. Kept the same as `.chevron` in the CSS. */
const CHEVRON = 24

/**
 * The least room the card is ever given, in pixels.
 *
 * Below this the card is not a menu any more, it is a scroll bar. A selection
 * this tight against an edge is better served by a short card that overhangs by
 * a few pixels than by one nothing can be read in.
 */
const MIN_CARD = 200

/** The page, which owns the turn gesture. See the dismissal rule below. */
const FRAME = '[data-page-frame]'

function Icon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const ICONS = {
  highlight: 'M4 20h5m-2-4 9-9a2 2 0 0 1 3 3l-9 9-4 1z',
  note: 'M4 5h16v11l-4 4H4zm12 15v-4h4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  save: 'M7 4h10v16l-5-4-5 4z',
  share: 'M12 16V4m0 0L8 8m4-4 4 4M5 14v6h14v-6',
  define: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zm3 4h6m-6 4h6',
  translate: 'M3 6h9M7.5 6v-2M9 6c0 4-3 8-6 8m2-4c2 3 4 4 6 4m1 6 4-10 4 10m-6.5-3h5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 4 4',
  speak: 'M4 10v4h3l4 4V6l-4 4zm11-1a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12',
  sentence: 'M4 7h16M4 12h11m-11 5h7',
  paragraph: 'M6 4h13M6 4v16M11 4v16M19 4v8a4 4 0 0 1-4 4h-4',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
}

export function SelectionMenu({
  selection,
  onAction,
  onDismiss,
  onExtend,
  highlighted = null,
  unit = null,
  onGrow,
  canGrow = { start: true, end: true },
}: SelectionMenuProps) {
  const card = useRef<HTMLDivElement | null>(null)
  /**
   * The drag in progress, if there is one.
   *
   * Held in a ref as well as in state. State is what hides the card, and React
   * commits it on its own schedule — a move that arrives in the same task as the
   * `pointerdown` reads the *old* value and gets thrown away. On a fast flick
   * that is the whole first half of the gesture, which felt exactly like a
   * handle that would not move.
   */
  const drag = useRef<{
    pointerId: number
    pivot: SelectionPivot
    lift: number
    /** Where the finger went down, so a tap can be told from a drag. */
    from: { x: number; y: number }
    moved: boolean
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [place, setPlace] = useState<{
    top: number
    left: number
    above: boolean
    limit: number
  } | null>(null)
  const [asking, setAsking] = useState(true)
  const askId = useId()

  /*
   * Placed after measuring, because where it goes depends on how tall it is:
   * below the selection normally, above it when there is no room below, and
   * always inside the screen. Fixed positioning, so these are the same viewport
   * coordinates the selection reported.
   */
  useLayoutEffect(() => {
    const node = card.current
    if (!node) return

    const box = node.getBoundingClientRect()
    const width = window.innerWidth
    const height = window.innerHeight

    /*
     * The card clears the chevrons, rather than sitting on them.
     *
     * A chevron is a 1.5rem disc centred on the corner of the selection, so half
     * of it hangs below the last line and half above the first. `GAP` alone is
     * smaller than that half, and the card landed on the very button the reader
     * was reaching for — the end chevron when the card goes below, the start one
     * when it goes above.
     *
     * Only in unit mode. The plain drag knobs are the reader's own finger's
     * business and sit tight against the text, and holding the card away from
     * them would push a menu off a short selection for nothing.
     */
    const clear = unit === null ? GAP : GAP + CHEVRON / 2 + 2
    /*
     * The two chevrons do not hang by the same amount, so they are cleared by
     * different amounts.
     *
     * Both are drawn from the corner of the selection, but `.handleEnd` carries
     * `translateY(50%)` and `.handleStart` carries `translateY(-50%)`. The end
     * one is therefore pushed a whole disc below the last line, while the start
     * one straddles the first line and stands only half a disc above it.
     */
    const under = unit === null ? GAP : GAP + CHEVRON + 2

    /*
     * The card never sits on the selection. It takes the side with the room.
     *
     * The old rule clamped a card that fit neither side to the foot of the
     * window, which laid it straight over the words and over the chevrons — the
     * end chevron landed on the Paragraph button, so the tap that should have
     * grown the selection by a sentence took the whole paragraph instead.
     *
     * So: measure the room on each side, take the side that holds the card, and
     * if neither does, take the roomier side and cap the card to it. A capped
     * card scrolls inside itself. A short menu is never capped, and a reader who
     * selects near the middle of a full screen scrolls a menu instead of losing
     * the control they were aiming at.
     */
    const roomBelow = height - MARGIN - (selection.rect.bottom + under)
    const roomAbove = selection.rect.top - clear - MARGIN
    // `scrollHeight`, not the rect: once a cap is on, the rect reports the
    // capped height, and measuring that would let the cap shrink itself on every
    // pass. `scrollHeight` is the height the card wants, capped or not.
    const wants = node.scrollHeight
    const goesAbove = wants > roomBelow && roomAbove > roomBelow
    // Never taller than the window itself, whatever `MIN_CARD` asks for.
    const room = Math.min(
      Math.max(goesAbove ? roomAbove : roomBelow, MIN_CARD),
      height - MARGIN * 2,
    )
    const tall = Math.min(wants, room)

    const middle = (selection.rect.left + selection.rect.right) / 2
    const left = Math.min(Math.max(middle - box.width / 2, MARGIN), width - box.width - MARGIN)

    setPlace({
      /*
       * On the screen, always. Whatever the room beside the selection says, a
       * card that hangs off the bottom is a card with no rows in it — which is
       * what a selection running to the foot of the page gave: the swatches
       * showed and everything under them, "Ask Claude" included, was past the
       * edge. `MIN_CARD` can ask for more room than a side really has, so the
       * top is pulled back inside the window as the last step.
       */
      top: Math.min(
        Math.max(goesAbove ? selection.rect.top - clear - tall : selection.rect.bottom + under, MARGIN),
        Math.max(height - tall - MARGIN, MARGIN),
      ),
      left: Math.max(left, MARGIN),
      above: goesAbove,
      limit: room,
    })
  }, [selection, asking, unit])

  // Focus goes to the card itself, not to the first item: the reader is holding
  // a finger on the page, and moving focus onto "Highlight" would announce a
  // button they did not ask for. Arrow keys pick up from here.
  useEffect(() => {
    card.current?.focus({ preventScroll: true })
  }, [])

  /*
   * What counts as tapping the selection away.
   *
   * Everywhere except the page, the answer is still `pointerdown`: a tap outside
   * clears the selection first, and by click time there is nothing left to act
   * on.
   *
   * The page itself has to wait for the finger to come up, because on the page a
   * press is the start of two different gestures. A tap means "put this away". A
   * drag means "turn the page" — and a selection that can cover two pages must
   * survive that, or the reader can never reach the chevron sitting on the other
   * one. Both begin with the same `pointerdown`, so the difference is distance,
   * measured when the finger lifts.
   *
   * A press that the system takes away (a call, an edge gesture) keeps the
   * selection. It was never a tap.
   */
  useEffect(() => {
    let held: { x: number; y: number } | null = null

    const onDown = (event: PointerEvent) => {
      held = null
      if (card.current?.contains(event.target as Node)) return
      // A handle is not the card, but grabbing one is not a tap outside either.
      if ((event.target as HTMLElement | null)?.closest?.(`.${styles.handle}`)) return

      if ((event.target as HTMLElement | null)?.closest?.(FRAME)) {
        held = { x: event.clientX, y: event.clientY }
        return
      }
      onDismiss()
    }

    const onUp = (event: PointerEvent) => {
      const from = held
      held = null
      if (!from) return
      const far =
        Math.abs(event.clientX - from.x) > SLOP || Math.abs(event.clientY - from.y) > SLOP
      if (!far) onDismiss()
    }

    const onCancel = () => {
      held = null
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
    }
  }, [onDismiss])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onDismiss()
      return
    }

    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(event.key)) return

    const items = [...(card.current?.querySelectorAll<HTMLElement>('[data-item]') ?? [])]
    if (items.length === 0) return
    event.preventDefault()

    const at = items.indexOf(document.activeElement as HTMLElement)
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : at < 0
            ? forward
              ? 0
              : items.length - 1
            : (at + (forward ? 1 : -1) + items.length) % items.length

    items[next]?.focus()
  }

  function act(action: SelectionAction) {
    onAction(action)
  }

  /*
   * The two grab points, one on each end of the selection.
   *
   * The phone's own handles left with the phone's own menu, so these replace
   * them. The pointer is captured on the way down, which means every move goes
   * to this element even after the finger has left it — a handle you can only
   * drag while staying on top of a 12px dot is a handle nobody can use.
   *
   * A move is answered on the strength of the captured pointer alone, never on
   * which handle the event started from. The two ends can cross, and when they
   * do the finger is holding the handle drawn at the *other* end of the
   * selection; asking "is this the end handle?" would stop the drag dead at the
   * moment it crossed.
   *
   * In unit mode the same handle grows a chevron and becomes a real button. It
   * keeps every pointer handler, because a chevron that could no longer be
   * dragged would take away the fine adjustment it exists to sit beside. A tap
   * and a drag are told apart by distance, not by time: anything under `SLOP`
   * pixels was a tap, and a tap steps one unit.
   */
  function handleFor(edge: SelectionEdge) {
    const rects = selection.rects
    const rect = edge === 'start' ? rects[0] : rects[rects.length - 1]
    if (!rect) return null

    // Hidden at the first or last unit of the book — there is no more page to
    // take, and a chevron pointing at nothing is worse than no chevron.
    const stepping = unit !== null && (edge === 'start' ? canGrow.start : canGrow.end)
    if (unit !== null && !stepping) return null

    const x = edge === 'start' ? rect.left : rect.left + rect.width

    function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
      event.preventDefault()
      event.stopPropagation()
      // Recorded before the capture is asked for, not after. Capture can throw
      // — the pointer can be gone by the time this runs — and a drag that dies
      // in its first line is a handle that does not move at all. Capture only
      // makes the drag easier; it is not what makes it work.
      //
      // The lift reads a little above the finger: the text being aimed at is
      // the text the fingertip covers, not the pixel under its centre.
      drag.current = {
        pointerId: event.pointerId,
        pivot: pivotFor(selection, edge),
        lift: rect.height / 2,
        from: { x: event.clientX, y: event.clientY },
        moved: false,
      }
      // In unit mode the card only hides once the finger has actually moved: a
      // tap on a chevron should not make the menu blink.
      if (!stepping) setDragging(true)
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Without capture the moves stop when the finger leaves the handle.
        // Worse, not broken.
      }
    }

    function onPointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
      const held = drag.current
      if (!held || held.pointerId !== event.pointerId) return
      event.preventDefault()

      if (!held.moved) {
        const far =
          Math.abs(event.clientX - held.from.x) > SLOP ||
          Math.abs(event.clientY - held.from.y) > SLOP
        if (!far) return
        held.moved = true
        setDragging(true)
      }

      onExtend(held.pivot, event.clientX, event.clientY - held.lift)
    }

    function onPointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
      const held = drag.current
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      } catch {
        // Never captured, or already released. Either way the drag is over.
      }
      drag.current = null
      setDragging(false)

      // A tap on a chevron, not a drag of one.
      if (stepping && held && !held.moved && event.type === 'pointerup') onGrow?.(edge)
    }

    const label =
      edge === 'start'
        ? `Extend to previous ${unit ?? ''}`.trim()
        : `Extend to next ${unit ?? ''}`.trim()

    /*
     * One element either way, and a `role` rather than a `<button>`.
     *
     * A drag handle is not something a keyboard can use and not something a
     * screen reader should announce — it is a grip on a selection the reader can
     * already move other ways, so plain it stays. A chevron is a command, so it
     * takes a name, a tab stop and Enter. It is the same element because it is
     * the same thing: swapping the tag would end any drag in flight the moment
     * the reader crossed into the last unit and the chevron went away.
     */
    return (
      <span
        key={edge}
        className={`${styles.handle} ${edge === 'start' ? styles.handleStart : styles.handleEnd} ${
          stepping ? styles.chevron : ''
        }`}
        aria-hidden={stepping ? undefined : true}
        role={stepping ? 'button' : undefined}
        tabIndex={stepping ? 0 : undefined}
        aria-label={stepping ? label : undefined}
        style={
          stepping
            ? // Centred on the corner of the selection, not stretched down the
              // line: a chevron is a button, and its height is its own.
              { top: `${edge === 'start' ? rect.top : rect.top + rect.height}px`, left: `${x}px` }
            : { top: `${rect.top}px`, left: `${x}px`, height: `${rect.height}px` }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={
          stepping
            ? (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                onGrow?.(edge)
              }
            : undefined
        }
      >
        {stepping ? (
          <Icon path={edge === 'start' ? ICONS.back : ICONS.chevron} />
        ) : (
          <span className={styles.knob} />
        )}
      </span>
    )
  }

  /*
   * Both the marks and the card go through a portal onto `<body>`.
   *
   * `position: fixed` is measured against the nearest transformed ancestor, not
   * against the screen, and the reading page is inside one: the stage carries
   * `--page-scale`, and a page in flight carries the turn. So a card placed at
   * the selection's viewport coordinates landed scaled and offset — on the phone
   * it was off the screen entirely, while still catching taps meant for the
   * page. Out here there is nothing between this and the viewport.
   */
  return createPortal(
    <>
      {/* The selection, drawn by us. The real one was taken away the moment it
          was read — that is what dismisses the phone's own text menu — so
          without this the reader cannot see what they picked. */}
      {selection.rects.map((rect, index) => (
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

      {handleFor('start')}
      {handleFor('end')}

      <div
        ref={card}
      className={`${styles.card} ${place?.above ? styles.above : styles.below}`}
      style={{
        top: place ? `${place.top}px` : 0,
        left: place ? `${place.left}px` : 0,
        // The room the placement found on the chosen side. The card scrolls
        // rather than growing past it and onto the words.
        maxHeight: place ? `${place.limit}px` : undefined,
        // Hidden until measured, so it is never seen in the wrong place. Hidden
        // again during a drag: the card would sit over the words being chosen.
        visibility: place && !dragging ? 'visible' : 'hidden',
      }}
      role="menu"
      aria-label="Selected text"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {/*
        The colours, and nothing else.

        No label and no eraser. A row of four coloured circles under a piece of
        selected text needs no word to explain it, and the eraser was a fifth
        thing to aim at that only ever did what tapping the current colour now
        does. Each swatch is a toggle: tap it to mark, tap the same one again to
        take the mark off, tap another to change it.
      */}
      <div className={styles.colours} role="group" aria-label="Highlight">
        {HIGHLIGHT_COLOURS.map((colour) => {
          const current = highlighted?.colour === colour.value
          return (
            <button
              key={colour.id}
              type="button"
              data-item
              role="menuitem"
              className={styles.swatch}
              style={{ background: colour.value }}
              aria-label={
                current ? `Remove ${colour.label.toLowerCase()} highlight` : `Highlight ${colour.label.toLowerCase()}`
              }
              aria-pressed={current}
              data-current={current || undefined}
              onClick={() =>
                act(current ? { kind: 'unhighlight' } : { kind: 'highlight', colour: colour.value })
              }
            />
          )
        })}
      </div>

      {/* The quick row: the four things a reader does most, as icons. The last
          two widen the selection rather than act on it, which is why they sit
          beside Note and Copy rather than in a list of their own — the reader
          reaches for "this whole sentence" as often as for "copy this". */}
      <div className={styles.quick}>
        <button
          type="button"
          data-item
          role="menuitem"
          className={styles.quickButton}
          onClick={() => act({ kind: 'note' })}
        >
          <Icon path={ICONS.note} />
          <span>Note</span>
        </button>
        <button
          type="button"
          data-item
          role="menuitem"
          className={styles.quickButton}
          onClick={() => act({ kind: 'copy' })}
        >
          <Icon path={ICONS.copy} />
          <span>Copy</span>
        </button>
        {(
          [
            ['sentence', 'Sentence', ICONS.sentence],
            ['paragraph', 'Paragraph', ICONS.paragraph],
          ] as const
        ).map(([grain, label, path]) => (
          <button
            key={grain}
            type="button"
            data-item
            role="menuitem"
            className={styles.quickButton}
            aria-pressed={unit === grain}
            data-current={unit === grain || undefined}
            onClick={() => act({ kind: 'select', grain })}
          >
            <Icon path={path} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <ul className={styles.rows}>
        {(
          [
            ['define', 'Define', ICONS.define],
            ['translate', 'Translate', ICONS.translate],
            ['search', 'Search in book', ICONS.search],
            ['speak', 'Read aloud', ICONS.speak],
          ] as const
        ).map(([kind, label, path]) => (
          <li key={kind}>
            <button
              type="button"
              data-item
              role="menuitem"
              className={styles.row}
              onClick={() => act({ kind })}
            >
              <Icon path={path} />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* The tutor's own block, kept apart and labelled, because these four do
          something the rest of the menu does not: they start a conversation. */}
      <div className={styles.ask}>
        <button
          type="button"
          data-item
          className={styles.askHeader}
          aria-expanded={asking}
          aria-controls={askId}
          onClick={() => setAsking((open) => !open)}
        >
          <Icon path={ICONS.spark} filled />
          <span>Ask Claude</span>
          <Icon path={ICONS.chevron} />
        </button>

        <ul id={askId} className={styles.rows} hidden={!asking}>
          {(
            [
              ['explain', 'Explain this passage'],
              ['simply', 'Explain simply'],
              ['quiz', 'Quiz me on this'],
              ['discuss', 'Discuss & ask questions'],
            ] as const
          ).map(([ask, label]) => (
            <li key={ask}>
              <button
                type="button"
                data-item
                role="menuitem"
                className={`${styles.row} ${styles.askRow}`}
                onClick={() => act({ kind: 'ask', ask })}
              >
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      </div>
    </>,
    document.body,
  )
}
