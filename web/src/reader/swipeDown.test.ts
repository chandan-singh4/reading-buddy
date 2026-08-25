import { describe, expect, it } from 'vitest'

import {
  DISMISS_DISTANCE,
  DISMISS_VELOCITY,
  DRAG_SLOP,
  dismisses,
  offsetFor,
} from './swipeDown.ts'

describe('offsetFor', () => {
  it('does not move on a tap', () => {
    expect(offsetFor(0)).toBe(0)
    expect(offsetFor(DRAG_SLOP)).toBe(0)
  })

  it('follows the finger exactly, up to the dismiss point', () => {
    expect(offsetFor(40)).toBe(40)
    expect(offsetFor(DISMISS_DISTANCE)).toBe(DISMISS_DISTANCE)
  })

  it('slows down past the dismiss point instead of running off the screen', () => {
    const far = offsetFor(DISMISS_DISTANCE + 300)
    expect(far).toBeGreaterThan(DISMISS_DISTANCE)
    expect(far).toBeLessThan(DISMISS_DISTANCE + 300)
  })

  it('ignores an upward drag', () => {
    expect(offsetFor(-120)).toBe(0)
  })
})

describe('dismisses', () => {
  it('closes on a long pull, however slow', () => {
    expect(dismisses(DISMISS_DISTANCE, 4000)).toBe(true)
  })

  it('closes on a short fast flick', () => {
    // 40px in 50ms is 800px/s.
    expect(dismisses(40, 50)).toBe(true)
  })

  it('springs back from a short slow drag', () => {
    // 40px in 1000ms is 40px/s — the reader changed their mind.
    expect(dismisses(40, 1000)).toBe(false)
  })

  it('never closes on a tap', () => {
    expect(dismisses(0, 0)).toBe(false)
    expect(dismisses(DRAG_SLOP, 1)).toBe(false)
  })

  it('does not read a stationary finger as infinite speed', () => {
    // Two events in the same millisecond. A naive dy/0 is Infinity.
    expect(dismisses(10, 0)).toBe(false)
  })

  it('ignores an upward flick', () => {
    expect(dismisses(-80, 40)).toBe(false)
  })

  it('agrees with its own threshold', () => {
    const justUnder = (DISMISS_VELOCITY / 1000) * 50 - 1
    expect(dismisses(justUnder, 50)).toBe(false)
  })
})
