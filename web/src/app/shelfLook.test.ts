import { describe, expect, it } from 'vitest'

import { bookLook } from './shelfLook.ts'

describe('bookLook', () => {
  it('gives the same book the same look every time', () => {
    expect(bookLook('book-abc')).toEqual(bookLook('book-abc'))
  })

  it('keeps every book within a hand-span of the shelf height', () => {
    for (const id of Array.from({ length: 200 }, (_, i) => `book-${i}`)) {
      const look = bookLook(id)
      expect(look.height).toBeGreaterThanOrEqual(0.85)
      expect(look.height).toBeLessThanOrEqual(1.1)
    }
  })

  it('leans only a few books, and only slightly', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `book-${i}`)
    const leans = ids.map((id) => bookLook(id).lean)

    // A shelf where everything tilts looks like a cartoon; one where nothing
    // does is the grid of thumbnails this whole module exists to avoid.
    const leaning = leans.filter((lean) => lean !== 0).length
    expect(leaning).toBeGreaterThan(0)
    expect(leaning).toBeLessThan(ids.length / 2)

    for (const lean of leans) expect(Math.abs(lean)).toBeLessThanOrEqual(1.5)
  })

  it('does not tie height and thickness to the same roll', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `book-${i}`)
    const pairs = new Set(ids.map((id) => `${bookLook(id).height}/${bookLook(id).thickness}`))
    // If the two moved together there would be at most one thickness per
    // height — eight pairs in total.
    expect(pairs.size).toBeGreaterThan(8)
  })

  it('varies across different books', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `book-${i}`)
    expect(new Set(ids.map((id) => bookLook(id).height)).size).toBeGreaterThan(1)
  })
})
