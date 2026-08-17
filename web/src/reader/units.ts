/**
 * Sentences and paragraphs as things you can walk along.
 *
 * `selectAround` in `selection.ts` answers one question — "what is the sentence
 * under my finger?" — and answers it inside a single paragraph. The chevron
 * handles ask a harder one: given a selection that already covers some whole
 * units, what does it cover if it grows by one more at this end? That crosses
 * paragraphs, runs off the end of a section, and has to stop.
 *
 * So the page is treated here as a flat list of *blocks* — the anchored elements,
 * which is exactly what the app already calls a paragraph — and each block as a
 * list of *units*. A paragraph unit is the block. A sentence unit is a span
 * inside it, cut by `Intl.Segmenter`. Growing is then a list walk, and the end of
 * the list is the honest answer "there is no more", which the menu shows by
 * hiding the chevron.
 *
 * Everything here returns a `Range` or `null`. Nothing here touches the DOM
 * selection, stores anything, or knows a menu exists.
 */

import { ANCHOR_ID, flatIndexOf, flatten, rangeOfSpan, type Source } from './selection.ts'

/** The two sizes of step a chevron takes. */
export type SelectionUnit = 'sentence' | 'paragraph'

/** Which end of the selection is growing. */
export type UnitSide = 'start' | 'end'

/** A half-open span `[at, end)` of a block's squeezed text. */
interface Span {
  at: number
  end: number
}

/** One anchored block, flattened once. */
interface Block {
  element: Element
  flat: string
  from: Source[]
}

/**
 * Every anchored block inside the reading column, in reading order.
 *
 * `querySelectorAll` gives document order, which for a book is reading order,
 * so no sorting is needed. Blocks with no text at all are dropped — a figure or
 * an empty paragraph is not somewhere a selection can land, and leaving them in
 * would make one chevron tap appear to do nothing.
 */
function blocksIn(root: HTMLElement): Block[] {
  const blocks: Block[] = []
  for (const element of root.querySelectorAll('[id]')) {
    if (!ANCHOR_ID.test(element.id)) continue
    const { flat, from } = flatten(element)
    if (from.length === 0) continue
    blocks.push({ element, flat, from })
  }
  return blocks
}

/**
 * The units of one block.
 *
 * For a paragraph that is the whole block, always exactly one. For sentences it
 * is the segmenter's cut, with trailing space trimmed off each piece: the
 * segmenter counts the space after a full stop as part of the sentence, and a
 * reader looking at a highlight does not.
 *
 * Without `Intl.Segmenter` the whole block is one unit. That is the same
 * fallback `selection.ts` makes, and for the same reason — a regular expression
 * over full stops is wrong in a different way in every book, and "the sentence
 * button selected the paragraph" is a far smaller surprise than "the sentence
 * button cut Mr. Bennet in half".
 */
function unitsOf(block: Block, unit: SelectionUnit): Span[] {
  if (unit === 'paragraph') return [{ at: 0, end: block.from.length }]

  const segmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
      : null
  if (!segmenter) return [{ at: 0, end: block.from.length }]

  const spans: Span[] = []
  for (const piece of segmenter.segment(block.flat)) {
    const trimmed = piece.segment.replace(/\s+$/, '').length
    if (trimmed > 0) spans.push({ at: piece.index, end: piece.index + trimmed })
  }
  return spans.length > 0 ? spans : [{ at: 0, end: block.from.length }]
}

/** Which block a node sits in, by index. `-1` when it sits in none of them. */
function blockOf(blocks: Block[], node: Node): number {
  return blocks.findIndex((block) => block.element.contains(node))
}

/**
 * Where a range boundary lands in a block's squeezed text.
 *
 * The start boundary wants the character it is on. The end boundary wants the
 * character *before* it, because a range ends after its last character — using
 * the raw index there would pull in the first character of the next unit and
 * make a selection one sentence too long.
 */
function indexIn(block: Block, node: Node, offset: number, side: UnitSide): number {
  if (side === 'start') {
    const at = flatIndexOf(block.from, node, offset)
    return at < 0 ? 0 : at
  }

  /*
   * The end boundary is asked for one character earlier, before it is mapped,
   * not after. The flat map holds a position per *character*, so it has no
   * entry for the boundary past the last one — asking for that gets a miss, and
   * a miss looks exactly like "the very beginning of the block". A selection
   * that ends at the end of a paragraph would then grow backwards.
   */
  // An element boundary names a child, not a character. The last unit of the
  // block is the only answer that cannot grow the wrong way.
  if (node.nodeType !== Node.TEXT_NODE) return block.from.length - 1

  const end = node.textContent?.length ?? 0
  if (offset >= end) {
    const last = flatIndexOf(block.from, node, Math.max(0, end - 1))
    return last < 0 ? block.from.length - 1 : last
  }

  const at = flatIndexOf(block.from, node, Math.max(0, offset - 1))
  return at < 0 ? block.from.length - 1 : at
}

