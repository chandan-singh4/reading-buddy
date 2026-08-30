/**
 * The reading clock, run from the route rather than from a screen.
 *
 * ## Why it is not in the Reader any more
 *
 * `book/:bookId`, `book/:bookId/info`, `book/:bookId/last-time` and
 * `book/:bookId/chapters` are four *sibling* routes, not a parent and its
 * children. So tapping "Book details" unmounts the reading screen entirely.
 * With the clock inside that screen, a reader who glanced at the subject tags
 * and came back was recorded as three visits: one before, one during, one
 * after — two of them a few seconds long. That is a report of the router, not
 * of the reading.
 *
 * The reader's rule, in their words: once I am in the book, whatever I do in
 * the book is one session, and closing the book ends it.
 *
 * So the session belongs to the *book id in the address*, and this hook is
 * called from `App`, which never unmounts. Moving between the four screens does
 * not change that id, so nothing starts or stops. Leaving for the library does.
 *
 * No grace timer, deliberately: the pathname changes in one step from one book
 * screen to the next, and never passes through a moment of being nowhere. A
 * timer would only be a way of guessing at a fact already available exactly.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

import { placeIn } from './place.ts'
import { startSession, type Activity, type Place } from './timer.ts'
import type { BookId } from '../structure/index.ts'

/**
 * The book being read, from any of its screens, or `undefined` anywhere else.
 *
 * Exported for its test: this one small parse decides whether a session starts.
 */
export function bookInPath(pathname: string): BookId | undefined {
  const match = /^\/book\/([^/]+)/.exec(pathname)
  return match ? (decodeURIComponent(match[1]) as BookId) : undefined
}

/**
 * The screen of the book the address names.
 *
 * Three of the four book screens are routes, so the address is the whole
 * answer for them and no screen has to report anything. The fourth is the
 * reading screen, which has panels over it — the notes, the contents — and
 * only it knows which is up. So it reports, and what it reports wins here.
 */
export function activityInPath(pathname: string): Activity {
  if (/^\/book\/[^/]+\/info/.test(pathname)) return 'details'
  if (/^\/book\/[^/]+\/chapters/.test(pathname)) return 'chapters'
  if (/^\/book\/[^/]+\/last-time/.test(pathname)) return 'recap'
  return 'reading'
}

export function useReadingClock(): void {
  const pathname = useLocation().pathname
  const bookId = bookInPath(pathname)

  /*
   * A ref, not a dependency. The session must not restart when the reader taps
   * from the pages to the book details — that is the whole argument at the top
   * of this file — so the address is read at each flush, like the place.
   */
  const where = useRef(pathname)
  where.current = pathname

  useEffect(() => {
    if (bookId === undefined) return
    const place = (): Place | undefined => {
      const activity = activityInPath(where.current)
      const found = placeIn(bookId)
      // The reading screen's own report of a panel outranks the address, which
      // can only ever say "the reading screen".
      return activity === 'reading' ? found : { ...found, activity }
    }
    const session = startSession(bookId, { place })
    return () => session.stop()
  }, [bookId])
}
