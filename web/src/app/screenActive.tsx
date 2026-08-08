/**
 * Whether the screen a component is inside is the one on show.
 *
 * ## Why this is needed at all
 *
 * `AppShell` keeps every tab screen mounted so that returning to one is not a
 * rebuild — that is what finally removed the flash, and the reasoning is written
 * out there. But it takes something away in the same stroke: a screen used to
 * re-read its data on mount, and it used to mount on every visit. Kept alive, it
 * mounts once and would then show whatever it had the first time, for as long as
 * the app is open. A shelf that never notices a deleted book is a far worse bug
 * than the flash this all started with.
 *
 * So "the reader has come back to this screen" has to be an event a screen can
 * see. It is the shell that knows, so the shell says.
 *
 * ## Defaults to true
 *
 * A component with no provider above it — the reading screen, the book info
 * screen, anything under test rendered on its own — is by definition the thing
 * being looked at. Defaulting to `true` means nothing outside the shell has to
 * know this exists, and no screen can be accidentally frozen by being moved.
 */

import { createContext, useContext, useEffect, useRef } from 'react'

const ScreenActive = createContext(true)

export const ScreenActiveProvider = ScreenActive.Provider

/** Whether this screen is the one currently on show. */
export function useScreenActive(): boolean {
  return useContext(ScreenActive)
}

/**
 * Run `refresh` on mount, and again each time the reader comes back to this
 * screen — never while it is hidden.
 *
 * The exact shape of what a screen used to get for free from mounting, including
 * the cleanup: return one and it runs when the reader leaves or the screen goes,
 * which is what lets an in-flight read be abandoned rather than landing on a
 * screen nobody is looking at.
 *
 * `refresh` is read through a ref rather than listed as a dependency, so a caller
 * can pass an inline function without re-running on every render; the trigger is
 * arriving, and nothing else.
 */
export function useOnVisit(refresh: () => void | (() => void)): void {
  const active = useScreenActive()
  const latest = useRef(refresh)
  latest.current = refresh

  useEffect(() => {
    if (!active) return
    return latest.current()
  }, [active])
}
