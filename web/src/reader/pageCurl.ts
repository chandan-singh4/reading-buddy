/**
 * The shape of a page being turned by a finger.
 *
 * ## Why this file has no DOM in it
 *
 * Everything here is arithmetic: given how far the thumb has travelled, where
 * does each part of the sheet sit in space, and how dark is it? Keeping that
 * apart from the elements it will eventually be written onto buys two things.
 * The obvious one is that it can be tested — jsdom has no layout, no columns and
 * no compositor, so it can never prove the *gesture*, but it can prove the
 * numbers the gesture produces. The less obvious one is that the shape can be
 * tuned by reading this file alone, which is the thing that will actually happen
 * once the reader has it under a thumb.
 *
 * ## Why strips
 *
 * A real page turn is a bend, and a bend wants a mesh — a grid of vertices each
 * moved somewhere slightly different. The browser has no mesh warp for live DOM
 * text; `rotate3d` moves whole flat rectangles and nothing else. So the sheet is
 * cut into a small number of vertical strips and each strip is given its own
 * rigid transform. That is the same deformation evaluated per strip instead of
 * per vertex, and at sixteen strips on a phone the seams are below the width of
 * a hairline.
 *
 * The one thing that makes or breaks it is that the strips must join *exactly*.
 * A strip's left edge is placed where the previous strip's right edge landed —
 * computed, not assumed — so the sheet can bend as hard as it likes and never
 * shows daylight through itself. See `curl`.
 */

/**
 * How many strips the sheet is cut into.
 *
 * Sixteen is where the seams stop being visible at arm's length on a phone;
 * below about ten the bend reads as a folding screen. It is not free — every
 * strip is a copy of the page's DOM — which is why this is a constant to be
 * lowered if a cheap device ever struggles, rather than a number to raise.
 *
 * A phone did struggle, and this is that lowering. Measured there, building the
 * sheets cost about 75 ms of every turn, which is over four frames of a finger
 * waiting before the page could move. The cost is a straight multiple of this
 * number. Twelve keeps a clear margin over the ten where the bend goes wrong,
 * and gives back a quarter of the build.
 */
export const STRIPS = 12

/**
 * How far the eye is from the page, in pixels. Shallower reads as a pop-up book.
 * The same value the fixed animation has always used, kept so a dragged turn and
 * a tapped one are the same object seen the same way.
 */
export const PERSPECTIVE = 1600

/**
 * How much of the sheet's tilt is rigid rather than curl.
 *
 * A page hinged in a binding does two things at once: the whole sheet swings
 * about the spine, *and* the far end curls back further than the near end. `A`
 * is the split. At 1 the sheet is a flat board pivoting — honest, and it reads
 * like a cupboard door. At 0 nothing swings and the sheet unrolls like a scroll.
 * 0.55 is a sheet of paper.
 */
const RIGID = 0.55

/**
 * How sharply the curl concentrates at the free edge, as a function of progress.
 *
 * This is the part that makes the gesture feel like paper rather than like an
 * animation. Early in a drag a real page lifts at the corner you are pulling and
 * barely moves near the spine — a high exponent. By the time it is folded over,
 * the bend has evened out along its whole length — an exponent of 1. So the
 * exponent falls as the turn proceeds, and the shape you see at 20% is a
 * genuinely different curve from the shape at 80%, not the same curve scaled.
 */
function curlExponent(progress: number): number {
  return 1 + 1.4 * (1 - progress)
}

/** How dark the fold gets at its steepest. Above about 0.5 it reads as soot. */
const SHADOW = 0.42

/** The angle at which a strip has turned far enough to be showing its back. */
const BACK_FROM = (70 * Math.PI) / 180

/** And the angle by which the back is all you can see. */
const BACK_BY = (95 * Math.PI) / 180

