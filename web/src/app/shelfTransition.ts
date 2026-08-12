/**
 * A book changing shelf, or changing place on one, without its cover blinking.
 *
 * ## What was actually wrong
 *
 * Read a book and close it, and its status changes — so it moves. On Home it
 * moves from the Unread row into the Current Reading hero; in the Library, under
 * "Recently opened", it moves to the front of the list. Both looked like the
 * page reloading, and neither was.
 *
 * Two separate causes, and it matters that they are separate because only one of
 * them is fixable by React:
 *
 * 1. **On Home, the cover is genuinely destroyed and rebuilt.** The Unread row
 *    and the Current Reading hero are different DOM parents, and a React `key`
 *    is only unique among *siblings* — there is no key you can write that
 *    carries an element from one parent to another. So the `<img>` is torn down
 *    and a brand-new one is created in the hero slot, at a different size, and
 *    the browser has to lay out and paint it from scratch.
 *
 * 2. **In the Library, the cover survives but teleports.** One `<ul>`, stable
 *    keys, so React moves the existing `<li>` — no remount, no re-fetch. It
 *    simply arrives at its new position in a single frame with nothing
 *    connecting where it was to where it is.
 *
 * No amount of memoising touches either one. The first is not a re-render at
 * all, and the second is already as cheap as a re-render gets.
 *
 * ## Why a view transition is the fix rather than a cover-up
 *
 * "The same thing is now somewhere else" is precisely what the View Transition
 * API is for. The browser photographs each named element where it *was*, lets
 * React make whatever change it likes — including destroying and rebuilding it —
 * and then animates the old picture to the new one's position and size.
 *
 * That is why it fixes cause 1, which nothing on the React side can: React is
 * allowed to remount the cover, because the thing the reader is watching for
 * those 300 ms is a photograph, not the element. The cover appears to travel
 * from the row into the hero because that is exactly what the browser is drawing.
 *
 * The app already uses this API for opening and closing a book
 * (`routeTransition.tsx`, `styles/transitions.css`). This is the same mechanism
 * one scale down: whole screens there, single covers here.
 *
 * ## Why the names go on and come off again
 *
 * A `view-transition-name` is not free and not local. Any element carrying one
 * is *lifted out of the root snapshot* and animated as its own layer — so if the
 * covers wore their names permanently, opening a book would no longer scale the
 * shelf as one picture around the tapped card (`shelfLeaves` in
 * `transitions.css`); every cover would break away and animate separately, which
 * would wreck the one transition this app already had right.
 *
 * So the names exist only for the length of a shelf move. `Cover` subscribes to
 * the flag below, the flag is raised *before* the browser takes its picture and
 * lowered when the crossing ends, and at every other moment a cover is an
 * ordinary `<img>` with no view-transition behaviour at all.
 *
 * ## Adding a screen later
 *
 * Nothing here is per-page. Any screen that renders `Cover` with a `bookId` gets
 * this, and any screen that reorders books calls `moveBooks` around the state
 * update that does it. Stats will show covers soon; it needs neither a copy of
 * this reasoning nor a line of new plumbing.
 */

import { flushSync } from 'react-dom'

import { afterRouteMove, canTransition } from './routeTransition.tsx'
import type { BookId } from '../structure/index.ts'

interface Transitions {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

/** Attribute on `<html>` while a shelf move runs, for the stylesheet to read. */
const MOVING_ATTRIBUTE = 'data-shelf-move'

/**
 * A book's id as a CSS custom identifier.
 *
 * Ids come from hashing a file, so they are already tame — but a
 * `view-transition-name` is a custom-ident, not a string, and one stray
 * character makes the whole declaration invalid and silently drops the book out
 * of the animation. Cheaper to sanitise than to debug the one book that doesn't
 * glide.
 */
export function coverName(bookId: BookId): string {
  return `book-${bookId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

// --- The flag every Cover watches --------------------------------------------

let naming = false
const watchers = new Set<() => void>()

/** Whether covers should be carrying their view-transition names right now. */
export function coversAreNamed(): boolean {
  return naming
}

/** Never, on the server and under test — see `Cover`'s `useSyncExternalStore`. */
export function coversAreNeverNamed(): boolean {
  return false
}

export function watchCoverNaming(notify: () => void): () => void {
  watchers.add(notify)
  return () => {
    watchers.delete(notify)
  }
}

function setNaming(value: boolean): void {
  if (naming === value) return
  naming = value
  for (const notify of watchers) notify()
}

// --- The move -----------------------------------------------------------------

/**
 * Apply a state change that moves books about, as a crossing rather than a cut.
 *
 * Falls straight through to `update()` where there is no View Transition API
 * (Firefox, older Safari, jsdom) or where the reader has asked for less
 * movement. The fallback is today's behaviour, not a broken one.
 *
 * Never rejects and never leaves the flag raised: an abandoned transition —
 * a second one starting on top, the tab going to the background — still runs
 * the cleanup, because covers left wearing their names would quietly break the
 * next book-opening animation.
 */
export function moveBooks(update: () => void): void {
  if (!canTransition()) {
    update()
    return
  }

  // Behind any book opening or closing, rather than on top of it. See the note
  // on `routeMove` in `routeTransition.tsx` for what racing them looks like.
  afterRouteMove(() => {
    const start = (document as Document & Transitions).startViewTransition
    if (typeof start !== 'function') {
      update()
      return
    }

    const root = document.documentElement
    root.setAttribute(MOVING_ATTRIBUTE, '')

    // Synchronously, and before the picture is taken: a name that lands in the
    // *next* render is a name the old snapshot never had, and an element the
    // browser cannot pair has nothing to animate from.
    flushSync(() => {
      setNaming(true)
    })

    const finish = () => {
      root.removeAttribute(MOVING_ATTRIBUTE)
      flushSync(() => {
        setNaming(false)
      })
    }

    // `flushSync` for the same reason `routeTransition.tsx` needs it: the
    // callback must leave the DOM already changed when it returns, or the
    // browser photographs the arrangement we were trying to move away from.
    start.call(document, () => {
      flushSync(update)
    }).finished.then(finish, finish)
  })
}
