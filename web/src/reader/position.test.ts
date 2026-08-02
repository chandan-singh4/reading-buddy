/**
 * Reopening where you left off — the part that decides whether a saved place
 * can still be trusted.
 */

import { describe, expect, it } from 'vitest'

import type { BookId, Manifest } from '../structure/index.ts'
import { formatAnchor } from '../structure/index.ts'
import { isFresh, placeOf } from './position.ts'

const manifest: Manifest = {
  bookId: 'b1' as BookId,
  title: 'A Book',
  chapters: [1, 2, 3].map((chapter) => ({
    chapter,
    title: `Chapter ${chapter}`,
    summary: '',
    words: 300,
  })),
}

describe('a saved place', () => {
  it('names the section to open and the paragraph to land on', () => {
    const anchor = formatAnchor({ chapter: 2, section: 3, paragraph: 13 })

    expect(placeOf(anchor, manifest)).toEqual({
      here: { chapter: 2, section: 3 },
      anchor,
    })
  })

  it('is refused when the anchor is malformed', () => {
    // Written by an older build, or edited by hand in a storage inspector.
    expect(placeOf('[ch2-s3-p13]', manifest)).toBeUndefined()
    expect(placeOf('', manifest)).toBeUndefined()
  })

  it('is refused when the book no longer has that chapter', () => {
    // Re-imported by a parser that divides the book differently. Left
    // unchecked, the book opens to "That part of the book is missing" — which
    // reads as the book being broken rather than the bookmark being stale.
    const anchor = formatAnchor({ chapter: 9, section: 1, paragraph: 1 })
    expect(placeOf(anchor, manifest)).toBeUndefined()
  })
})

describe('whether to mention the place at all', () => {
  const now = Date.parse('2026-08-02T12:00:00.000Z')

  it('stays quiet about a place saved moments ago', () => {
    expect(isFresh('2026-08-02T11:59:30.000Z', now)).toBe(true)
  })

  it('speaks up about a place saved long enough ago to be forgotten', () => {
    expect(isFresh('2026-07-02T09:00:00.000Z', now)).toBe(false)
  })

  it('treats an unreadable timestamp as old', () => {
    // Saying one unnecessary sentence beats silently landing someone on page
    // 190 of a book they don't remember opening.
    expect(isFresh('not a date', now)).toBe(false)
  })
})
