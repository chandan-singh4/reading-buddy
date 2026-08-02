/**
 * How long a move takes, and how it accelerates — for every move, in one place.
 *
 * ## Why this file exists
 *
 * The reading screen moves in three different technologies. A turn *within* a
 * section is a scroll. A turn *between* sections is two elements crossing. A
 * jump — a link, the contents list, "back to page 250" — is a change of
 * content. Each of those had its own timing, and one of them wasn't even ours:
 * a scroll left to `scroll-behavior: smooth` is timed by the browser, which
 * varies the duration with the distance travelled. So the same gesture took a
 * different length of time depending on which kind of move it happened to be,
 * and the seam showed every time a reader crossed a chapter.
 *
 * Nothing in this module is clever. Its whole job is that there is exactly one
 * `MOVE_MS` and exactly one curve, and that every kind of move is driven from
 * them — including the scroll, which is why `scrollStrip` exists at all rather
 * than a one-line assignment to `scrollLeft`.
 *
 * **If a move ever feels out of step again, the answer is here and only here.**
 */

/**
 * How long any move takes.
 *
 * Set to sit where the browser's own smooth scroll sat, because that is the
 * motion a reader meets most — every page turn inside a chapter — and it is
 * therefore the one everything else has to match rather than the other way
 * round.
 */
export const MOVE_MS = 320

/**
 * The curve, as its four control points.
 *
 * Kept as numbers rather than as a CSS string because both halves need it: the
 * Web Animations API takes the string, and the scroll — which has to be
 * animated by hand, since scrolling isn't a property WAAPI can drive — needs
 * the function itself. Deriving both from one definition is what stops them
 * drifting apart.
 *
 * Quick to leave, slow to settle: the shape of something pushed rather than
 * something switched on.
 */
const CURVE = [0.32, 0.72, 0, 1] as const

/** The same curve in the form CSS and the Web Animations API want. */
export const MOVE_EASING = `cubic-bezier(${CURVE.join(', ')})`

/** Timing options for `Element.animate`, so no caller has to assemble them. */
export const MOVE_TIMING: KeyframeAnimationOptions = {
  duration: MOVE_MS,
  easing: MOVE_EASING,
  fill: 'both',
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

// --- The curve, evaluated -----------------------------------------------------

/** One axis of a cubic Bézier with endpoints pinned at 0 and 1. */
function bezier(t: number, a: number, b: number): number {
  const u = 1 - t
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
}

/**
 * `y` at a given `x` on the curve — what CSS means by an easing function.
 *
 * The curve is defined parametrically, so getting `y` from `x` means finding
 * the parameter that produces that `x` first. Bisection rather than Newton's
 * method: twenty halvings is far more precision than a 320 ms animation can
 * show, it cannot diverge on a curve with a flat region (this one has two), and
 * "cannot fail" is worth more here than "converges in four steps".
 */
export function easeMove(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  let low = 0
  let high = 1
  let t = x

  for (let step = 0; step < 20; step += 1) {
    const at = bezier(t, CURVE[0], CURVE[2])
    if (at < x) low = t
    else high = t
    t = (low + high) / 2
  }

  return bezier(t, CURVE[1], CURVE[3])
}

// --- Moves --------------------------------------------------------------------

/** Stops a move part-way. Safe to call after it has finished. */
export type Cancel = () => void

const noop: Cancel = () => {}

/**
 * Scroll a strip sideways, on our clock rather than the browser's.
 *
 * `scroll-behavior: smooth` would be less code, but its duration is the
 * browser's business and grows with the distance — so a turn onto a wide page
 * took visibly longer than a turn onto a narrow one, and neither matched the
 * turn between two sections. Driving `scrollLeft` frame by frame costs about
 * fifteen lines and makes every page turn in the book the same length.
 *
 * Returns a cancel. A reader turning pages quickly must always be able to
 * outrun a move rather than queue behind it, and a half-finished scroll left
 * running while a second one starts would fight it for the same property.
 */
export function scrollStrip(
  element: HTMLElement,
  left: number,
  options: { instant?: boolean } = {},
): Cancel {
  const from = element.scrollLeft
  const distance = left - from

  if (options.instant || prefersReducedMotion() || distance === 0) {
    element.scrollLeft = left
    return noop
  }

  // No rAF to schedule against — jsdom in a test, or a document that has been
  // put to sleep. The position is what matters; the journey to it is decoration.
  if (typeof window.requestAnimationFrame !== 'function') {
    element.scrollLeft = left
    return noop
  }

  let frame = 0
  let cancelled = false
  const started = performance.now()

  const step = (now: number) => {
    if (cancelled) return

    const elapsed = Math.min(1, (now - started) / MOVE_MS)
    element.scrollLeft = from + distance * easeMove(elapsed)

    if (elapsed < 1) frame = window.requestAnimationFrame(step)
  }

  frame = window.requestAnimationFrame(step)

  return () => {
    cancelled = true
    if (frame !== 0) window.cancelAnimationFrame(frame)
  }
}

/**
 * The arrival of a page you jumped to rather than turned to.
 *
 * A jump has no direction — a footnote is not to the left or the right of the
 * sentence that referred to you to it — so it cannot borrow the turn's slide
 * without claiming something untrue about where the book went. It gets the same
 * *duration* instead, which is what makes a jump and a turn feel like two moves
 * in one app rather than two apps.
 */
export function fadeIn(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return
  if (typeof element.animate !== 'function') return

  element.animate([{ opacity: 0 }, { opacity: 1 }], MOVE_TIMING)
}
