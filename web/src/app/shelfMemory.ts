/**
 * What Home worked out last time, kept between visits.
 *
 * ## Why a screen needs a memory at all
 *
 * `AppShell` unmounts each screen as the reader moves between them, and that is
 * the right design: one shelf in memory rather than four, with the library's
 * cover blobs released the moment the reader is looking at Settings instead.
 *
 * The cost lands on the way *back*. Home restarted at `loading` on every return,
 * so the shelf the reader had been looking at a second earlier vanished, was
 * replaced by "Loading…", and reappeared once an indexed read had finished. With
 * the covers being re-fetched underneath it (see `useCovers`) the whole screen
 * visibly rebuilt itself, every single time.
 *
 * None of that was the page transition, which is why tuning the animation never
 * touched it: the transition was faithfully animating a screen that genuinely
 * had nothing on it yet.
 *
 * ## Stale on purpose, briefly
 *
 * This holds the *answer*, not the screen — a few dozen small objects, no DOM,
 * no blobs. A return paints from it on the first frame and the real read still
 * runs behind it, correcting anything that changed while the reader was away.
 *
 * So there is a moment where the shelf could be out of date, and that is a
 * deliberate trade rather than an oversight: a shelf one moment stale is not
 * something a reader can perceive, and an empty screen for that same moment is
 * exactly what they complained about. Anything that changes books outright —
 * an import, an update, a deletion — clears this rather than waiting for the
 * background read, so the stale window never covers a change the reader
 * themselves just made and is watching for.
 *
 * Module-level rather than a ref or context: a ref belongs to a component that
 * is, by definition, not mounted at the moment this is needed.
 */

import type { HomeShelves } from './homeShelves.ts'

export interface ShelfMemory {
  shelves: HomeShelves
  total: number
}

let remembered: ShelfMemory | null = null

/** What Home showed last time, or `null` if it hasn't been there yet. */
export function readShelfMemory(): ShelfMemory | null {
  return remembered
}

export function writeShelfMemory(memory: ShelfMemory): void {
  remembered = memory
}

/**
 * Forget it.
 *
 * **Anything that adds, removes or re-parses a book must call this**, next to
 * `forgetCovers`. The two are the same obligation: a cache nobody invalidates
 * shows the reader a shelf they have already changed, which is worse than the
 * flash it was introduced to remove.
 */
export function forgetShelfMemory(): void {
  remembered = null
}
