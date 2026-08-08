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
export function useTabHistory(isTabPath: (pathname: string) => boolean): (to: string) => void {
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * Every history entry this session has stood on, by key.
   *
   * This is how a Back press is recognised, and it is worth saying why it isn't
   * `useNavigationType()`, which exists to answer exactly this question: under a
   * declarative router — `BrowserRouter`, which is what this app uses — it
   * reports `POP` for every navigation including pushes. Trusting it made the
   * handler below fire on every swipe and bounce the reader straight back to the
   * tab they had just left, which looked precisely like swiping being broken.
   *
   * A key, on the other hand, cannot lie. The router mints a fresh one for every
   * navigation *forward*, push or replace; going back re-visits an entry whose
   * key already exists. So a key that has been seen before means the reader
   * moved backwards through the history, and nothing else does.
   */
  const seen = useRef(new Set<string>())

  /**
   * The tab visited immediately before the one on screen, or `null` if there
   * isn't one yet.
   *
   * A ref and not history state, which is the point of the whole design: the
   * entry that would carry it is the one Back is about to throw away. It is
   * lost on a reload, which is correct — a restored session has no "just before"
   * to retrace, and inventing one would send the reader somewhere they have not
   * been this visit.
   */
  const previous = useRef<string | null>(null)

  const move = useCallback(
    (to: string) => {
      const from = location.pathname
      if (to === from) return

      // Only a tab is worth retracing to. Arriving from a book, the level has
      // nothing behind it yet and Back should simply return there.
      previous.current = isTabPath(from) ? from : null

      // Claim an entry on the way in; rewrite it from then on. Two entries is
      // what the retrace above spends, and it never grows past them however
      // long the reader swipes around.
      navigate(to, { replace: isTabEntry(location.state), state: TAB_ENTRY })
    },
    [navigate, location, isTabPath],
  )

  useEffect(() => {
    const wentBack = seen.current.has(location.key)
    seen.current.add(location.key)
    // Moved forward — a swipe, a drawer tap, a link, or the rewrite below,
    // which mints a key of its own and so cannot retrace its own retrace.
    if (!wentBack) return

    const back = previous.current
    // Consumed whether or not it is used: one Back retraces one move, and a
    // second press must find nothing left to retrace.
    previous.current = null

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
