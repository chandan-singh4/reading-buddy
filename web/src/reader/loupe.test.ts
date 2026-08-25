/**
 * Placing the loupe.
 *
 * One rule underneath every test: the panel must not cover the word it is
 * about. A dictionary panel sitting on the word the reader tapped is the single
 * most obvious way this feature could be wrong.
 */

import { describe, expect, it } from 'vitest'

import { onScreen, placeLoupe, type WordRect } from './loupe.ts'

/** A phone. The app is built for this screen first. */
const PHONE = { viewportWidth: 390, viewportHeight: 800 }

const PHONE_ROOM = { ...PHONE, wants: 300 }

const word = (over: Partial<WordRect> = {}): WordRect => ({
  top: 300,
  left: 120,
  width: 90,
  height: 22,
  ...over,
})

describe('which side of the word', () => {
  it('goes below a word near the top', () => {
    const placed = placeLoupe([word({ top: 120 })], { ...PHONE, wants: 400 })
    expect(placed.above).toBe(false)
    expect(placed.top).toBeGreaterThan(120 + 22)
  })

  it('goes above a word near the bottom', () => {
    const placed = placeLoupe([word({ top: 700 })], { ...PHONE, wants: 400 })
    expect(placed.above).toBe(true)
    expect(placed.top + 400).toBeLessThanOrEqual(700)
  })

  it('stays below a low word when the panel is short enough to fit', () => {
    // A two-line entry fits under a word near the foot of the page. Moving it
    // up would be a jump for nothing.
    const placed = placeLoupe([word({ top: 640 })], { ...PHONE, wants: 90 })
    expect(placed.above).toBe(false)
  })

  it('never covers the word, whichever side it took', () => {
    for (const top of [0, 60, 200, 380, 500, 640, 760]) {
      const one = word({ top })
      const placed = placeLoupe([one], { ...PHONE, wants: 430 })
      const panelBottom = placed.top + Math.min(430, placed.limit)
      const clear = placed.above ? panelBottom <= one.top : placed.top >= one.top + one.height
      expect({ top, clear }).toEqual({ top, clear: true })
    }
  })
})

describe('staying on the screen', () => {
  it('keeps the panel inside the window even with nowhere to go', () => {
    // A word in the dead centre of a short screen has room on neither side.
    const placed = placeLoupe([word({ top: 380 })], {
      viewportWidth: 390,
      viewportHeight: 500,
      wants: 900,
    })
    expect(placed.top).toBeGreaterThanOrEqual(16)
    expect(placed.top + Math.min(900, placed.limit)).toBeLessThanOrEqual(500 - 16)
  })

  it('never asks for more height than the window has', () => {
    const placed = placeLoupe([word()], { ...PHONE, wants: 5000 })
    expect(placed.limit).toBeLessThanOrEqual(800 - 32)
  })

  it('holds the same margin on both sides', () => {
    const placed = placeLoupe([word()], { ...PHONE, wants: 300 })
    expect(placed.left).toBe(16)
    expect(placed.left + placed.width).toBe(390 - 16)
  })
})

describe('the stem', () => {
  it('points at the word, not at the middle of the panel', () => {
    /*
     * The panel is nearly the width of the screen, so its centre is almost
     * never over the word. A stem at the centre is an arrow pointing at the
     * wrong part of the sentence.
     */
    const placed = placeLoupe([word({ left: 40, width: 60 })], { ...PHONE, wants: 300 })
    expect(placed.left + placed.stemLeft).toBeCloseTo(70, 0)
  })

  it('is held away from the panel’s corners', () => {
    // A stem on a 26px rounded corner is a triangle floating off the edge.
    const far = placeLoupe([word({ left: 2, width: 10 })], { ...PHONE, wants: 300 })
    expect(far.stemLeft).toBeGreaterThanOrEqual(34)

    const right = placeLoupe([word({ left: 380, width: 8 })], { ...PHONE, wants: 300 })
    expect(right.stemLeft).toBeLessThanOrEqual(right.width - 34)
  })

  it('follows a word that is off the side of the screen', () => {
    const placed = placeLoupe([word({ left: -200, width: 40 })], { ...PHONE, wants: 300 })
    expect(placed.stemLeft).toBeGreaterThanOrEqual(34)
    expect(placed.stemLeft).toBeLessThanOrEqual(placed.width - 34)
  })
})

describe('a selection spread over columns', () => {
  it('measures only the lines on this screen', () => {
    /*
     * The pages are columns side by side, so a word from the previous page sits
     * off to the left at the same heights. Measuring it too makes the word look
     * as tall as the window, and the panel lands on the word it is about.
     */
    const here = word({ top: 300 })
    const previousPage = word({ top: 60, left: -400 })
    expect(onScreen([previousPage, here], 390, 800)).toEqual([here])
  })

  it('falls back to every line when none of them are on screen', () => {
    // Better a placement made from stale numbers than no panel at all.
    const away = word({ top: -900 })
    expect(onScreen([away], 390, 800)).toEqual([away])
  })

  it('places from the visible line', () => {
    const placed = placeLoupe([word({ top: 60, left: -400 }), word({ top: 300 })], {
      ...PHONE,
      wants: 300,
    })
    expect(placed.top).toBeGreaterThan(300)
  })
})

describe('a selection with no rectangles', () => {
  it('still places a panel, in the middle of the screen', () => {
    /*
     * The 2026-08-24 report: Define did nothing. One of its two causes was
     * here — an empty list threw, and a panel that cannot be placed is a panel
     * the reader never sees. Not beside the word is a small failure. Absent is
     * a total one.
     */
    const placed = placeLoupe([], PHONE_ROOM)
    expect(Number.isFinite(placed.top)).toBe(true)
    expect(Number.isFinite(placed.stemLeft)).toBe(true)
    expect(placed.left).toBe(16)
    expect(placed.top).toBeGreaterThanOrEqual(16)
  })
})

