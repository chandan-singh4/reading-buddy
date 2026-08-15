import { describe, expect, it } from 'vitest'

import {
  bendAt,
  castShadow,
  COMMIT_AT,
  completionEase,
  curl,
  FLICK,
  curlProgress,
  releaseInto,
  snapBackEase,
  STRIPS,
} from './pageCurl.ts'

/**
 * Read a strip's transform back out as numbers.
 *
 * The transforms are the module's only output, so the tests have to go through
 * the same string a browser would. Parsing them is not incidental — it is what
 * makes these tests about the thing that ships rather than about a private
 * intermediate the code could stop using.
 */
function readBack(transform: string): { x: number; z: number; degrees: number } {
  const moved = /translate3d\((-?[\d.]+)px, 0, (-?[\d.]+)px\)/.exec(transform)
  const turned = /rotateY\((-?[\d.]+)deg\)/.exec(transform)
  if (!moved || !turned) throw new Error(`unreadable transform: ${transform}`)
  return { x: Number(moved[1]), z: Number(moved[2]), degrees: Number(turned[1]) }
}

/** Where a strip's two vertical edges actually land, in hinge coordinates. */
function edgesOf(strip: { offset: number; width: number; transform: string }) {
  const { x, z, degrees } = readBack(strip.transform)
  const radians = (degrees * Math.PI) / 180
  const left = { x: strip.offset + x, z }
  return {
    left,
    right: {
      // rotateY is negative here, so `cos` is unchanged and `sin` flips sign.
      x: left.x + strip.width * Math.cos(radians),
      z: left.z - strip.width * Math.sin(radians),
    },
  }
}

const W = 400

describe('curl — the shape of the sheet', () => {
  it('is perfectly flat at rest', () => {
    for (const strip of curl(W, 0)) {
      const { left, right } = edgesOf(strip)
      expect(left.x).toBeCloseTo(strip.offset, 3)
      expect(left.z).toBeCloseTo(0, 3)
      expect(right.z).toBeCloseTo(0, 3)
      expect(strip.dark).toBe(0)
      expect(strip.blank).toBe(0)
    }
  })

  it('joins its strips exactly, at every progress', () => {
    // The invariant the whole approach rests on. A gap here is daylight through
    // a sheet of paper, and it would show as a bright hairline on a dark theme.
    for (const progress of [0.05, 0.2, 0.37, 0.5, 0.68, 0.9, 1]) {
      const strips = curl(W, progress)
      for (let i = 0; i < strips.length - 1; i += 1) {
        const here = edgesOf(strips[i]!)
        const next = edgesOf(strips[i + 1]!)
        expect(next.left.x).toBeCloseTo(here.right.x, 2)
        expect(next.left.z).toBeCloseTo(here.right.z, 2)
      }
    }
  })

  it('keeps the hinge nailed to the left edge however far the page turns', () => {
    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      expect(edgesOf(curl(W, progress)[0]!).left.x).toBeCloseTo(0, 3)
      expect(edgesOf(curl(W, progress)[0]!).left.z).toBeCloseTo(0, 3)
    }
  })

  it('lifts the free edge off the screen plane', () => {
    // The Z requirement, stated as the thing it is for: partway through the
    // turn the far end of the sheet is out in front of the page, not on it.
    const mid = curl(W, 0.45)
    expect(edgesOf(mid[mid.length - 1]!).right.z).toBeGreaterThan(40)
  })

  it('bends hardest at the free edge and least at the hinge', () => {
    // The spine requirement: distortion rises with distance from the hinge.
    for (const progress of [0.15, 0.5, 0.85]) {
      let previous = -1
      for (let i = 0; i < STRIPS; i += 1) {
        const angle = bendAt((i + 0.5) / STRIPS, progress)
        expect(angle).toBeGreaterThan(previous)
        previous = angle
      }
      expect(bendAt(1, progress)).toBeGreaterThan(bendAt(0, progress))
    }
  })

  it('carries the free edge over the hinge by the end of the turn', () => {
    // A page that stops at the spine has folded, not turned.
    expect(edgesOf(curl(W, 1)[STRIPS - 1]!).right.x).toBeLessThan(0)
  })

  it('takes a different curve at 20% than at 80%, not the same one scaled', () => {
    // If the exponent were fixed, these two ratios would be identical.
    const early = bendAt(0.25, 0.2) / bendAt(1, 0.2)
    const late = bendAt(0.25, 0.8) / bendAt(1, 0.8)
    expect(late).toBeGreaterThan(early + 0.05)
  })
})

