/**
 * The arithmetic behind "swipe a sheet down to dismiss it".
 *
 * Kept apart from the sheet itself, because the decision — does this drag
 * dismiss, or does it spring back? — is the whole of the behaviour and is worth
 * testing without a DOM, a pointer, or a component.
 *
 * ## Two ways to close, not one
 *
 * A long slow pull and a short fast flick both mean "go away", and a rule with
 * only a distance in it fails the flick: the reader's thumb leaves the glass
 * after 30px and the sheet springs back in their face. So either a far enough
 * drag or a fast enough one closes it.
 *
 * ## Down only
 *
 * An upward drag is not a dismissal, and a sheet dragged above its resting
 * place looks broken. `offsetFor` clamps at zero, so pulling up does nothing
 * rather than lifting the card off the bottom edge.
 */

/** How far down the sheet must be dragged to dismiss it, in CSS pixels. */
export const DISMISS_DISTANCE = 72

/** How fast a shorter drag must be to dismiss it, in CSS pixels per second. */
export const DISMISS_VELOCITY = 550

/**
 * A drag below this is not a drag at all.
 *
 * The handle is a tap target as well as a grab bar, and a finger never lands
 * and leaves on exactly the same pixel. Without this, a tap on the handle
 * counts as a 2px drag and the sheet twitches.
 */
export const DRAG_SLOP = 4

/** How far the sheet has actually moved, given how far the finger has. */
export function offsetFor(dy: number): number {
  if (dy <= DRAG_SLOP) return 0
  /*
   * Resistance past the dismiss point: the sheet keeps following the finger,
   * but at a third of the speed. It tells the reader the gesture has been
   * understood without letting the card slide off the screen entirely.
   */
  const past = dy - DISMISS_DISTANCE
  return past <= 0 ? dy : DISMISS_DISTANCE + past / 3
}

/**
 * Should letting go here close the sheet?
 *
 * `elapsed` is in milliseconds. A zero or negative elapsed — two pointer events
 * inside the same millisecond — is treated as no velocity rather than infinite
 * velocity, so a stationary finger never dismisses on a divide by zero.
 */
export function dismisses(dy: number, elapsed: number): boolean {
  if (dy <= DRAG_SLOP) return false
  if (dy >= DISMISS_DISTANCE) return true
  const velocity = elapsed > 0 ? (dy / elapsed) * 1000 : 0
  return velocity >= DISMISS_VELOCITY
}
