/**
 * Swiping left and right between the four main screens.
 *
 * Home ↔ Library ↔ Stats ↔ Settings, in that order, with the ends deliberately
 * *not* wrapping: a list that loops has no edges, and an edge is how a reader
 * learns where they are. Swiping left from Settings does nothing, which is the
 * honest answer to "is there more over there".
 *
 * The drawer stays the other way in, and the two cannot disagree — both do the
 * same thing, which is navigate. There is no page index held anywhere; the URL
 * is the state, and this hook only ever reads it and calls `navigate`.
 *
 * ## What a swipe does to the history
 *
 * One entry for the whole level: the first move onto it pushes, every move made
 * while already on it replaces. So Back goes back exactly one step, always. The
 * reasoning — and the two obvious answers that are both wrong — is in
 * `tabHistory.ts`, which the drawer goes through too.
 *
 * ## The two things that stop this working on a real phone
 *
 * **`pointerup` does not arrive.** As soon as a browser decides a touch is a
 * pan it takes the gesture over and fires `pointercancel` instead — after five
 * or ten pixels, nowhere near the distance that counts as a swipe. A first
 * version of this hook measured the distance at `pointerup` and so measured
 * nothing at all: it worked under test, where events are synthesised and
 * nothing is ever cancelled, and did nothing whatsoever on a phone. The
 * movement is therefore tracked on every `pointermove` and judged on whichever
 * of `pointerup` / `pointercancel` actually arrives.
 *
 * **The browser claims horizontal pans by default.** `touch-action: auto` means
 * "I may pan this in either direction", so a horizontal drag is the browser's
 * to handle — which is what triggers the cancel above. `.content` in
 * `AppShell.module.css` declares `touch-action: pan-y pinch-zoom`: vertical
 * scrolling and zooming stay the browser's, horizontal movement is ours. The
 * reading screen needed the mirror image of this (`pan-x`) for the same reason.
 *
 * ## Why not a CSS scroll-snap carousel
 *
 * It would animate for free, but it would also mount all four screens at once —
 * the library builds cover thumbnails and Stats reads every position, so three
 * screens nobody is looking at would do their work on every visit. This keeps
 * one screen mounted and pays for the transition in CSS instead.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

import { useTabNavigate } from './tabHistory.ts'

/** The order a swipe moves through. Left goes down this list, right goes up. */
export const PAGE_ORDER: readonly string[] = ['/', '/library', '/stats', '/settings']

/** How far a finger must travel horizontally to count as a swipe. */
const DISTANCE_PX = 60

/**
 * How much more horizontal than vertical the movement must be.
 *
 * A finger arcs. Without this, scrolling a long shelf with a slightly curved
 * flick navigates away from it — the same class of bug as the reading screen
 * bobbing mid-turn, and the same fix: decide what a gesture *is* before acting
 * on it.
 */
const RATIO = 1.6

interface Gesture {
  id: number
  startX: number
  startY: number
  /** Where the finger was last seen. The only reliable reading — see above. */
  lastX: number
  lastY: number
}

export function useSwipeNav(): void {
  const navigate = useTabNavigate()
  const location = useLocation()
  const gesture = useRef<Gesture | undefined>(undefined)

  useEffect(() => {
    const index = PAGE_ORDER.indexOf(location.pathname)
    // Not one of the four — a book, or a route that doesn't exist. Nothing to
    // swipe between, and guessing would strand the reader somewhere arbitrary.
    if (index === -1) return

    function onPointerDown(event: PointerEvent) {
      // Touch and pen only. A mouse drag across a page is a text selection, and
      // hijacking it would make the library impossible to select text on.
      if (event.pointerType === 'mouse') return

      // A drag inside a drawer, sheet or dialog belongs to that thing, not to
      // the page behind it. Marked with `data-no-swipe` at the source rather
      // than listed here, so a new panel opts out by saying so itself.
      const target = event.target
      if (target instanceof Element && target.closest('[data-no-swipe]')) return

      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
      }
    }

    function onPointerMove(event: PointerEvent) {
      const current = gesture.current
      if (!current || current.id !== event.pointerId) return
      current.lastX = event.clientX
      current.lastY = event.clientY
    }

    /**
     * Judge the gesture. Bound to both `pointerup` and `pointercancel`: a
     * cancel is not a failure here, it is simply the browser telling us it has
     * taken over, and by then the finger has already said which way it went.
     */
    function onPointerEnd(event: PointerEvent) {
      const current = gesture.current
      gesture.current = undefined
      if (!current || current.id !== event.pointerId) return

      const dx = current.lastX - current.startX
      const dy = current.lastY - current.startY
      if (Math.abs(dx) < DISTANCE_PX) return
      if (Math.abs(dx) < Math.abs(dy) * RATIO) return

      // Swiping left (a negative dx) moves *forward* through the list — the
      // content follows the finger, the way a page of a book does.
      const target = index + (dx < 0 ? 1 : -1)
      if (target < 0 || target >= PAGE_ORDER.length) return

      // Through `tabHistory`, which decides push-or-replace so that the whole
      // level costs one history entry rather than one per swipe — or none.
      navigate(PAGE_ORDER[target]!)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerEnd)
    document.addEventListener('pointercancel', onPointerEnd)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerEnd)
      document.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [location.pathname, navigate])
}