describe('curl — light and shade', () => {
  it('has no shadow at all on a flat page', () => {
    expect(curl(W, 0).every((s) => s.dark === 0)).toBe(true)
    expect(castShadow(W, 0).opacity).toBe(0)
  })

  it('deepens the shadow as the fold steepens', () => {
    const far = STRIPS - 1
    let previous = -1
    for (const progress of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const dark = curl(W, progress)[far]!.dark
      expect(dark).toBeGreaterThan(previous)
      previous = dark
    }
  })

  it('blanks the free edge before the hinge — a fold, not a spinning rectangle', () => {
    const strips = curl(W, 0.6)
    expect(strips[STRIPS - 1]!.blank).toBeGreaterThan(strips[0]!.blank)
    // And every strip is blanker than the one nearer the hinge.
    for (let i = 1; i < STRIPS; i += 1) {
      expect(strips[i]!.blank).toBeGreaterThanOrEqual(strips[i - 1]!.blank)
    }
  })

  it('fades the cast shadow out at both ends and peaks in the middle', () => {
    expect(castShadow(W, 0).opacity).toBe(0)
    expect(castShadow(W, 1).opacity).toBeCloseTo(0, 6)
    expect(castShadow(W, 0.5).opacity).toBeGreaterThan(0.2)
  })

  it('walks the cast shadow leftwards as the fold travels', () => {
    expect(castShadow(W, 0.3).at).toBeGreaterThan(castShadow(W, 0.6).at)
  })
})

describe('curlProgress', () => {
  it('maps a sheet width of travel onto a whole turn', () => {
    expect(curlProgress(0, W)).toBe(0)
    expect(curlProgress(W / 2, W)).toBe(0.5)
    expect(curlProgress(W, W)).toBe(1)
  })

  it('clamps rather than running past either end', () => {
    expect(curlProgress(-90, W)).toBe(0)
    expect(curlProgress(W * 3, W)).toBe(1)
  })

  it('survives a sheet with no width', () => {
    // Before layout, or on a screen the reader has rotated mid-gesture.
    expect(curlProgress(50, 0)).toBe(0)
  })

  it('is exactly linear, so a thumb held still holds the page still', () => {
    // Any smoothing here would let a stationary finger creep, which is the one
    // behaviour the reader named explicitly.
    const a = curlProgress(100, W)
    const b = curlProgress(200, W)
    const c = curlProgress(300, W)
    expect(b - a).toBeCloseTo(c - b, 12)
  })
})

describe('releaseInto', () => {
  it('finishes a turn dragged past halfway', () => {
    expect(releaseInto(COMMIT_AT + 0.01, 0)).toBe('complete')
  })

  it('springs back a turn abandoned short of halfway', () => {
    expect(releaseInto(COMMIT_AT - 0.01, 0)).toBe('back')
  })

  it('lets a flick finish a turn that has barely started', () => {
    expect(releaseInto(0.08, FLICK * 2)).toBe('complete')
  })

  it('lets a flick backwards undo a turn already past the threshold', () => {
    // Velocity beats position in both directions — the thing that makes it feel
    // like an object rather than a slider.
    expect(releaseInto(0.9, -FLICK * 2)).toBe('back')
  })
})

describe('the release curves', () => {
  it('both run from exactly 0 to exactly 1', () => {
    for (const ease of [completionEase, snapBackEase]) {
      expect(ease(0)).toBeCloseTo(0, 12)
      expect(ease(1)).toBeCloseTo(1, 12)
    }
  })

  it('never overshoots — paper settles, it does not wobble', () => {
    for (let t = 0; t <= 1.0001; t += 0.01) {
      expect(snapBackEase(t)).toBeLessThanOrEqual(1 + 1e-9)
      expect(snapBackEase(t)).toBeGreaterThanOrEqual(0)
    }
  })

  it('both rise the whole way, so neither can double back', () => {
    for (const ease of [completionEase, snapBackEase]) {
      let previous = -1
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const value = ease(t)
        expect(value).toBeGreaterThan(previous)
        previous = value
      }
    }
  })

  it('clamps outside its own duration', () => {
    expect(snapBackEase(4)).toBeCloseTo(1, 12)
    expect(completionEase(-2)).toBeCloseTo(0, 12)
  })
})