/** The unit of `spans` holding `index`, by index into `spans`. */
function unitAt(spans: Span[], index: number): number {
  const found = spans.findIndex((span) => index < span.end)
  if (found >= 0) return found
  // Past the last unit — trailing whitespace, or a boundary the segmenter
  // dropped. The last unit is the only sensible home for it.
  return spans.length - 1
}

/** One position in the page, as "the Nth unit of the Mth block". */
interface Step {
  block: number
  unit: number
}

/** Every unit of every block, walked as one list. `null` at the ends. */
function stepFrom(blocks: Block[], unit: SelectionUnit, at: Step, by: -1 | 1): Step | null {
  const next = at.unit + by
  if (next >= 0 && next < unitsOf(blocks[at.block]!, unit).length) {
    return { block: at.block, unit: next }
  }

  const block = at.block + by
  if (block < 0 || block >= blocks.length) return null

  const spans = unitsOf(blocks[block]!, unit)
  return { block, unit: by === 1 ? 0 : spans.length - 1 }
}

/** A range covering everything from the start of one step to the end of another. */
function rangeBetween(blocks: Block[], unit: SelectionUnit, from: Step, to: Step): Range | null {
  const first = blocks[from.block]
  const last = blocks[to.block]
  if (!first || !last) return null

  const head = unitsOf(first, unit)[from.unit]
  const tail = unitsOf(last, unit)[to.unit]
  if (!head || !tail) return null

  const start = rangeOfSpan(first.from, head.at, head.end)
  const end = rangeOfSpan(last.from, tail.at, tail.end)
  if (!start || !end) return null

  const range = document.createRange()
  range.setStart(start.startContainer, start.startOffset)
  range.setEnd(end.endContainer, end.endOffset)
  return range
}

/** The two ends of a range, as steps. `null` if it is not in the reading column. */
function stepsOf(
  blocks: Block[],
  unit: SelectionUnit,
  range: Range,
): { from: Step; to: Step } | null {
  const firstBlock = blockOf(blocks, range.startContainer)
  const lastBlock = blockOf(blocks, range.endContainer)
  if (firstBlock < 0 || lastBlock < 0) return null

  const first = blocks[firstBlock]!
  const last = blocks[lastBlock]!

  return {
    from: {
      block: firstBlock,
      unit: unitAt(
        unitsOf(first, unit),
        indexIn(first, range.startContainer, range.startOffset, 'start'),
      ),
    },
    to: {
      block: lastBlock,
      unit: unitAt(unitsOf(last, unit), indexIn(last, range.endContainer, range.endOffset, 'end')),
    },
  }
}

/**
 * The range snapped out to whole units.
 *
 * What "Sentence" and "Paragraph" do on the first tap, and what they do again
 * when the reader switches unit with a selection already grown: both ends move
 * out to the boundaries of the unit they are inside, and nothing is ever lost —
 * snapping only ever grows.
 *
 * Returns `null` when the range is not in the reading column.
 */
export function unitAround(
  range: Range,
  unit: SelectionUnit,
  root: HTMLElement | null,
): Range | null {
  if (!root) return null

  const blocks = blocksIn(root)
  const steps = stepsOf(blocks, unit, range)
  if (!steps) return null

  return rangeBetween(blocks, unit, steps.from, steps.to)
}

/**
 * The range with one more unit on one side.
 *
 * `null` means there is no more page in that direction, and the caller should
 * hide that chevron rather than offer a tap that does nothing.
 */
export function unitBeyond(
  range: Range,
  unit: SelectionUnit,
  side: UnitSide,
  root: HTMLElement | null,
): Range | null {
  if (!root) return null

  const blocks = blocksIn(root)
  const steps = stepsOf(blocks, unit, range)
  if (!steps) return null

  if (side === 'start') {
    const grown = stepFrom(blocks, unit, steps.from, -1)
    return grown ? rangeBetween(blocks, unit, grown, steps.to) : null
  }

  const grown = stepFrom(blocks, unit, steps.to, 1)
  return grown ? rangeBetween(blocks, unit, steps.from, grown) : null
}

/** Whether a chevron has anywhere to go. Cheap enough to call on every render. */
export function canGrow(
  range: Range,
  unit: SelectionUnit,
  side: UnitSide,
  root: HTMLElement | null,
): boolean {
  return unitBeyond(range, unit, side, root) !== null
}
