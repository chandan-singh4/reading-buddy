import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import type { ReadingPosition } from '../storage/db.ts'
import { shelvesOf } from './homeShelves.ts'

function book(id: string, title = id): BookMeta {
  return {
    id: id as BookId,
    title,
    source: 'epub',
    type: 'light-fiction',
    importedAt: '2026-01-01T00:00:00Z',
  }
}

function position(bookId: string, at: string, percent?: number): ReadingPosition {
  return {
    bookId: bookId as BookId,
    anchor: '[ch01-s01-p001]' as ReadingPosition['anchor'],
    at,
    ...(percent === undefined ? {} : { percent }),
  }
}

describe('shelvesOf', () => {
  it('puts the most recently opened, unfinished book in Currently Reading', () => {
    const books = [book('a'), book('b')]
    // Most-recent-first, as `listPositions()` returns them.
    const positions = [position('b', '2026-08-03T10:00:00Z', 40), position('a', '2026-08-02T10:00:00Z', 20)]

    const shelves = shelvesOf(books, positions)
    expect(shelves.currentlyReading?.book.id).toBe('b')
    expect(shelves.currentlyReading?.percent).toBe(40)
    expect(shelves.upNext.map((entry) => entry.book.id)).toEqual(['a'])
  })

  it('fills Up Next with the 2nd through 4th most recent, and no more', () => {
    const books = ['a', 'b', 'c', 'd', 'e'].map((id) => book(id))
    const positions = books.map((b, index) =>
      position(b.id, `2026-08-0${5 - index}T10:00:00Z`),
    )

    const shelves = shelvesOf(books, positions)
    expect(shelves.currentlyReading?.book.id).toBe('a')
    expect(shelves.upNext.map((entry) => entry.book.id)).toEqual(['b', 'c', 'd'])
  })

  it('moves a book at 100% into Finished, out of the recency shelves', () => {
    const books = [book('a'), book('b')]
    const positions = [
      position('a', '2026-08-03T10:00:00Z', 100),
      position('b', '2026-08-02T10:00:00Z', 50),
    ]

    const shelves = shelvesOf(books, positions)
    expect(shelves.finished.map((b) => b.id)).toEqual(['a'])
    expect(shelves.currentlyReading?.book.id).toBe('b')
  })

  it('treats a position with no percent as still reading, never as finished', () => {
    const books = [book('a')]
    const positions = [position('a', '2026-08-03T10:00:00Z')]

    const shelves = shelvesOf(books, positions)
    expect(shelves.finished).toEqual([])
    expect(shelves.currentlyReading?.book.id).toBe('a')
    expect(shelves.currentlyReading?.percent).toBeUndefined()
  })

  it('lists a book with no position at all as unread', () => {
    const books = [book('a'), book('b')]
    const positions = [position('a', '2026-08-03T10:00:00Z', 10)]

    const shelves = shelvesOf(books, positions)
    expect(shelves.unread.map((b) => b.id)).toEqual(['b'])
    expect(shelves.unreadTotal).toBe(1)
  })

  it('caps Unread at 10 but still reports the true total', () => {
    const books = Array.from({ length: 15 }, (_, i) => book(`u${i}`))

    const shelves = shelvesOf(books, [])
    expect(shelves.unread).toHaveLength(10)
    expect(shelves.unreadTotal).toBe(15)
  })

  it('skips a position whose book no longer exists', () => {
    const books = [book('a')]
    const positions = [
      position('ghost', '2026-08-03T10:00:00Z', 50),
      position('a', '2026-08-02T10:00:00Z', 10),
    ]

    const shelves = shelvesOf(books, positions)
    expect(shelves.currentlyReading?.book.id).toBe('a')
    expect(shelves.finished).toEqual([])
  })

  it('returns an empty shelf set for an empty library', () => {
    const shelves = shelvesOf([], [])
    expect(shelves).toEqual({
      currentlyReading: undefined,
      upNext: [],
      unread: [],
      unreadTotal: 0,
      finished: [],
    })
  })
})