/** One vertical slice of the turning sheet. */
export interface Strip {
  /** Where this strip starts on the flat, unturned page, in px from the hinge. */
  offset: number
  /** Its width in px. Every strip has the same one; carried so callers needn't divide. */
  width: number
  /** The CSS `transform` that puts it where it belongs in space. */
  transform: string
  /**
   * How much of the blank back of the page is showing, 0 to 1.
   *
   * Per strip and not per sheet, which is the whole reason this looks like a
   * fold: the free edge passes edge-on long before the hinge does, so the sheet
   * goes blank progressively from the outside in, exactly as paper does.
   */
  blank: number
  /**
   * The shadow on this strip, 0 to 1.
   *
   * Derived from the strip's own angle, so it is **zero at a flat page by
   * construction** rather than by a guard someone can later delete: at an angle
   * of nothing, `1 - cos 0` is nothing.
   */
  dark: number
}

/** Keep a number inside a range without importing anything to do it. */
function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

/**
 * The angle the sheet has bent to at a given point along its length.
 *
 * `along` is 0 at the hinge and 1 at the free edge. The result is in radians and
 * rises monotonically with both arguments, which is what guarantees the sheet
 * never doubles back through itself.
 */
export function bendAt(along: number, progress: number): number {
  const total = Math.PI * clamp(progress, 0, 1)
  const shape = RIGID + (1 - RIGID) * Math.pow(clamp(along, 0, 1), curlExponent(progress))
  return total * shape
}

/**
 * The whole sheet, as a list of strips ready to be written onto elements.
 *
 * `width` is the sheet's width in CSS pixels **before any scaling** — the
 * reading page is drawn at `--page-scale` while the toolbar is up, and a scaled
 * rectangle measures scaled. Hand in the real width or every strip lands at the
 * wrong pitch and the sheet tears along its own seams.
 *
 * ## The cumulative sum is the point
 *
 * Each strip is a flat quad. Bending the sheet shortens its shadow on the
 * screen — a curled page covers less width than a flat one — and the amount it
 * shortens by depends on every strip before it. So the position of strip *i* is
 * not a formula in *i*; it is the running total of where all its predecessors
 * ended up:
 *
 * ```
 * x₀ = 0,  z₀ = 0
 * xᵢ₊₁ = xᵢ + w·cos θᵢ
 * zᵢ₊₁ = zᵢ + w·sin θᵢ
 * ```
 *
 * Because the next strip starts at the previous one's computed end, the joins
 * are exact at any bend. Any closed-form shortcut here — placing strip *i* at
 * `i·w·cos θᵢ`, say — leaves visible gaps the moment the curve is not uniform,
 * which is precisely the case this shape is built to produce.
 *
 * The hinge never moves: `x₀` is zero whatever the progress, so the sheet stays
 * attached to the left edge of the screen and only its free end travels.
 */
export function curl(width: number, progress: number, strips = STRIPS): Strip[] {
  const held = clamp(progress, 0, 1)
  const step = width / strips
  const out: Strip[] = []

  let x = 0
  let z = 0

  for (let i = 0; i < strips; i += 1) {
    // Sampled at the strip's middle rather than its leading edge. A flat quad
    // spanning a bend is closest to the true curve when it is tangent halfway
    // along, and the error is then split either side instead of accumulating.
    const angle = bendAt((i + 0.5) / strips, held)
    const offset = i * step

    out.push({
      offset,
      width: step,
      // `translate3d` first so it is applied in the parent's space, then the
      // rotation about the strip's own left edge (`transform-origin: 0% 50%`).
      // The `- offset` cancels the strip's static CSS `left`, so the arithmetic
      // above can be written in one clean coordinate system: distance from the
      // hinge.
      transform: `translate3d(${(x - offset).toFixed(3)}px, 0, ${z.toFixed(3)}px) rotateY(${(
        (-angle * 180) /
        Math.PI
      ).toFixed(3)}deg)`,
      blank: clamp((angle - BACK_FROM) / (BACK_BY - BACK_FROM), 0, 1),
      dark: (SHADOW * (1 - Math.cos(angle))) / 2,
    })

    x += step * Math.cos(angle)
    z += step * Math.sin(angle)
  }

  return out
}

