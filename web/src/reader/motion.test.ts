import { describe, expect, it } from 'vitest'

import { MOVE_EASING, MOVE_MS, MOVE_TIMING, easeMove } from './motion.ts'

describe('one timing for every move', () => {
  // The point of the module. If these ever disagree, a turn between chapters
  // runs at a different speed from a turn within one, which is the exact bug
  // this replaced.
  it('hands the same duration and curve to every kind of move', () => {
    expect(MOVE_TIMING.duration).toBe(MOVE_MS)
    expect(MOVE_TIMING.easing).toBe(MOVE_EASING)
  })

  it('states its curve in the form CSS understands', () => {
    expect(MOVE_EASING).toMatch(/^cubic-bezier\(/)
  })
})

describe('the curve, evaluated for the scroll', () => {
  // The scroll is animated by hand, so its easing is computed rather than
  // handed to the browser. Landing exactly on both ends is what stops a page
  // turn finishing a pixel short of its column.
  it('starts at nothing and ends at everything', () => {
    expect(easeMove(0)).toBe(0)
    expect(easeMove(1)).toBe(1)
  })

  it('refuses to overshoot when asked for a time outside the move', () => {
    expect(easeMove(-1)).toBe(0)
    expect(easeMove(2)).toBe(1)
  })

  it('never goes backwards', () => {
    let previous = 0
    for (let step = 1; step <= 100; step += 1) {
      const at = easeMove(step / 100)
      expect(at).toBeGreaterThanOrEqual(previous)
      previous = at
    }
  })

  // Quick to leave, slow to settle — the shape of something pushed. Past the
  // halfway point in time it should be well past halfway in distance.
  it('front-loads the movement', () => {
    expect(easeMove(0.5)).toBeGreaterThan(0.5)
  })
})
