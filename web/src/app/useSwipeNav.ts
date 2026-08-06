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
 * **Why pointer events and not a CSS scroll-snap carousel.** A carousel would
 * animate for free, but it would also mount all four screens at once — the
 * library builds cover thumbnails and Stats reads every position, so three
 * screens nobody is looking at would do their work on every visit. This keeps
 * one screen mounted and pays for the transition in CSS instead.
 */

import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

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

export function useSwipeNav(): void {
  const navigate = useNavigate()
  const location = useLocation()
  const start = useRef<{ x: number; y: number; id: number } | undefined>(undefined)

  useEffect(() => {
    const index = PAGE_ORDER.indexOf(location.pathname)
    // Not one of the four — a book, or a route that doesn't exist. Nothing to
    // swipe between, and guessing would strand the reader somewhere arbitrary.
    if (index === -1) return

    function onPointerDown(event: PointerEvent) {
      // Touch and pen only. A mouse drag across a page is a text selection, and
      // hijacking it would make the library impossible to select text on.
      if (event.pointerType === 'mouse') return
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }

    function onPointerUp(event: PointerEvent) {
      const from = start.current
      start.current = undefined
      if (!from || from.id !== event.pointerId) return

      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < DISTANCE_PX) return
      if (Math.abs(dx) < Math.abs(dy) * RATIO) return

      // Swiping left (a negative dx) moves *forward* through the list — the
      // content follows the finger, the way a page of a book does.
      const target = index + (dx < 0 ? 1 : -1)
      if (target < 0 || target >= PAGE_ORDER.length) return

      navigate(PAGE_ORDER[target]!)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
    }
  }, [location.pathname, navigate])
}
