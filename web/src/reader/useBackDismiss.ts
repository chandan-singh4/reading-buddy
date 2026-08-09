/**
 * Make a back gesture close what is over the page instead of leaving the page.
 *
 * The problem this solves, found on a real phone: with the contents sheet open,
 * swiping back — the natural "I'm done with this" gesture — threw the reader
 * out of the book and onto the shelf. The sheet is not a page as far as the
 * browser is concerned, so Back skipped straight past it.
 *
 * Reported again 2026-08-09 with the *toolbar* in that role: raising it shrinks
 * the page, which is plainly a state to come back out of, and Back left the
 * book instead of undoing it. Anything drawn over the page is a layer, and the
 * toolbar was the one layer never wired to this.
 *
 * It cannot be fixed by refusing the gesture. In an installed app on iOS the
 * back swipe belongs to the system and no amount of CSS or `preventDefault`
 * touches it. So the fix is the other way round: while the panel is open there
 * is an extra history entry for Back to consume, and consuming it closes the
 * panel. Which is also exactly how Android's back button is expected to behave.
 */

import { useEffect, useRef } from 'react'

/** Marks the history entry as ours, so we only ever remove our own. */
const LAYER = 'reading-buddy-layer'

/**
 * `onDismiss` peels the topmost layer and says whether another is still there.
 *
 * Returning `true` re-arms the gesture, so Back peels one layer at a time —
 * closing the contents sheet leaves the toolbar up, and it takes another Back
 * to put that away. Returning `false` (or nothing) means the page is bare
 * again and the next Back belongs to the book.
 */
export function useBackDismiss(open: boolean, onDismiss: () => boolean | void): void {
  // Held in a ref so the effect below depends on `open` alone. If it depended
  // on the callback, a handler that changes identity when a layer opens would
  // tear the entry down and build it again — and the teardown's `history.back()`
  // is *asynchronous*, so the queued traversal can land after the new
  // `pushState`, undoing it and firing a `popstate` that closes the layer just
  // opened. The callback is always read fresh, so nothing is lost by it.
  const handler = useRef(onDismiss)
  handler.current = onDismiss

  useEffect(() => {
    if (!open) return

    window.history.pushState({ [LAYER]: true }, '')

    const onPopState = () => {
      // Re-armed here, inside the handler, rather than by letting the effect
      // re-run: this `pushState` is synchronous and immediately replaces the
      // entry the gesture just consumed. Going back out to the effect would
      // mean the asynchronous `history.back()` above, and the race it brings.
      if (handler.current() === true) window.history.pushState({ [LAYER]: true }, '')
    }

    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)

      // Closed by a tap rather than by Back, so the entry pushed above is still
      // on the stack. Left there, the reader's *next* Back would be swallowed
      // doing nothing visible — a dead gesture, which feels worse than the bug
      // this fixes.
      //
      // Guarded on the entry still being ours: if the reader left for the
      // library while the sheet was open, the top of the stack is that
      // navigation, and going back would undo it and drag them into the book
      // they just left.
      if (window.history.state?.[LAYER] === true) window.history.back()
    }
  }, [open])
}
