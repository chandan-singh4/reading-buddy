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

import { HIGHLIGHT_COLOURS, type ReaderSelection, type SelectionEdge } from './selection.ts'
import styles from './SelectionMenu.module.css'

/** What the reader asked for. The Reader decides what any of it means. */
export type SelectionAction =
  | { kind: 'highlight'; colour: string }
  | { kind: 'unhighlight' }
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
  /** One end of the selection dragged to a point on screen. */
  onExtend: (edge: SelectionEdge, x: number, y: number) => void
  /**
   * The highlight already on these words, if there is one.
   *
   * It changes what "Highlight" means. On plain text it adds one; on words that
   * are already highlighted it changes the colour, and a way to take the
   * highlight off appears beside the swatches. Without this the same sentence
   * could be highlighted again and again, once per tap.
   */
  highlighted?: { id: string; colour: string } | null
}

/** How far the card stays from the edge of the screen, and from the selection. */
const MARGIN = 8
const GAP = 10

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
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  chevron: 'M9 6l6 6-6 6',
}

export function SelectionMenu({
  selection,
  onAction,
  onDismiss,
  onExtend,
  highlighted = null,
}: SelectionMenuProps) {
  const card = useRef<HTMLDivElement | null>(null)
  /** Which handle is under a finger, if either. */
  const [dragging, setDragging] = useState<SelectionEdge | null>(null)
  const [place, setPlace] = useState<{ top: number; left: number; above: boolean } | null>(null)
  // Open already when the words carry a highlight: the reader who tapped one is
  // there to change it or take it off, and both live in this panel.
  const [colours, setColours] = useState(highlighted !== null)
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

    const below = selection.rect.bottom + GAP
    const above = selection.rect.top - GAP - box.height
    const fitsBelow = below + box.height + MARGIN <= height
    const goesAbove = !fitsBelow && above >= MARGIN

    const middle = (selection.rect.left + selection.rect.right) / 2
    const left = Math.min(Math.max(middle - box.width / 2, MARGIN), width - box.width - MARGIN)

    setPlace({
      top: goesAbove ? above : Math.min(below, height - box.height - MARGIN),
      left: Math.max(left, MARGIN),
      above: goesAbove,
    })
  }, [selection, colours, asking])

  // Focus goes to the card itself, not to the first item: the reader is holding
  // a finger on the page, and moving focus onto "Highlight" would announce a
  // button they did not ask for. Arrow keys pick up from here.
  useEffect(() => {
    card.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (card.current?.contains(event.target as Node)) return
      // A handle is not the card, but grabbing one is not a tap outside either.
      if ((event.target as HTMLElement | null)?.closest?.(`.${styles.handle}`)) return
      onDismiss()
    }
    // `pointerdown` rather than `click`: a tap outside clears the selection
    // first, and by click time there is nothing left to act on.
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
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
   */
  function handleFor(edge: SelectionEdge) {
    const rects = selection.rects
    const rect = edge === 'start' ? rects[0] : rects[rects.length - 1]
    if (!rect) return null

    const x = edge === 'start' ? rect.left : rect.left + rect.width

    function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(edge)
    }

    function onPointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
      if (dragging !== edge) return
      event.preventDefault()
      // Read a little above the finger: the text being aimed at is the text the
      // fingertip is covering, not the pixel under its centre.
      onExtend(edge, event.clientX, event.clientY - rect.height / 2)
    }

    function onPointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      setDragging(null)
    }

    return (
      <span
        key={edge}
        className={`${styles.handle} ${edge === 'start' ? styles.handleStart : styles.handleEnd}`}
        aria-hidden="true"
        style={{ top: `${rect.top}px`, left: `${x}px`, height: `${rect.height}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className={styles.knob} />
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
        // Hidden until measured, so it is never seen in the wrong place. Hidden
        // again during a drag: the card would sit over the words being chosen.
        visibility: place && !dragging ? 'visible' : 'hidden',
      }}
      role="menu"
      aria-label="Selected text"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {/* The quick row: the five things a reader does most, as icons. */}
      <div className={styles.quick}>
        <button
          type="button"
          data-item
          role="menuitem"
          className={styles.quickButton}
          aria-expanded={colours}
          onClick={() => setColours((open) => !open)}
        >
          <Icon path={ICONS.highlight} />
          <span>Highlight</span>
        </button>
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
        <button
          type="button"
          data-item
          role="menuitem"
          className={styles.quickButton}
          onClick={() => act({ kind: 'save' })}
        >
          <Icon path={ICONS.save} />
          <span>Save</span>
        </button>
        <button
          type="button"
          data-item
          role="menuitem"
          className={styles.quickButton}
          onClick={() => act({ kind: 'share' })}
        >
          <Icon path={ICONS.share} />
          <span>Share</span>
        </button>
      </div>

      {colours && (
        <div className={styles.colours} role="group" aria-label="Highlight colour">
          {HIGHLIGHT_COLOURS.map((colour) => (
            <button
              key={colour.id}
              type="button"
              data-item
              role="menuitem"
              className={styles.swatch}
              style={{ background: colour.value }}
              aria-label={`Highlight ${colour.label.toLowerCase()}`}
              aria-current={highlighted?.colour === colour.value || undefined}
              data-current={highlighted?.colour === colour.value || undefined}
              onClick={() => act({ kind: 'highlight', colour: colour.value })}
            />
          ))}
          {/* The native colour wheel, worn as a swatch. A custom colour is rare
              enough that building a picker for it would be all cost. */}
          <label className={styles.custom}>
            <span className={styles.customLabel}>Custom colour</span>
            <input
              type="color"
              data-item
              className={styles.customInput}
              defaultValue="#f2df6b"
              onChange={(event) => act({ kind: 'highlight', colour: event.target.value })}
            />
          </label>

          {/* Only when there is one to take off. A "remove" that removes
              nothing is a button that teaches the reader to doubt the menu. */}
          {highlighted && (
            <button
              type="button"
              data-item
              role="menuitem"
              className={styles.remove}
              onClick={() => act({ kind: 'unhighlight' })}
            >
              Remove
            </button>
          )}
        </div>
      )}

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
