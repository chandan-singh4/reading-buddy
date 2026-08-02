/**
 * Make a back gesture close an open panel instead of leaving the page.
 *
 * The problem this solves, found on a real phone: with the contents sheet open,
 * swiping back — the natural "I'm done with this" gesture — threw the reader
 * out of the book and onto the shelf. The sheet is not a page as far as the
 * browser is concerned, so Back skipped straight past it.
 *
 * It cannot be fixed by refusing the gesture. In an installed app on iOS the
 * back swipe belongs to the system and no amount of CSS or `preventDefault`
 * touches it. So the fix is the other way round: while the panel is open there
 * is an extra history entry for Back to consume, and consuming it closes the
 * panel. Which is also exactly how Android's back button is expected to behave.
 */

import { useEffect } from 'react'

/** Marks the history entry as ours, so we only ever remove our own. */
const LAYER = 'reading-buddy-layer'

export function useBackDismiss(open: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return

    window.history.pushState({ [LAYER]: true }, '')

    const onPopState = () => {
      onDismiss()
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
  }, [open, onDismiss])
}
