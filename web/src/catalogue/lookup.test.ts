/**
 * The staged lookup, with a catalogue made of paper.
 *
 * The tests that matter most are the last two: a network failure must come back
 * as `failed`, not as `unmatched`. They look almost identical from here and are
 * opposites in the database — one means "asked, no such book", the other means
 * "never asked".
 */
import { describe, expect, it, vi } from 'vitest'

import type { BookMeta } from '../structure/index.ts'
import { lookupBook, type Catalogue } from './lookup.ts'
import type { VolumeInfo } from './volume.ts'

function book(fields: Partial<BookMeta>): BookMeta {
  return { title: 'A Book', ...fields } as BookMeta
}

/** A catalogue that answers from a script and records what it was asked. */
function fake(answers: Record<string, VolumeInfo[]>): Catalogue & { queries: string[] } {
  const queries: string[] = []
  const found = new Map<string, VolumeInfo>()

  return {
    queries,
    async search(query) {
      queries.push(query)
      const volumes = answers[query] ?? []
      return volumes.map((volume, index) => {
        const id = `${queries.length}-${index}`
        found.set(id, volume)
        return { id }
      })
    },
    async volumes(ids) {
      return ids.map((id) => found.get(id)!).filter(Boolean)
    },
  }
}

const NESTOR: VolumeInfo = {
  title: 'Breath',
  authors: ['James Nestor'],
  pageCount: 304,
  imageLinks: { thumbnail: 'https://books.google.com/art' },
}

describe('lookupBook', () => {
  it('asks by ISBN first and stops there', async () => {
    const catalogue = fake({ 'isbn:9780735213616': [NESTOR] })

    const outcome = await lookupBook(
      book({ title: 'Breath', author: 'James Nestor', isbn: '978-0-7352-1361-6' }),
      catalogue,
    )

    expect(outcome).toMatchObject({ status: 'matched', source: 'isbn' })
    expect(catalogue.queries).toEqual(['isbn:9780735213616'])
  })

  // An ISBN is an identifier. A retitled edition is still the book the reader
  // is holding, so the guard would be refusing a correct answer.
  it('trusts an ISBN match even when the title looks nothing like ours', async () => {
    const catalogue = fake({
      'isbn:9780000000001': [{ title: 'Something Else Entirely', authors: ['A Stranger'] }],
    })

    const outcome = await lookupBook(book({ title: 'Breath', isbn: '9780000000001' }), catalogue)

    expect(outcome.status).toBe('matched')
  })

  it('falls through to the strict search when the ISBN finds nothing', async () => {
    const catalogue = fake({ 'intitle:"Breath" inauthor:"James Nestor"': [NESTOR] })

    const outcome = await lookupBook(
      book({ title: 'Breath', author: 'James Nestor', isbn: '9780000000001' }),
      catalogue,
    )

    expect(outcome).toMatchObject({ status: 'matched', source: 'strict' })
    expect(catalogue.queries).toEqual([
      'isbn:9780000000001',
      'intitle:"Breath" inauthor:"James Nestor"',
    ])
  })

  it('carries the fields and the cover off the volume it accepted', async () => {
    const outcome = await lookupBook(
      book({ title: 'Breath', author: 'James Nestor' }),
      fake({ 'intitle:"Breath" inauthor:"James Nestor"': [NESTOR] }),
    )

    expect(outcome).toEqual({
      status: 'matched',
      source: 'strict',
      fields: expect.objectContaining({ pageCount: 304, author: 'James Nestor' }),
      coverUrl: 'https://books.google.com/art',
    })
  })

  // The measured false rejection: taking only the first comma-fragment searched
  // for "Shamdasani" alone and lost a book by Jung.
  it('puts every name from a mangled author field into the query', async () => {
    const catalogue = fake({})

    await lookupBook(
      book({ title: 'The Red Book', author: 'Shamdasani, Sonu, Jung, C. G.' }),
      catalogue,
    )

    expect(catalogue.queries[0]).toBe(
      'intitle:"The Red Book" inauthor:"Shamdasani Sonu Jung C. G."',
    )
  })

  it('searches on the title alone for a book with no author', async () => {
    const catalogue = fake({})

    await lookupBook(book({ title: 'Kundalini' }), catalogue)

    expect(catalogue.queries).toEqual(['intitle:"Kundalini"', 'Kundalini'])
  })

  it('trims a long title down for the loose query', async () => {
    const catalogue = fake({})

    await lookupBook(
      book({ title: 'Determined A Science of Life Without Free Will', author: 'Sapolsky' }),
      catalogue,
    )

    expect(catalogue.queries[1]).toBe('Determined A Science of Life Sapolsky')
  })

  it('takes the punctuation of a converted file out of the search', async () => {
    const catalogue = fake({})

    await lookupBook(book({ title: 'Dune [Book 1] • Special' }), catalogue)

    expect(catalogue.queries[0]).toBe('intitle:"Dune Special"')
  })

  it('skips a candidate the guard refuses and takes the next one', async () => {
    const catalogue = fake({
      'intitle:"Breath" inauthor:"James Nestor"': [
        { title: 'Breath', authors: ['Somebody Else'] },
        NESTOR,
      ],
    })

    const outcome = await lookupBook(book({ title: 'Breath', author: 'James Nestor' }), catalogue)

    expect(outcome).toMatchObject({ status: 'matched' })
    expect((outcome as { fields: BookMeta }).fields.pageCount).toBe(304)
  })

  // Four of the reader's 32 books really do match nothing. That is an answer,
  // and it gets written down so they are not asked about again every night.
  it('says unmatched when every stage came back empty', async () => {
    expect(await lookupBook(book({ title: 'A Private Notebook' }), fake({}))).toEqual({
      status: 'unmatched',
    })
  })

  it('says unmatched when results arrived but none of them was the book', async () => {
    const outcome = await lookupBook(
      book({ title: 'Vedanta Voice of Freedom', author: 'Swami Vivekananada' }),
      fake({
        'intitle:"Vedanta Voice of Freedom" inauthor:"Swami Vivekananada"': [
          { title: 'Vedanta', authors: ['Bithika Mukerji'] },
        ],
        'Vedanta Voice of Freedom Swami Vivekananada': [
          { title: 'Vedanta', authors: ['Bithika Mukerji'] },
        ],
      }),
    )

    expect(outcome).toEqual({ status: 'unmatched' })
  })

  // The one that would corrupt the shelf. A quota error is not a fact about a
  // book, and nothing may be stored for it.
  it('says failed — never unmatched — when the catalogue could not be reached', async () => {
    const catalogue: Catalogue = {
      search: vi.fn().mockRejectedValue(new Error('Google Books said no.')),
      volumes: vi.fn(),
    }

    const outcome = await lookupBook(book({ title: 'Breath' }), catalogue)

    expect(outcome).toEqual({ status: 'failed', reason: 'Google Books said no.' })
  })

  it('says failed when the second hop is the thing that broke', async () => {
    const catalogue: Catalogue = {
      search: async () => [{ id: 'abc' }],
      volumes: vi.fn().mockRejectedValue(new Error('Network error.')),
    }

    expect(await lookupBook(book({ title: 'Breath' }), catalogue)).toEqual({
      status: 'failed',
      reason: 'Network error.',
    })
  })
})
