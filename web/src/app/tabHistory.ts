/**
 * Back retraces one tab move, and then leaves. Never more, never less.
 *
 * ## What was asked for, exactly
 *
 * Home → Library → Stats. Back goes to **Library**. Back again leaves the app.
 * Not Home in between; not Stats then Library then Home.
 *
 * That is two requirements at once, and they are the reason the first two
 * attempts at this both failed:
 *
 * - **Back must show the tab you were just on.** Pushing a history entry per
 *   move gets this right and nothing else: after ten swipes it is ten presses
 *   to leave, stepping through screens already dismissed.
 * - **The second Back must leave.** Replacing on every move gets *this* right
 *   and nothing else: with no entry for the level at all, the first Back throws
 *   the reader out of a front door they were nowhere near.
 *
 * Spending one entry on the whole level — the second attempt — satisfies the
 * second requirement and quietly abandons the first: Back always landed on
 * whatever the level was entered on, which from a cold start is Home, from
 * wherever the reader actually was.
 *
 * ## Why it needs a pop handler and not just a cleverer push/replace rule
 *
 * There isn't a cleverer rule. The History API can append an entry and it can
 * rewrite the *top* one, and that is all — nothing reaches an entry underneath.
 * So "the entry below me should be the tab I was just on" is not something a
 * navigation can arrange, because by the time there is a tab to remember, the
 * entry that would have to hold it is already buried.
 *
 * What *is* reachable is the top entry after a Back has landed on it. So:
 *
 * 1. The level keeps **two** entries: one claimed on the way in, and the one it
 *    keeps rewriting as the reader swipes around.
 * 2. The tab being left is remembered as we go — in a ref, because it has to
 *    outlive the entry that would otherwise hold it.
 * 3. When Back lands on the lower entry, that entry is **rewritten in place** to
 *    the remembered tab. The reader sees the page they were just on, and because
 *    a rewrite adds nothing, the level is now down to one entry.
 * 4. So the next Back leaves. There is nothing left of the level to go back to.
 *
 * Step 3 is the whole idea: the retrace and the collapse are the same act.
 *
 * ## And then it re-arms
 *
 * The rule above is per *stretch* of navigation, not per session — which is the
 * correction the reader asked for after living with it:
 *
 * > If I navigate and then backswipe and backswipe again, that should get me out
 * > of the app. But if I only backswipe and then continue to navigate in the app,
 * > then backswipe should not get me out but one step before.
 *
 * Home → Library → Stats, Back → Library. Then Stats again, Back → **Library**,
 * not out. The retrace was spent, and moving again earns a new one.
 *
 * Mechanically that is one flag: `hasSpare`, whether the level is currently
 * holding its second, rewritable entry. A retrace consumes it, and the next
 * move pushes rather than replaces — claiming a fresh second entry, exactly as
 * arriving at the level did. So the level oscillates between one entry and two
 * and never grows past two, however long the reader swipes and presses Back.
 *
 * Which is also why reading the entry's `state` was not enough on its own:
 * after a retrace the top entry is still a tab entry — it was rewritten to one
 * — so the state alone says "replace" when the truth is that the entry
 * underneath has just been used up.
 *
 * ## The case this deliberately does not cover
 *
 * Reaching the tabs *forwards* out of a book — following a link into the
 * library rather than pressing Back into it — and then swiping between tabs.
 * The first Back there returns to the book rather than retracing a tab.
 *
 * It is not an oversight, it is the lesser of the two available wrongs. To
 * retrace instead, the handler would have to either rewrite the book's entry
 * (losing the book, so the reader could never get back to it) or push a new one
 * on top of it (which means landing in the book first, mounting the Reader and
 * starting a fetch for a book nobody asked to open, for one frame). Returning
 * to the book is at least a place the reader has actually been.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

/** What a history entry belonging to the tab level carries. */
export interface TabEntryState {
  tab: true
}

export const TAB_ENTRY: TabEntryState = { tab: true }

/**
 * Whether this history entry belongs to the tab level.
 *
 * Deliberately tolerant about the shape: `state` is `unknown` as far as the
 * router is concerned, and it can be anything a previous version of the app —
 * or the browser's session restore — happened to leave there.
 */
export function isTabEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { tab?: unknown }).tab === true
}

/**
 * Move between the four screens, and retrace exactly one of those moves on Back.
 *
 * Called once, by `AppShell`, and the function it returns is used by both the
 * swipe and the drawer — they are one move by two routes, and if only one went
 * through here Back would depend on which the reader had reached for.
 */
/**
 * Where the reader was, and how far into the history they are — kept at module
 * level, not in a ref.
 *
 * This is a correctness requirement, not tidiness. A ref belongs to a mounted
 * component, and the whole job of this memory is to be there at a moment nobody
 * can promise `AppShell` has stayed mounted through — a remount would silently
 * empty it, and an empty memory looks exactly like "there was nothing to
 * retrace", which is Back landing on Home. A module-level value survives every
 * remount and dies on a reload, which is precisely the lifetime wanted: a
 * reloaded session genuinely has no "just before" to go back to.
 */
let previousTab: string | null = null

/** How deep in the history the last render was, or `null` before the first. */
let lastIndex: number | null = null

