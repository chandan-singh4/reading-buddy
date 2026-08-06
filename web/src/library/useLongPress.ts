/**
 * Press and hold to start selecting.
 *
 * Written against pointer events rather than touch events so one code path
 * covers a finger, a mouse and a stylus — the library is a phone screen first
 * but it is also the screen most likely to be used on a laptop, and two
 * near-identical handlers is how the two quietly drift apart.
 *
 * Three things make the difference between this feeling like a gesture and
 * feeling like a bug:
 *
 *   - **A scroll is not a press.** A finger resting on a book while the list
 *     moves under it must not select anything, so any movement past
 *     `SLOP_PX` cancels. Without this, flicking through a long shelf selects
 *     books at random.
 *   - **The tap that follows is swallowed.** The browser still fires `click`
 *     after a long press ends, and the thing underneath is a link to the book —
 *     so holding a book to select it would also open it. `suppressClick`
 *     catches exactly one click and then forgets.
 *   - **The context menu is suppressed while holding.** On Android a long press
 *     on a link raises the browser's own "open in new tab" sheet over the top
 *     of ours.
 */

import { useCallback, useEffect, useRef } from 'react'

/** How long a press has to last. Matches Android's own long-press timing. */
const HOLD_MS = 500

/** How far a finger may drift and still count as held rather than scrolling. */
const SLOP_PX = 10

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onContextMenu: (event: React.MouseEvent) => void
  onClickCapture: (event: React.MouseEvent) => void
}

export function useLongPress(onLongPress: () => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const origin = useRef<{ x: number; y: number } | undefined>(undefined)
  const fired = useRef(false)

  const clear = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
    origin.current = undefined
  }, [])

  // A component unmounting mid-press — which is exactly what happens when the
  // press deletes the book — must not leave a timer holding a stale callback.
  useEffect(() => clear, [clear])

  return {
    onPointerDown(event) {
      // Secondary buttons are a right-click, which has its own menu.
      if (event.button !== 0) return
      fired.current = false
      origin.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => {
        fired.current = true
        clear()
        onLongPress()
      }, HOLD_MS)
    },

    onPointerMove(event) {
      const start = origin.current
      if (!start) return
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      if (moved > SLOP_PX) clear()
    },

    onPointerUp: clear,
    onPointerCancel: clear,

    onContextMenu(event) {
      // Only while a press is actually in flight, so a right-click on a book
      // when nothing is being held still behaves normally.
      if (timer.current !== undefined || fired.current) event.preventDefault()
    },

    onClickCapture(event) {
      if (!fired.current) return
      fired.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }
}
