/**
 * How dark the paper is, and the sums behind the gesture that sets it.
 *
 * ## Why a gesture and not a slider
 *
 * The phone's own brightness control is the wrong tool at night: it dims the
 * whole device, it lives behind a shade you have to pull down, and it is a
 * number. What a reader wants is the light on *this page* turned down, without
 * leaving the page and without deciding on a value.
 *
 * So there is no control to find. The right-hand block of paper — the deck that
 * already tells you how much book is left — takes a finger dragged up and down.
 * Up is darker, the way turning a lamp down is a downward motion of light; down
 * is lighter. Nothing is drawn for it, and nothing appears while you do it
 * except the page itself changing.
 *
 * ## Why the reachable zone is wider than the deck
 *
 * The deck's channel is `--page-deck`, which is 11 px. That is a fine thing to
 * *see* and an impossible thing to hit. `DIM_ZONE` is the band along the right
 * edge that listens, and it is sized for a thumb, not for the drawing.
 */

/**
 * The darkest the page goes.
 *
 * Not 1. A veil at full strength is a black screen with a book somewhere
 * behind it, and a reader who dragged too far in the dark would have no way of
 * telling a dimmed page from a broken app. This leaves the text legible in an
 * unlit room and no darker.
 */
export const MAX_DIM = 0.72

/** The band along the right edge that answers the gesture, in CSS pixels. */
export const DIM_ZONE = 44

/**
 * How far a finger moves before the gesture is the brightness one.
 *
 * Larger than the page turn's own eight pixels, deliberately. The zone sits
 * where a thumb rests, and the cost of being wrong is not symmetrical: a page
 * turn that needs a second try is a shrug, a page that goes dark under a
 * resting thumb is the app misbehaving.
 */
export const DIM_FROM = 14

/**
 * The share of the screen's height that covers the whole range.
 *
 * Less than the full height, so the darkest setting is reachable without
 * starting at the very top of the screen — and the finger does not have to
 * travel the length of the phone to make a small change either, because the
 * gesture is continuous and can be repeated.
 */
export const DIM_TRAVEL = 0.55


/** Hold a value inside the range the setting is allowed to take. */
export function clampDim(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_DIM, Math.max(0, value))
}

/**
 * The new darkness after a drag.
 *
 * `up` is how far the finger has travelled upwards from where the gesture was
 * claimed, in CSS pixels — negative when it has gone down. `height` is the
 * screen's height, so the same stroke does the same thing on a small phone and
 * on a tablet.
 *
 * Reckoned from `start` and the *whole* travel rather than accumulated move by
 * move: a finger that goes up, changes its mind and comes back down again ends
 * exactly where it began, which is what a physical control does.
 */
export function dimAfterDrag(start: number, up: number, height: number): number {
  if (height <= 0) return clampDim(start)
  return clampDim(start + (up / (height * DIM_TRAVEL)) * MAX_DIM)
}

/** Whether a touch at `x` is on the deck's band, given the screen's width. */
export function inDimZone(x: number, width: number): boolean {
  return width - x <= DIM_ZONE
}
