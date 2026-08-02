/**
 * Recognising a horizontal swipe.
 *
 * Split out and kept pure because the *judgement* is the whole difficulty:
 * deciding when a finger's movement counts as a swipe rather than as a scroll,
 * a tap, or a wobble. That judgement is worth testing directly; attaching touch
 * handlers is not.
 */

/** Where a touch began. */
export interface Touch {
  x: number
  y: number
}

export type Swipe = 'left' | 'right' | null

/**
 * Far enough to be meant. Below this a "swipe" is a tap with an unsteady thumb,
 * and turning that into navigation makes an app feel like it moves on its own.
 */
const MIN_DISTANCE = 48

/**
 * How much straighter than vertical it has to be. A finger arcs, so demanding a
 * purely horizontal path rejects most real swipes; but without any test at all
 * a scroll that drifts sideways would flip the page. 1.5 means "clearly more
 * across than down".
 */
const STRAIGHTNESS = 1.5

/**
 * Which way the finger went, or `null` if it wasn't a swipe.
 *
 * "Left" means the finger travelled leftwards — which is the gesture for
 * *forward*, the same as pushing a page aside.
 */
export function swipeOf(from: Touch, to: Touch): Swipe {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (Math.abs(dx) < MIN_DISTANCE) return null
  if (Math.abs(dx) < Math.abs(dy) * STRAIGHTNESS) return null

  return dx < 0 ? 'left' : 'right'
}

/**
 * Step through a list of choices, stopping at the ends.
 *
 * Deliberately not a cycle. Tabs are laid out in a row and a swipe is a spatial
 * gesture, so wrapping from the last back to the first contradicts what the eye
 * just saw — the row visibly does not loop.
 */
export function stepThrough<T>(items: readonly T[], current: T, swipe: Swipe): T {
  if (!swipe) return current

  const index = items.indexOf(current)
  if (index === -1) return current

  const next = swipe === 'left' ? index + 1 : index - 1
  return items[next] ?? current
}
