// Collapsing publisher subject headings into countable genres. The odd shapes
// are the point: these strings are written by somebody else and are messy.

import { describe, expect, it } from 'vitest'

import { countGenres, genreOf, splitFiction } from './genres.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

const book = (id: string, subjects?: string[], genre?: string): BookMeta =>
  ({
    id: id as BookId,
    title: id,
    importedAt: '2026-01-01T00:00:00.000Z',
    ...(subjects ? { subjects } : {}),
    ...(genre ? { genre } : {}),
  }) as BookMeta

describe('genreOf', () => {
  it('reads a BISAC path, not just its first word', () => {
    expect(genreOf(book('a', ['Business & Economics / Economic History']))).toBe('Economics')
  })

  it('takes the more specific label when a book matches two', () => {
    // "Philosophy / Mind & Body" and "Body, Mind & Spirit / …" both match.
    // Philosophy comes first in the table, so Philosophy wins.
    expect(
      genreOf(book('a', ['Philosophy / Mind & Body', 'Body, Mind & Spirit / Inspiration'])),
    ).toBe('Philosophy')
  })

  it('is not fooled by case', () => {
    expect(genreOf(book('a', ['PSYCHOLOGY / Cognitive Psychology']))).toBe('Psychology')
  })

  it('says nothing rather than guessing when there are no headings', () => {
    expect(genreOf(book('a'))).toBeUndefined()
    expect(genreOf(book('a', []))).toBeUndefined()
  })

  it('says nothing for a heading it does not recognise', () => {
    expect(genreOf(book('a', ['Crafts & Hobbies / Model Railroading']))).toBeUndefined()
  })
})

describe('countGenres', () => {
  it('counts each book once, so the bars can be read as books', () => {
    const books = [
      book('a', ['Philosophy / Ethics', 'History / Ancient']),
      book('b', ['Philosophy / Logic']),
      book('c', ['History / Modern']),
    ]
    const { counts } = countGenres(books)
    // Book `a` matches both Philosophy and History and must appear once.
    expect(counts.reduce((sum, c) => sum + c.books, 0)).toBe(3)
    expect(counts).toEqual([
      { name: 'Philosophy', books: 2 },
      { name: 'History', books: 1 },
    ])
  })

  it('reports unmatched books rather than folding them into an Other bar', () => {
    const { counts, uncounted } = countGenres([book('a'), book('b', ['Philosophy / Ethics'])])
    expect(uncounted).toBe(1)
    expect(counts).toEqual([{ name: 'Philosophy', books: 1 }])
  })

  it('orders by size, then by name so the list cannot jitter', () => {
    const { counts } = countGenres([
      book('a', ['History / Modern']),
      book('b', ['Philosophy / Ethics']),
    ])
    expect(counts.map((c) => c.name)).toEqual(['History', 'Philosophy'])
  })
})

describe('splitFiction', () => {
  it('reads the catalogue’s own coarse label', () => {
    const split = splitFiction([
      book('a', undefined, 'Fiction'),
      book('b', undefined, 'Non-fiction'),
      book('c', undefined, 'Juvenile Nonfiction'),
      book('d'),
    ])
    // "Juvenile Nonfiction" contains "fiction" as a substring, so nonfiction is
    // tested first — this is the case that ordering exists for.
    expect(split).toEqual({ fiction: 1, nonfiction: 2, unknown: 1 })
  })
})