/**
 * The shadow the lifted sheet throws onto the page underneath it.
 *
 * Separate from the per-strip shading, because it is a different physical
 * thing: that is the sheet shading *itself*, this is light the sheet is keeping
 * off the page below. It follows the fold across the screen and dies at both
 * ends — nothing is lifted at 0, and by 1 the sheet is off the screen and has
 * nothing left to cast onto.
 */
export function castShadow(width: number, progress: number): { at: number; opacity: number } {
  const held = clamp(progress, 0, 1)
  let x = 0
  const step = width / STRIPS
  for (let i = 0; i < STRIPS; i += 1) x += step * Math.cos(bendAt((i + 0.5) / STRIPS, held))
  return { at: Math.max(x, 0), opacity: 0.28 * Math.sin(Math.PI * held) }
}

/**
 * How far through the turn the thumb has dragged.
 *
 * Not `progressOf` — that name is taken elsewhere in `reader/` for how far
 * through a *book* the reader is, which is a different question with the same
 * shape of answer, and the two must never be confused at a call site.
 *
 * `travel` is positive in the direction of the turn — leftwards for a forward
 * turn, rightwards for a backward one — so both directions share one number and
 * one shape. A full sheet width is a full turn; there is no acceleration, no
 * smoothing and no easing on the way in, because the requirement is that a thumb
 * held still leaves the page held still, and any filter at all would let it
 * creep.
 */
export function curlProgress(travel: number, width: number): number {
  return width > 0 ? clamp(travel / width, 0, 1) : 0
}

/** Past here on release, the turn finishes rather than springing back. */
export const COMMIT_AT = 0.5

/**
 * Fast enough that the reader clearly meant it, in px/ms.
 *
 * A flick is a real gesture and it barely moves the page — someone turning
 * pages quickly should not have to drag each one half a screen. 0.5 px/ms is
 * about a third of a screen per second, which is faster than a drag and slower
 * than a fumble.
 */
export const FLICK = 0.5

/**
 * What to do when the finger comes off.
 *
 * Velocity wins over position in both directions, which is the part that makes
 * it feel like an object rather than a slider: a page dragged past halfway and
 * then thrown *back* should go back, even though it is on the far side of the
 * threshold.
 */
export function releaseInto(progress: number, velocity: number): 'complete' | 'back' {
  if (velocity > FLICK) return 'complete'
  if (velocity < -FLICK) return 'back'
  return progress > COMMIT_AT ? 'complete' : 'back'
}

/** How long the remainder of a committed turn takes, in ms. */
export const COMPLETE_MS = 260

/** And a snap-back, which is quicker — the page is going nowhere. */
export const SNAP_MS = 220

/** Ease-out cubic: leaves at speed, arrives without a bump. */
export function completionEase(t: number): number {
  const held = clamp(t, 0, 1)
  return 1 - Math.pow(1 - held, 3)
}

/** The stiffness of the snap-back, as a multiple of its duration. */
const OMEGA = 8

/** `1 - (1 + ωt)e^{-ωt}` at t = 1, so the curve can be normalised to land on 1. */
const OMEGA_TAIL = 1 - (1 + OMEGA) * Math.exp(-OMEGA)

/**
 * A critically damped spring, 0 to 1, with **no overshoot**.
 *
 * Underdamping is the usual choice for a snap-back and it is wrong here. A
 * bouncing page is a rubber page: paper released against a binding settles, it
 * does not wobble past flat and come back. Critical damping is the fastest
 * approach that never crosses its target, which is exactly that behaviour.
 *
 * The raw curve only reaches 1 at infinity, so it is divided by its own value at
 * the end of the duration. Without that the page settles a fraction of a per
 * cent short of flat and stays there — invisible in a screenshot, and a sheet
 * that never quite lies down.
 */
export function snapBackEase(t: number): number {
  const held = clamp(t, 0, 1)
  return (1 - (1 + OMEGA * held) * Math.exp(-OMEGA * held)) / OMEGA_TAIL
}
