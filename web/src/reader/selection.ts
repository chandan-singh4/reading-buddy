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
   * browser offered. `selectionBetween` moves one end of this.
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

/** The end that holds still while the other one is dragged. */
export interface SelectionPivot {
  node: Node
  offset: number
}

/** The end a drag leaves alone: grab the start, and the end is the pivot. */
export function pivotFor(selection: ReaderSelection, edge: SelectionEdge): SelectionPivot {
  const range = selection.range
  return edge === 'start'
    ? { node: range.endContainer, offset: range.endOffset }
    : { node: range.startContainer, offset: range.startOffset }
}

/**
 * The selection between a pivot and a point on screen.
 *
 * The two handles are independent: either one can be dragged anywhere, past the
 * other one included. This used to refuse a crossing drag on the grounds that a
 * selection swapping ends under a finger is hard to aim. In practice it read as
 * a handle that had jammed — a reader who starts mid-sentence and then wants the
 * line above could not get there, and nothing on screen said why.
 *
 * So a crossing is allowed, and handled the way a phone handles it: the pivot
 * stays where it is, and the two boundaries are simply put back in document
 * order. Whichever side the finger is on becomes that side of the selection.
 *
 * Returns `null` when the point is not on text inside `root`, or when it lands
 * on the pivot itself — the caller should read that as "keep what you had".
 */
export function selectionBetween(
  pivot: SelectionPivot,
  x: number,
  y: number,
  root: HTMLElement | null,
): ReaderSelection | null {
  if (!root) return null

  const caret = caretAt(x, y)
  if (!caret || !root.contains(caret.node)) return null

  const held = document.createRange()
  held.setStart(pivot.node, pivot.offset)
  const moved = document.createRange()
  moved.setStart(caret.node, caret.offset)

  const before = moved.compareBoundaryPoints(Range.START_TO_START, held) < 0
  const range = document.createRange()
  range.setStart(before ? caret.node : pivot.node, before ? caret.offset : pivot.offset)
  range.setEnd(before ? pivot.node : caret.node, before ? pivot.offset : caret.offset)

  if (range.collapsed) return null
  return describe(range, root)
}

/** Where one squeezed character came from. */
export interface Source {
  node: Text
  offset: number
}

/**
 * A paragraph's text with its spaces squeezed, plus a map back to the page.
 *
 * A paragraph is not one string: it is a run of text nodes with italics and
 * links between them, and its whitespace is whatever the source file had. Every
 * job here — finding a stored quote again, finding where a sentence ends — is
 * easier on one tidy string, and impossible to act on without a way back. So
 * each character of `flat` has an entry in `from` saying which text node and
 * which offset it came from.
 */
export function flatten(element: Element): { flat: string; from: Source[] } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let flat = ''
  const from: Source[] = []

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const raw = text.data
    for (let i = 0; i < raw.length; i += 1) {
      const space = /\s/.test(raw[i]!)
      // A run of whitespace becomes one space, and a leading one is dropped —
      // the same squeeze `describe` applies before storing.
      if (space && (flat.length === 0 || flat.endsWith(' '))) continue
      flat += space ? ' ' : raw[i]
      from.push({ node: text, offset: i })
    }
  }

  return { flat, from }
}

/** A range over `flat[at .. end)`, in page terms. */
export function rangeOfSpan(from: Source[], at: number, end: number): Range | null {
  const start = from[at]
  const last = from[end - 1]
  if (!start || !last) return null

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(last.node, last.offset + 1)
  return range
}

/** How much of the page a reader wants in one tap. */
export type SelectionGrain = 'sentence' | 'paragraph'

/**
 * The whole sentence, or the whole paragraph, around what is already selected.
 *
 * Dragging two handles over seven lines to catch one sentence is work the app
 * can do instead. The reader touches any word in the sentence and asks for the
 * sentence; the boundaries are the browser's own, through `Intl.Segmenter`,
 * which follows the Unicode rules — a closing quote or bracket after the full
 * stop belongs to the sentence, an ellipsis does not end one, and the rules
 * change with the language rather than with our guesses.
 *
 * It is not perfect: ICU breaks after an abbreviation, so "Mr. Bennet" is two
 * sentences to it. That is a wrong answer a reader can fix with one drag, and
 * the alternative is a list of abbreviations that is wrong in a new way for
 * every book.
 *
 * The paragraph is simply everything inside the anchored element, which is what
 * an anchor names.
 *
 * Returns `null` when there is nothing to do — the words asked for are already
 * exactly what is selected — so the caller can leave the button out rather than
 * offer one that does nothing.
 */
