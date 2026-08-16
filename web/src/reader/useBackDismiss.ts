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
 * touches it. So the fix is the other way round: while a layer is open there is
 * an extra history entry for Back to consume, and consuming it closes the layer.
 * Which is also exactly how Android's back button is expected to behave.
 *
 * ## One entry per layer, each pushed by the tap that opened it
 *
 * Reported a third time, 2026-08-16: from the contents page the first swipe
 * closed it correctly, and the second swipe — which should have put the toolbar
 * away — left the app instead.
 *
 * This hook used to keep a *single* entry and re-arm it from inside its own
 * `popstate` handler, pushing a replacement the moment the gesture consumed one.
 * Every test passed, in jsdom, because jsdom has no opinion about it. Chrome on
 * Android does: an entry pushed in response to a back navigation, with no fresh
 * user gesture behind it, is the signature of a page trying to trap the reader,
 * and the browser's history-manipulation intervention *skips* such entries on
 * the next Back. So the second gesture sailed past the re-armed entry and landed
 * on the book. The bug was invisible from the code and unreachable by tests —
 * only the phone could show it.
 *
 * So nothing is pushed during `popstate` any more. The hook is told how many
 * layers are open and keeps exactly that many entries, adding one as each layer
 * opens. Opening a layer is a tap, so every push has a user gesture behind it
 * and no browser has reason to distrust it.
 */

import { useEffect, useRef } from 'react'

/** Marks the history entry as ours, so we only ever remove our own. */
const LAYER = 'reading-buddy-layer'

/**
 * `depth` is how many layers are open — 0 when the page is bare. `onDismiss` is
 * asked to close the topmost one, and nothing else: this hook has already
 * accounted for the entry the gesture consumed by the time it calls.
 */
export function useBackDismiss(depth: number, onDismiss: () => void): void {
  // Read fresh on every gesture, so the effects below can depend on `depth`
  // alone. A handler that changes identity whenever a layer opens would
  // otherwise tear the entries down and rebuild them.
  const handler = useRef(onDismiss)
  handler.current = onDismiss

  /** How many entries of ours are on the stack. */
  const armed = useRef(0)

  /**
   * Traversals we asked for ourselves, and whose `popstate` must not be read as
   * the reader's gesture. Closing a panel by tapping its X removes an entry with
   * `history.go`, which fires `popstate` exactly like a back swipe does — and
   * answering that by closing another layer would shut the whole screen from one
   * tap.
   */
  const ours = useRef(0)

  useEffect(() => {
    const onPopState = () => {
      if (ours.current > 0) {
        ours.current -= 1
        return
      }
      if (armed.current === 0) return

      // The browser has already taken the entry. Account for it before asking
      // for the layer to close, so the effect below sees a matching count and
      // does not try to add one back.
      armed.current -= 1
      handler.current()
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (depth > armed.current) {
      // Inside the tap that opened the layer, which is what keeps these entries
      // trusted. One per layer, so each gesture peels exactly one.
      for (let i = armed.current; i < depth; i += 1) {
        window.history.pushState({ [LAYER]: true }, '')
      }
      armed.current = depth
      return
    }

    if (depth < armed.current) {
      // Closed by a tap rather than by Back, so our entries are still on the
      // stack. Left there, the reader's next gestures would be swallowed doing
      // nothing visible — a dead gesture, which feels worse than the bug this
      // hook exists to fix.
      //
      // Guarded on the top entry still being ours: if the reader left for the
      // library while a panel was open, the top of the stack is that navigation,
      // and going back would undo it and drag them into the book they just left.
      const extra = armed.current - depth
      armed.current = depth
      if (window.history.state?.[LAYER] !== true) return

      ours.current += extra
      window.history.go(-extra)
    }
  }, [depth])
}
