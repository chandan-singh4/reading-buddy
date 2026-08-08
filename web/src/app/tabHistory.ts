/**
 * One history entry for the whole tab level — not none, and not one per swipe.
 *
 * ## The two wrong answers, and why the right one is neither
 *
 * Home, Library, Stats and Settings are laid out side by side. They are *one
 * level*, the same relationship a tab bar has, drawn as a swipe instead of a row
 * of buttons. The question is what the device's Back gesture should do while a
 * reader is on that level, and there are two obvious answers, both wrong:
 *
 * **Push every move.** This is what the app did first, and it makes Back mean
 * "undo the last flick". A reader who browsed Home → Library → Stats → Settings
 * then had to press Back four times to leave, stepping backwards through screens
 * they had already dismissed. Back stopped meaning "out of here" and started
 * meaning "rewind me".
 *
 * **Replace every move.** The obvious correction, and it overshoots: with no
 * entry at all for the tab level, Back from Library — reached by swiping from
 * Home a second ago — leaves the app entirely. The reader had somewhere to go
 * back *to* and was thrown out of the front door instead.
 *
 * ## What this does
 *
 * Exactly one entry for the level, however much moving happens inside it. The
 * *first* move onto the tab level pushes; every move made while already on it
 * replaces. So Back always goes back one step — to whatever the reader was doing
 * before they started swiping — and never more than one.
 *
 * The marker rides on the history entry itself (`state.tab`) rather than in a
 * ref or a module variable, which is the only place that survives what has to
 * survive: a reload, a restored session, and the reader pressing Back and then
 * Forward again. A ref would say "we already pushed" about an entry that is no
 * longer the one being looked at.
 */

import { useCallback } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'

/** What a history entry created by a move between the four screens carries. */
export interface TabEntryState {
  tab: true
}

export const TAB_ENTRY: TabEntryState = { tab: true }

/**
 * Whether this history entry is already the tab level's one entry.
 *
 * Deliberately tolerant about the shape: `state` is `unknown` as far as the
 * router is concerned, and it can be anything a previous version of the app —
 * or the browser's session restore — happened to put there.
 */
export function isTabEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { tab?: unknown }).tab === true
}

/** How to move to a screen on the tab level from wherever we are now. */
export function tabMoveFrom(location: Location): { replace: boolean; state: TabEntryState } {
  // Already standing on the level's entry: reuse it. Arriving from anywhere
  // else — a book, its details page, a cold start — claim one.
  return { replace: isTabEntry(location.state), state: TAB_ENTRY }
}

/**
 * Move to one of the four screens, keeping the level to a single history entry.
 *
 * Used by the swipe and by the drawer alike. They are the same move by two
 * routes, and if only one of them went through here Back would depend on which
 * one the reader happened to reach for.
 */
export function useTabNavigate(): (to: string) => void {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (to: string) => {
      navigate(to, tabMoveFrom(location))
    },
    [navigate, location],
  )
}
