/**
 * Where the Define panel sits, and where its stem points.
 *
 * The panel is a loupe held over the page, so the one thing it must never do is
 * cover the word it is about. Everything here follows from that: take the side
 * of the word with the room, cap the panel to the room it took, and point the
 * stem back at the word wherever the panel ended up.
 *
 * Kept as a pure function of numbers rather than of elements. The rules are
 * fiddly — a word on the last line of a full screen, a selection that began on
 * the previous page — and jsdom has no layout, so a version that measured DOM
 * nodes could not be tested at all.
 */

/** One line of the selected word, in viewport coordinates. */
export interface WordRect {
  top: number
  left: number
  width: number
  height: number
}

export interface Loupe {
  top: number
  left: number
  width: number
  /** How tall the panel may be here. It scrolls inside this. */
  limit: number
  /** True when the panel had to go above the word. The stem flips with it. */
  above: boolean
  /** The stem's centre, measured from the panel's own left edge. */
  stemLeft: number
}

export interface LoupeRoom {
  viewportWidth: number
  viewportHeight: number
  /** How tall the panel would like to be, unconstrained. */
  wants: number
}

/** The gap between the word and the panel's edge — enough to read the word in. */
const GAP = 14

/** Never nearer the screen edge than this. */
const MARGIN = 16

/** A panel shorter than this is not worth opening; it scrolls instead. */
const MIN_PANEL = 220

/** Half the stem, plus the panel's corner radius, so it never sits on a corner. */
const STEM_INSET = 34

/**
 * Only the lines on this screen count.
 *
 * The pages are columns side by side, so a selection that began on the previous
 * page still has its rectangles — off to the left, at the same heights as this
 * one. Measuring those too makes the word look as tall as the window, the
 * placement reads that as "no room anywhere", and the panel lands on the very
 * word it is about. `SelectionMenu` learned this the hard way; the note there
 * is the long version.
 */
export function onScreen(rects: readonly WordRect[], width: number, height: number): WordRect[] {
  const here = rects.filter(
    (line) =>
      line.left < width && line.left + line.width > 0 && line.top < height && line.top + line.height > 0,
  )
  return here.length > 0 ? here : [...rects]
}

export function placeLoupe(rects: readonly WordRect[], room: LoupeRoom): Loupe {
  const { viewportWidth: width, viewportHeight: height, wants } = room

  const shown = onScreen(rects, width, height)
  const top = Math.min(...shown.map((line) => line.top))
  const bottom = Math.max(...shown.map((line) => line.top + line.height))

  const panelWidth = Math.max(width - MARGIN * 2, 0)
  const left = MARGIN

  const roomBelow = height - MARGIN - (bottom + GAP)
  const roomAbove = top - GAP - MARGIN

  /*
   * Below by preference, above when below will not hold it.
   *
   * "Will not hold it" is about the panel's full height, not a fixed threshold:
   * a two-line entry fits under a word near the foot of the page, and moving it
   * up there would be a jump for nothing.
   */
  const above = wants > roomBelow && roomAbove > roomBelow
  const limit = Math.min(Math.max(above ? roomAbove : roomBelow, MIN_PANEL), height - MARGIN * 2)
  const tall = Math.min(wants, limit)

  // Even `MIN_PANEL` can ask for more room than a side has, so the last step is
  // to pull the panel back inside the window whatever the arithmetic said.
  const wantedTop = above ? top - GAP - tall : bottom + GAP
  const placed = Math.min(Math.max(wantedTop, MARGIN), Math.max(height - tall - MARGIN, MARGIN))

  /*
   * The stem points at the word, not at the middle of the panel.
   *
   * The panel is nearly the width of the screen, so its centre is almost never
   * over the word. A stem at the centre would be an arrow pointing at the wrong
   * part of the sentence, which is worse than no arrow.
   */
  const first = shown[0]!
  const centre = Math.min(Math.max(first.left + first.width / 2, 0), width)
  const stemLeft = Math.min(Math.max(centre - left, STEM_INSET), Math.max(panelWidth - STEM_INSET, STEM_INSET))

  return { top: placed, left, width: panelWidth, limit, above, stemLeft }
}
