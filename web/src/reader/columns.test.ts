/**
 * The arithmetic of a paged strip. Pure on purpose: this is where page turning
 * goes subtly wrong — an unreachable last page, an off-by-one at the ends — and
 * none of that needs a browser to catch.
 */

import { describe, expect, it } from 'vitest'

import { offsetOfPage, pageAt, pageCountOf, turn } from './columns.ts'

/** A section that came out as `pages` screens of 400px each. */
function strip(pages: number, scrollLeft = 0) {
  return { scrollWidth: pages * 400, pageWidth: 400, scrollLeft }
}

describe('how many pages a section became', () => {
  it('counts the columns', () => {
    expect(pageCountOf(strip(5))).toBe(5)
  })

  it('absorbs the fractional widths browsers report', () => {
    // Layout gives back numbers like 1199.98. Left alone, this is how a book
    // gains a phantom final page that is 0.02px wide.
    expect(pageCountOf({ scrollWidth: 1199.98, pageWidth: 400, scrollLeft: 0 })).toBe(3)
  })

  it('never reports nought pages', () => {
    // Before layout has happened, every measurement is zero.
    expect(pageCountOf({ scrollWidth: 0, pageWidth: 0, scrollLeft: 0 })).toBe(1)
  })
})

describe('which page is showing', () => {
  it('is 1-based', () => {
    expect(pageAt(strip(5))).toBe(1)
    expect(pageAt(strip(5, 800))).toBe(3)
  })

  it('rounds to the nearest column mid-scroll', () => {
    expect(pageAt(strip(5, 810))).toBe(3)
  })

  it('never runs past the last page', () => {
    expect(pageAt(strip(3, 99999))).toBe(3)
  })
})

describe('moving to a page', () => {
  it('gives the offset that brings it into view', () => {
    expect(offsetOfPage(strip(5), 1)).toBe(0)
    expect(offsetOfPage(strip(5), 4)).toBe(1200)
  })

  it('clamps a page outside the section', () => {
    expect(offsetOfPage(strip(5), 0)).toBe(0)
    expect(offsetOfPage(strip(5), 99)).toBe(1600)
  })
})

describe('turning a page', () => {
  it('moves one page at a time', () => {
    expect(turn(strip(5), 1)).toBe(2)
    expect(turn(strip(5, 800), -1)).toBe(2)
  })

  it('refuses to run off either end', () => {
    // `null` rather than a clamped page, because the caller has to tell "you're
    // on the last page" (load the next section) from "you moved" (don't).
    expect(turn(strip(3, 800), 1)).toBeNull()
    expect(turn(strip(3), -1)).toBeNull()
  })

  it('says nothing is left in a single-page section', () => {
    expect(turn(strip(1), 1)).toBeNull()
    expect(turn(strip(1), -1)).toBeNull()
  })
})
