/**
 * Come back to the shelf on the book you left from.
 *
 * This replaces remembering a scroll offset, which kept landing at the bottom
 * of the shelf or somewhere arbitrary. The reason is that a pixel offset is
 * only meaningful against the page it was measured on: restore it while the
 * list is still short and the browser clamps it to whatever height exists at
 * that instant, and restore it after the shelf has changed — a book removed, a
 * filter typed, a different sort — and it points at a different book entirely.
 *
 * A row id has none of those failure modes. Either the row is on the page, in
 * which case scrolling to it is exact whatever the page is doing around it, or
 * it isn't, in which case doing nothing leaves the reader at the top of their
 * shelf. "Top of the shelf" is a fine place to be; "page 31 of 35, for no
 * reason" is not.
 *
 * `sessionStorage`, not React state: the whole point is to survive the screen
 * being unmounted while a book is open. It should not outlive the session.
 */

import { useCallback, useEffect } from 'react'

/** The DOM id of a book's row. Kept here so both halves agree on it. */
export function rowId(bookId: string): string {
  return `shelf-row-${bookId}`
}

export function useRowMemory(
  key: string,
  ready: boolean,
): (bookId: string) => void {
  useEffect(() => {
    if (!ready) return

    const remembered = window.sessionStorage.getItem(key)
    if (!remembered) return

    // Consumed on use, not left lying about. The memory answers exactly one
    // question — "which book did you just come back from?" — and it is asked
    // once. Left in place it would also answer a *reload*, which is a different
    // question with a different right answer: a reader who scrolled to the top
    // and refreshed expects the top, and being thrown back down to a book they
    // left earlier reads as the app ignoring them.
    window.sessionStorage.removeItem(key)

    const row = document.getElementById(rowId(remembered))
    // `center`, not `start`: a row pinned to the very top of the viewport reads
    // as "the list begins here", which is a lie about where you are in it.
    row?.scrollIntoView({ block: 'center' })
  }, [key, ready])

  return useCallback(
    (bookId: string) => {
      window.sessionStorage.setItem(key, bookId)
    },
    [key],
  )
}
