/**
 * What the reader has selected, in the terms the rest of the app speaks.
 *
 * A DOM selection is a pair of nodes and offsets. Everything the app does with
 * a selection — a highlight, a note, a question to the tutor — is filed against
 * an anchor instead, because a paragraph keeps its anchor and a DOM range does
 * not survive a page turn. So this reads the selection once, at the moment the
 * reader makes it, and hands back the two things worth keeping: the words and
 * the paragraph they came from.
 */

import type { Anchor } from '../structure/index.ts'

/** A highlight colour the reader can pick without opening the colour wheel. */
export interface HighlightColour {
  /** Stored on the note, so it must never change once shipped. */
  id: string
  label: string
  /** The swatch and the highlight itself. */
  value: string
}

/**
 * The four standing colours, from the prototype.
 *
 * Named rather than numbered because the colour is kept on the annotation: a
 * reader who uses yellow for "important" and blue for "look this up" is storing
 * meaning in it, and a re-themed palette must not rewrite what they meant.
 */
export const HIGHLIGHT_COLOURS: readonly HighlightColour[] = [
  { id: 'yellow', label: 'Yellow', value: '#f2df6b' },
  { id: 'green', label: 'Green', value: '#a8d5a2' },
  { id: 'blue', label: 'Blue', value: '#a9c7f0' },
  { id: 'purple', label: 'Purple', value: '#d8b6ec' },
]

/** A selection the reader made inside the page. */
export interface ReaderSelection {
  /** The selected words, whitespace tidied. */
  text: string
  /** The paragraph the selection starts in. */
  anchor: Anchor
  /** Where it sits on screen, for placing the menu. Viewport coordinates. */
  rect: { top: number; bottom: number; left: number; right: number }
  /**
   * One box per line of the selection.
   *
   * Kept because the app paints the selection itself. The phone's own text menu
   * appears the moment a native selection exists and cannot be turned off, so
   * the selection is read, dropped, and drawn again by us — and these are what
   * gets drawn. See `SelectionMenu.tsx`.
   */
  rects: SelectionRect[]
  /**
   * The range itself, so the reader can stretch it.
   *
   * The phone's own drag handles went with the phone's own menu, and a reader
   * who can only ever select one word has been given a worse deal than the
   * browser offered. `extendSelection` moves one end of this.
   */
  range: Range
}

/** Which end of a selection a finger is dragging. */
export type SelectionEdge = 'start' | 'end'

/** One line of a selection, in viewport coordinates. */
export interface SelectionRect {
  top: number
  left: number
  width: number
  height: number
}

/**
 * The text position under a point on screen.
 *
 * Two names for one thing. `caretRangeFromPoint` is what Chrome and Safari
 * have — which is every browser this app is read in — and
 * `caretPositionFromPoint` is the standard one Firefox implements. Neither is
 * in the DOM types, hence the casts.
 */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }

  const range = doc.caretRangeFromPoint?.(x, y)
  if (range) return { node: range.startContainer, offset: range.startOffset }

  const position = doc.caretPositionFromPoint?.(x, y)
  if (position) return { node: position.offsetNode, offset: position.offset }

  return null
}

/**
 * One end of the selection dragged to a point on screen.
 *
 * The other end holds still. A drag that would turn the selection inside out —
 * the start pulled past the end — is refused rather than flipped, because a
 * selection that swaps ends under a finger is a selection nobody can aim.
 *
 * Returns `null` when the point is not on text inside `root`, which the caller
 * should read as "keep what you had".
 */
export function extendSelection(
  current: ReaderSelection,
  edge: SelectionEdge,
  x: number,
  y: number,
  root: HTMLElement | null,
): ReaderSelection | null {
  if (!root) return null

  const caret = caretAt(x, y)
  if (!caret || !root.contains(caret.node)) return null

  const range = current.range.cloneRange()
  const moved = document.createRange()
  moved.setStart(caret.node, caret.offset)

  if (edge === 'end') {
    // Past the start, or there is nothing left to select.
    if (moved.compareBoundaryPoints(Range.START_TO_START, range) <= 0) return null
    range.setEnd(caret.node, caret.offset)
  } else {
    if (moved.compareBoundaryPoints(Range.START_TO_END, range) >= 0) return null
    range.setStart(caret.node, caret.offset)
  }

  return describe(range, root)
}

/** `ch02-s03-p013` — the shape `elementIdOf` makes out of an anchor. */
const ANCHOR_ID = /^ch\d+-s\d+-[a-z]\d+$/

function anchorOfNode(node: Node | null): Anchor | null {
  let element = node instanceof Element ? node : node?.parentElement
  while (element) {
    if (ANCHOR_ID.test(element.id)) return `[${element.id}]` as Anchor
    element = element.parentElement
  }
  return null
}

/**
 * The current selection, if it is a real one inside `root`.
 *
 * Returns `null` for a caret, for whitespace, for a selection that started
 * outside the reading column — the toolbar, a panel — and for one whose
 * paragraph cannot be named. The caller can treat `null` as "no menu".
 */
export function selectionInReader(root: HTMLElement | null): ReaderSelection | null {
  if (!root) return null
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  return describe(selection.getRangeAt(0), root)
}

/** Everything the app keeps about a range. `null` if the range is no good. */
function describe(range: Range, root: HTMLElement): ReaderSelection | null {
  if (!root.contains(range.commonAncestorContainer)) return null

  const text = range.toString().replace(/\s+/g, ' ').trim()
  if (!text) return null

  const anchor = anchorOfNode(range.startContainer)
  if (!anchor) return null

  // The union of the client rects rather than `getBoundingClientRect`: a
  // selection running over three lines has a bounding box as wide as the
  // column, and a menu centred on that points at nothing.
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0)
  const box = rects.length > 0 ? rects : [range.getBoundingClientRect()]

  return {
    text,
    anchor,
    range: range.cloneRange(),
    rect: {
      top: Math.min(...box.map((rect) => rect.top)),
      bottom: Math.max(...box.map((rect) => rect.bottom)),
      left: Math.min(...box.map((rect) => rect.left)),
      right: Math.max(...box.map((rect) => rect.right)),
    },
    rects: box.map((rect) => ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    })),
  }
}
