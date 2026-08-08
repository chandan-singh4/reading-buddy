/**
 * Crossing between the app's major locations without a hard cut.
 *
 * ## What was wrong
 *
 * Tab-to-tab already animated: the four screens live inside one `AppShell`, so
 * the arriving one can slide in because the shell is still there to slide it
 * into. Opening a book does not work like that. `Reader` renders *outside* the
 * shell (reading is full-bleed), so opening a book replaces the entire tree —
 * the shell, its top bar, the shelf, all of it — with a different tree, in one
 * frame. There is no moment where both exist, so there is nothing to animate
 * between, and the result is a cut. Closing the book by swiping back is the same
 * cut played the other way.
 *
 * ## Why the View Transition API rather than an animation
 *
 * The usual fix is to keep the outgoing tree mounted for the length of the
 * transition. On this app that is the expensive answer: the outgoing tree is a
 * shelf holding cover blobs open, or a reader holding a section of a book, and
 * both would go on living — fetching, laying out, revoking object URLs — behind
 * a screen nobody is looking at. `AppShell` deliberately keys on the path so
 * exactly one screen is mounted at a time; keeping two would undo that.
 *
 * The browser's own View Transition API takes a *picture* of the outgoing screen
 * instead. React unmounts it as it always did, and the picture is what the fade
 * plays against — no second tree, no second set of work, nothing for this module
 * to clean up if a transition is interrupted.
 *
 * ## The lagged location, and the remount it exists to prevent
 *
 * `startViewTransition` captures the old screen, then calls back to make the DOM
 * change. So the change has to be *ours to make*, which means the routes cannot
 * simply read the live location — by the time we could react to it, React has
 * already re-rendered.
 *
 * So the location is held one step behind (`shown`) and only moved forward
 * inside the callback. That creates one hazard worth naming, because it bit
 * during development: anything below still calling `useLocation()` sees the
 * *new* path while the routes are still rendering the *old* screen. `AppShell`
 * keys its content on the path, so for that one render it would throw away and
 * rebuild the shelf it was about to be photographed with. `useViewLocation()`
 * is the fix — the shell derives what it renders from the same lagged location
 * the routes do, and keeps the live one only for gestures, which must always act
 * on the truth.
 *
 * ## Where it deliberately does nothing
 *
 * Only when the *area* changes — shelf ↔ book ↔ book details. A swipe between
 * two tabs already has its own motion in `AppShell.module.css`, and wrapping
 * that in a cross-fade as well would be two effects doing one job. A reader who
 * has asked for reduced motion, and any browser without the API (Firefox and
 * Safari, at the time of writing), get the straight swap they had before: the
 * fallback is the old behaviour, not a broken one.
 */

import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, type Location } from 'react-router'

/**
 * The parts of the app that are somewhere *else*, rather than somewhere
 * alongside. The number is depth, and its only job is to say which way the move
 * went so the fade can lean the right way.
 */
function areaOf(pathname: string): number {
  if (!pathname.startsWith('/book/')) return 0
  return pathname.endsWith('/info') ? 2 : 1
}

/** Attribute on `<html>` naming the direction, for the stylesheet to read. */
const DIRECTION_ATTRIBUTE = 'data-route-move'

interface Transitions {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

function canTransition(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof (document as Document & Transitions).startViewTransition !== 'function') return false
  // The same preference `index.css` honours globally. A cross-fade between two
  // screens is exactly the kind of movement it is asking not to see.
  return !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
}

/**
 * The location the routes are currently *rendering*, which during a transition
 * is one step behind the location the browser is at.
 */
const ViewLocation = createContext<Location | null>(null)

/**
 * The location to render from — lagged during a transition, live otherwise.
 *
 * Use this for anything that decides *what is on screen*: which route matches,
 * what a subtree is keyed on, which way a page slides in. Keep `useLocation()`
 * for anything that acts on where the reader actually is — a swipe handler must
 * never be one step behind the finger.
 */
export function useViewLocation(): Location {
  const live = useLocation()
  return useContext(ViewLocation) ?? live
}

/**
 * Holds the rendered location one step behind the real one while the browser
 * photographs the outgoing screen.
 *
 * Renders its children through a context rather than taking them as a function,
 * so nothing below has to know this exists — `<Routes>` is handed the lagged
 * location and everything else follows from it.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const live = useLocation()
  const [shown, setShown] = useState(live)

  useLayoutEffect(() => {
    if (shown === live) return

    const from = areaOf(shown.pathname)
    const to = areaOf(live.pathname)

    // Same area, no API, or a reader who asked for less movement: catch up now.
    // In a layout effect, so this lands before the browser paints and the extra
    // render costs a reader nothing.
    if (from === to || !canTransition()) {
      setShown(live)
      return
    }

    document.documentElement.setAttribute(DIRECTION_ATTRIBUTE, to > from ? 'in' : 'out')

    // `flushSync` is what makes this work at all: the callback has to leave the
    // DOM already changed when it returns, and React would otherwise schedule
    // the re-render for later — after the browser had taken its second picture,
    // which would be a picture of the screen we were leaving.
    const transition = (document as Document & Transitions).startViewTransition!(() => {
      flushSync(() => {
        setShown(live)
      })
    })

    const done = () => {
      document.documentElement.removeAttribute(DIRECTION_ATTRIBUTE)
    }
    // Cleared on failure as well as success. A transition can be abandoned — a
    // second navigation on top of it, a tab going to the background — and a
    // stale direction left on `<html>` would lean the *next* move the wrong way.
    transition.finished.then(done, done)
  }, [live, shown])

  return <ViewLocation.Provider value={shown}>{children}</ViewLocation.Provider>
}