export function selectAround(
  selection: ReaderSelection,
  grain: SelectionGrain,
  root: HTMLElement | null,
): ReaderSelection | null {
  if (!root) return null

  const element = document.getElementById(selection.anchor.replace(/[[\]]/g, ''))
  if (!element) return null

  const { flat, from } = flatten(element)
  if (from.length === 0) return null

  const range = grain === 'paragraph' ? rangeOfSpan(from, 0, from.length) : sentenceIn(flat, from, selection)
  if (!range) return null

  const grown = describe(range, root)
  // Nothing gained. The selection already covers it.
  if (!grown || grown.text === selection.text) return null
  return grown
}

/** The sentence holding the start of `selection`. */
function sentenceIn(flat: string, from: Source[], selection: ReaderSelection): Range | null {
  const at = flatIndexOf(from, selection.range.startContainer, selection.range.startOffset)
  if (at < 0) return null

  const segmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
      : null
  // No Segmenter: the paragraph is the honest answer, not a guess at full stops.
  if (!segmenter) return rangeOfSpan(from, 0, from.length)

  for (const piece of segmenter.segment(flat)) {
    const end = piece.index + piece.segment.length
    if (at < end) {
      // Trailing space belongs to the sentence for the segmenter, not for a
      // reader looking at a highlight.
      const trimmed = piece.segment.replace(/\s+$/, '').length
      return rangeOfSpan(from, piece.index, piece.index + trimmed)
    }
  }
  return null
}

/** Where a page position lands in the squeezed text. `-1` if it is not in it. */
export function flatIndexOf(from: Source[], node: Node, offset: number): number {
  for (let i = 0; i < from.length; i += 1) {
    const source = from[i]!
    if (source.node === node && source.offset >= offset) return i
  }
  // An element boundary, or a position in whitespace that was squeezed away.
  return from.length > 0 && node.contains?.(from[0]!.node) ? 0 : -1
}

/**
 * A stored quote found again in the page.
 *
 * A highlight is filed as an anchor plus the words, never as a pair of DOM
 * offsets — offsets do not survive a re-parse, a font change or a page turn,
 * and the words do. So painting a highlight means looking its text up again in
 * the paragraph it belongs to.
 *
 * Whitespace is the whole difficulty. The stored quote had its runs of space
 * squeezed to one; the page's text nodes still hold the original. So the
 * paragraph is flattened the same way, with a map back from each squeezed
 * character to the text node and offset it came from.
 *
 * Returns `null` when the paragraph is not on screen, or when the words are no
 * longer in it — a book re-parsed by a newer version, most often. A highlight
 * that cannot be placed is not drawn, and nothing else about it is lost.
 */
export function rangeOfQuote(anchor: Anchor, quote: string): Range | null {
  const element = document.getElementById(anchor.replace(/[[\]]/g, ''))
  if (!element) return null

  const { flat, from } = flatten(element)

  const wanted = quote.replace(/\s+/g, ' ').trim()
  const at = flat.indexOf(wanted)
  if (at < 0 || wanted.length === 0) return null

  const start = from[at]
  const end = from[at + wanted.length - 1]
  if (!start || !end) return null

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset + 1)
  return range
}

/**
 * The highlight under a point on screen, if a finger landed on one.
 *
 * A highlight painted by the browser's own highlight API is ink, not an
 * element: there is nothing under the finger to receive a click, and
 * `elementFromPoint` will only ever name the paragraph. So the hit test is done
 * the other way round — find the text position under the point, then ask each
 * highlight's range whether that position is inside it.
 *
 * The last match wins, so the newest highlight is the one a reader gets when
 * two overlap.
 */
export function highlightAt<T extends { anchor: Anchor; quote?: string }>(
  x: number,
  y: number,
  highlights: readonly T[],
): { highlight: T; range: Range } | null {
  const caret = caretAt(x, y)
  if (!caret) return null

  let found: { highlight: T; range: Range } | null = null
  for (const highlight of highlights) {
    if (!highlight.quote) continue
    const range = rangeOfQuote(highlight.anchor, highlight.quote)
    if (!range) continue
    // `isPointInRange` throws if the node is in another document.
    try {
      if (range.isPointInRange(caret.node, caret.offset)) found = { highlight, range }
    } catch {
      continue
    }
  }
  return found
}

/** Everything the app keeps about a range, for a range it did not select. */
export function describeRange(range: Range, root: HTMLElement | null): ReaderSelection | null {
  if (!root) return null
  return describe(range, root)
}

/** `ch02-s03-p013` — the shape `elementIdOf` makes out of an anchor. */
export const ANCHOR_ID = /^ch\d+-s\d+-[a-z]\d+$/

export function anchorOfNode(node: Node | null): Anchor | null {
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