/**
 * Whether the tab level is currently holding its second, rewritable entry.
 *
 * `true` means a move rewrites the top entry; `false` means it must claim a new
 * one. A Back sets it back to `false`, which is what re-arms the whole mechanism
 * for the next stretch of navigation — see the note at the top.
 */
let hasSpare = false

/** Fallback pop detection where there is no history index. See `wentBack`. */
const seenKeys = new Set<string>()

/** Clears the module memory. For tests, which must not leak one case into the next. */
export function forgetTabHistory(): void {
  previousTab = null
  lastIndex = null
  hasSpare = false
  seenKeys.clear()
}

/**
 * How far into the history we are, as React Router records it.
 *
 * The router keeps `{ usr, key, idx }` on every entry it creates, and `idx` is
 * the honest answer to "did that go backwards": it decreases on Back and on
 * nothing else. `null` where there is no such state to read — a memory router
 * under test, or the very first entry of a session before the router has
 * written to it — and the key-based fallback covers those.
 */
function historyIndex(): number | null {
  if (typeof window === 'undefined') return null
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : null
}

/**
 * The path actually in the address bar.
 *
 * Read from the browser rather than from the router's `location`, and the
 * difference is the bug this is built around. `move` needs to record *the tab
 * being left*, and a captured React value is only as fresh as the render that
 * captured it — one stale render and the tab recorded is the one before last.
 * That failure is invisible at the time, because the navigation itself is
 * computed elsewhere and still goes to the right place; it only shows up later,
 * as Back retracing to the wrong screen. Which is exactly the report: swiping
 * worked, and Back went to Home instead of the library.
 *
 * `window.location` cannot be stale — it is what the browser is showing.
 */
function pathNow(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  // Only where the browser history is the router's. Under a memory router the
  // address bar belongs to somebody else entirely — it is whatever page the
  // test file happens to be on — and reading it would be reading a stranger's
  // URL with total confidence. The router's own location is the truth there.
  if (historyIndex() === null) return fallback
  return window.location.pathname || fallback
}

/**
 * Move between the four screens, and retrace exactly one of those moves on Back.
 *
 * Called once, by `AppShell`, and the function it returns is used by both the
 * swipe and the drawer — they are one move by two routes, and if only one went
 * through here Back would depend on which the reader had reached for.
 */
export function useTabHistory(isTabPath: (pathname: string) => boolean): (to: string) => void {
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * The live router location, for the two things `window.location` cannot
   * answer: the entry's `state`, and the path under a memory router in tests.
   * Written on every render so a callback can read the latest without being
   * rebuilt — which is what keeps `move` below stable.
   */
  const here = useRef(location)
  here.current = location

  const isTab = useRef(isTabPath)
  isTab.current = isTabPath

  /*
   * Stable for the life of the shell: no dependency on `location`, so it is
   * never rebuilt and `useSwipeNav` never re-subscribes its listeners for a
   * navigation. Everything changeable is read through a ref at call time, which
   * is also what makes it impossible for this to act on a stale path.
   */
  const move = useCallback((to: string) => {
    const from = pathNow(here.current.pathname)
    if (to === from) return

    // Only a tab is worth retracing to. Arriving from a book, the level has
    // nothing behind it yet and Back should simply return there.
    previousTab = isTab.current(from) ? from : null

    // Claim a second entry when the level hasn't got one — arriving from
    // outside, or having just spent it on a Back — and rewrite it from then on.
    // Both conditions matter: the flag alone would push on the way in from a
    // book, and the entry's state alone can't tell a spent retrace from an
    // ordinary swipe, because the retrace leaves a tab entry on top either way.
    navigate(to, { replace: hasSpare && isTabEntry(here.current.state), state: TAB_ENTRY })
    hasSpare = true
  }, [navigate])

  useEffect(() => {
    const index = historyIndex()
    let wentBack: boolean

    if (index !== null) {
      // The reliable reading. A replace leaves the index alone, so the retrace
      // below cannot be mistaken for another Back.
      wentBack = lastIndex !== null && index < lastIndex
      lastIndex = index
    } else {
      // No index to read. A key that has been seen before means an entry that
      // has been stood on before, which is the same conclusion by a longer road.
      wentBack = seenKeys.has(location.key)
      seenKeys.add(location.key)
    }

    if (!wentBack) return

    // The level no longer has a spare entry to rewrite — whether it is about to
    // be retraced into, or Back has left the four screens altogether. Either
    // way the next move must claim a fresh one, which is what gives the reader
    // another Back to spend. Set before the returns below, so every path
    // through a Back agrees on it.
    hasSpare = false

    const back = previousTab
    // Consumed whether or not it is used: one Back retraces one move, and a
    // second press must find nothing left to retrace.
    previousTab = null

    if (!back) return
    // Back has left the four screens altogether — for a book, most likely. That
    // is a real destination and it is where the reader asked to go.
    if (!isTabPath(location.pathname)) return
    // Already showing it. The entry Back landed on happened to be the right one.
    if (back === location.pathname) return

    // Rewritten, not pushed. This is what collapses the level to a single entry
    // so the *next* Back leaves the app rather than finding another tab.
    navigate(back, { replace: true, state: TAB_ENTRY })
  }, [location, navigate, isTabPath])

  return move
}
