/**
 * Where each screen was scrolled to, one number per tab.
 *
 * ## The fault this exists to fix
 *
 * There is exactly **one scroller in this app, and it is the document**.
 * `AppShell` keeps every visited screen mounted and hides the inactive ones with
 * `hidden`, which is `display: none` — so a hidden screen has no height at all.
 * The consequence is easy to miss and impossible to work around once it starts:
 * the height of the document *changes on every tab move*, because it is only
 * ever the height of the one screen on show.
 *
 * A browser cannot leave `scrollY` past the end of a document, so the instant a
 * tall Library is swapped for a short Home the scroll position is **clamped**
 * down to Home's maximum. That is the whole bug, and every part of the report
 * falls out of it:
 *
 *   - Home appears at the bottom — it was clamped to its own last pixel.
 *   - It looks like a refresh — the clamp lands hard against the document's end
 *     edge, which is the same jolt a pull-to-refresh gives. Nothing reloads and
 *     no cover is re-decoded; the page simply arrives somewhere it never was.
 *   - Library then comes back at the top — the clamped number is the only number
 *     there is, and Library inherits whatever Home left in it.
 *
 * The last point is the tell. Two pages were sharing one position, so each
 * arrival overwrote the other's. Restoring a *saved* position on arrival cannot
 * fix that on its own; the position has to be **saved per screen** as the reader
 * scrolls, before the switch has a chance to clamp it.
 *
 * ## Why a pixel offset is right here, where `useRowMemory` says it isn't
 *
 * `useRowMemory` gave up on pixel offsets for coming back from a *book*, and it
 * was right to: that path unmounts the shelf, re-reads it, and restores against
 * a page that is still short and may have changed shape. None of that is true of
 * a tab move. The screen being returned to was never torn down — same DOM, same
 * heights, same books, same typed-in search — so the offset it was left at is
 * still the offset it means. The two are complementary and both are wanted:
 * ours runs in a layout effect, `useRowMemory`'s in a passive one, so on the one
 * path where both apply — opening a book from the shelf and coming back — the
 * row wins, which is the more precise of the two answers.
 *
 * Module-level rather than a ref in `AppShell`, because `AppShell` *unmounts*
 * while a book is open (Reader renders outside it — see `App.tsx`). A ref would
 * take the reader's place on the shelf with it. It dies on reload, which matches
 * `history.scrollRestoration = 'manual'` in `main.tsx`: a refresh is a request
 * for the top of the page.
 */

const positions = new Map<string, number>()

/** Note where a screen is scrolled to. Called as the reader scrolls. */
export function rememberScroll(path: string, offset: number): void {
  positions.set(path, offset)
}

/** Where a screen was left, or the top if it has never been scrolled. */
export function recallScroll(path: string): number {
  return positions.get(path) ?? 0
}

/** Only for tests, which must not inherit a position from the one before. */
export function forgetScrollMemory(): void {
  positions.clear()
}
