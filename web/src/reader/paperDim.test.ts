import { describe, expect, it } from 'vitest'

import { DIM_TRAVEL, DIM_ZONE, MAX_DIM, clampDim, dimAfterDrag, inDimZone } from './paperDim'

describe('how dark the paper goes', () => {
  it('starts at full brightness and never passes the darkest setting', () => {
    expect(clampDim(0)).toBe(0)
    expect(clampDim(-3)).toBe(0)
    expect(clampDim(9)).toBe(MAX_DIM)
  })

  it('treats a value that is not a number as full brightness', () => {
    expect(clampDim(Number.NaN)).toBe(0)
  })

  it('leaves the page legible at its darkest', () => {
    expect(MAX_DIM).toBeLessThan(0.85)
  })
})

describe('the drag on the deck', () => {
  const height = 800

  it('darkens the page as the finger goes up', () => {
    expect(dimAfterDrag(0, 100, height)).toBeGreaterThan(0)
  })

  it('lightens the page as the finger goes down', () => {
    expect(dimAfterDrag(0.5, -100, height)).toBeLessThan(0.5)
  })

  it('covers the whole range over its share of the screen', () => {
    expect(dimAfterDrag(0, height * DIM_TRAVEL, height)).toBeCloseTo(MAX_DIM, 5)
  })

  it('returns to where it began when the finger does', () => {
    // Reckoned from the start of the stroke, not added up move by move, so a
    // finger that changes its mind ends exactly where it set off.
    expect(dimAfterDrag(0.3, 0, height)).toBeCloseTo(0.3, 5)
  })

  it('does the same thing on a tall screen as on a short one', () => {
    expect(dimAfterDrag(0, 400 * DIM_TRAVEL, 400)).toBeCloseTo(
      dimAfterDrag(0, 1200 * DIM_TRAVEL, 1200),
      5,
    )
  })

  it('holds at the ends rather than running past them', () => {
    expect(dimAfterDrag(0, 5000, height)).toBe(MAX_DIM)
    expect(dimAfterDrag(0.1, -5000, height)).toBe(0)
  })

  it('answers a screen with no height rather than dividing by it', () => {
    expect(dimAfterDrag(0.2, 100, 0)).toBe(0.2)
  })
})

describe('the band that listens', () => {
  const width = 390

  it('takes a touch on the right edge', () => {
    expect(inDimZone(width - 1, width)).toBe(true)
    expect(inDimZone(width - DIM_ZONE, width)).toBe(true)
  })

  it('leaves the rest of the page alone', () => {
    expect(inDimZone(width / 2, width)).toBe(false)
    expect(inDimZone(0, width)).toBe(false)
    expect(inDimZone(width - DIM_ZONE - 1, width)).toBe(false)
  })

  it('is wide enough for a thumb, whatever the deck is drawn at', () => {
    expect(DIM_ZONE).toBeGreaterThanOrEqual(44)
  })
})
