import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { applied } from './apply.ts'
import type { Outcome } from './lookup.ts'

const AT = '2026-08-12T10:00:00.000Z'

function book(fields: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'b1' as BookId,
    title: 'Breath',
    source: 'epub',
    type: 'book',
    importedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  } as BookMeta
}

function matched(fields: Partial<BookMeta>): Outcome {
  return { status: 'matched', source: 'strict', fields }
}

describe('applied', () => {
  it('fills in what the catalogue knew and the shelf did not', () => {
    const result = applied(book(), matched({ publisher: 'Penguin', pageCount: 304 }), AT)

    expect(result).toMatchObject({
      publisher: 'Penguin',
      pageCount: 304,
      metadataSource: 'strict',
      metadataFetchedAt: AT,
    })
  })

  it('overrules the thinner answer the file gave for a catalogue-owned field', () => {
    const result = applied(book({ publisher: 'Unknown' }), matched({ publisher: 'Penguin' }), AT)

    expect(result!.publisher).toBe('Penguin')
  })

  it('leaves the reader’s own words alone', () => {
    const mine = book({ title: 'My Name For It', rating: 5, notes: 'Read it twice.' })

    const result = applied(mine, matched({ title: 'Breath', rating: 1 } as Partial<BookMeta>), AT)

    expect(result).toMatchObject({ title: 'My Name For It', rating: 5, notes: 'Read it twice.' })
  })

  // The edition in hand names four people in citation order; the catalogue
  // names one. Tidier is not the same as better.
  it('never overwrites an author the shelf already has', () => {
    const result = applied(
      book({ author: 'Shamdasani, Sonu, Jung, C. G.' }),
      matched({ author: 'C. G. Jung' }),
      AT,
    )

    expect(result!.author).toBe('Shamdasani, Sonu, Jung, C. G.')
  })

  it('fills an author that was missing', () => {
    expect(applied(book(), matched({ author: 'James Nestor' }), AT)!.author).toBe('James Nestor')
  })

  // The measured case: a mountaineering memoir came back Fiction. Once that is
  // fixed by hand, no later fetch may undo it.
  it('respects a genre the reader corrected', () => {
    const result = applied(
      book({ genre: 'Non-fiction', genreOverridden: true }),
      matched({ genre: 'Fiction' }),
      AT,
    )

    expect(result!.genre).toBe('Non-fiction')
  })

  it('still sets a genre nobody has corrected', () => {
    expect(applied(book(), matched({ genre: 'Fiction' }), AT)!.genre).toBe('Fiction')
  })

  // The stamp is the difference between "asked, not in the catalogue" and
  // "never asked". Without it this book is re-asked every night forever.
  it('writes down that an unmatched book was asked about, and nothing else', () => {
    const before = book({ publisher: 'Penguin' })

    expect(applied(before, { status: 'unmatched' }, AT)).toEqual({
      ...before,
      metadataFetchedAt: AT,
    })
  })

  // The one that would corrupt the shelf if it went the other way.
  it('writes nothing at all when the lookup failed', () => {
    expect(applied(book(), { status: 'failed', reason: 'HTTP 429' }, AT)).toBeUndefined()
  })
})
