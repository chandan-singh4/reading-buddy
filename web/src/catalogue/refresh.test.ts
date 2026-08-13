import { describe, expect, it, vi } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import type { Catalogue } from './lookup.ts'
import { backfill, needsLookup, refreshBook, type RefreshDeps } from './refresh.ts'
import type { VolumeInfo } from './volume.ts'

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

const NESTOR: VolumeInfo = {
  title: 'Breath',
  authors: ['James Nestor'],
  pageCount: 304,
  imageLinks: { thumbnail: 'https://books.google.com/art' },
}

/** A catalogue that answers with the same volume for anything it is asked. */
function answering(volume?: VolumeInfo): Catalogue {
  return {
    async search() {
      return volume ? [{ id: 'v1' }] : []
    },
    async volumes() {
      return volume ? [volume] : []
    },
  }
}

function deps(overrides: Partial<RefreshDeps> = {}): RefreshDeps & {
  saveBook: ReturnType<typeof vi.fn>
  saveAssets: ReturnType<typeof vi.fn>
} {
  const saveBook = vi.fn()
  const saveAssets = vi.fn()

  return {
    saveBook,
    saveAssets,
    repository: {
      saveBook,
      saveAssets,
      listBooks: vi.fn().mockResolvedValue([]),
      listAssetPaths: vi.fn().mockResolvedValue([]),
      ...(overrides.repository ?? {}),
    } as RefreshDeps['repository'],
    catalogue: overrides.catalogue ?? answering(NESTOR),
    fetchCover: overrides.fetchCover ?? vi.fn().mockResolvedValue(new Blob(['png'])),
    now: () => AT,
  }
}

describe('refreshBook', () => {
  it('stores what the catalogue said', async () => {
    const d = deps()

    const outcome = await refreshBook(book(), d)

    expect(outcome.status).toBe('matched')
    expect(d.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({ pageCount: 304, metadataFetchedAt: AT }),
    )
  })

  it('keeps the cover it fetched, under its own name', async () => {
    const d = deps()

    await refreshBook(book(), d)

    expect(d.saveAssets).toHaveBeenCalledWith(
      'b1',
      expect.arrayContaining([expect.objectContaining({ path: '__cover_fetched__' })]),
    )
  })

  // The epub's own cover is the edition in hand, and it wins on screen anyway —
  // so fetching Google's would be spending a phone's data on an invisible image.
  it('does not fetch a cover for a book that already has its own', async () => {
    const fetchCover = vi.fn()
    const d = deps({
      repository: { listAssetPaths: vi.fn().mockResolvedValue(['__cover__']) } as never,
      fetchCover,
    })

    await refreshBook(book(), d)

    expect(fetchCover).not.toHaveBeenCalled()
    expect(d.saveAssets).not.toHaveBeenCalled()
  })

  it('saves the book anyway when the cover could not be fetched', async () => {
    const d = deps({ fetchCover: vi.fn().mockResolvedValue(undefined) })

    await refreshBook(book(), d)

    expect(d.saveBook).toHaveBeenCalled()
    expect(d.saveAssets).not.toHaveBeenCalled()
  })

  it('stamps a book the catalogue has never heard of', async () => {
    const d = deps({ catalogue: answering(undefined) })

    const outcome = await refreshBook(book(), d)

    expect(outcome.status).toBe('unmatched')
    expect(d.saveBook).toHaveBeenCalledWith(expect.objectContaining({ metadataFetchedAt: AT }))
  })

  // The rule the whole feature is arranged around.
  it('writes nothing when the catalogue could not be reached', async () => {
    const d = deps({
      catalogue: { search: vi.fn().mockRejectedValue(new Error('HTTP 429')), volumes: vi.fn() },
    })

    expect(await refreshBook(book(), d)).toEqual({ status: 'failed', reason: 'HTTP 429' })
    expect(d.saveBook).not.toHaveBeenCalled()
  })
})

describe('needsLookup', () => {
  it('wants a book nobody has asked about', () => {
    expect(needsLookup(book())).toBe(true)
  })

  // Not "has no volume id": a book that is genuinely not in the catalogue never
  // will have one, and asking nightly forever spends a quota on a certain no.
  it('leaves alone a book that was asked about and not found', () => {
    expect(needsLookup(book({ metadataFetchedAt: AT }))).toBe(false)
  })
})

describe('backfill', () => {
  function shelf(books: BookMeta[], catalogue?: Catalogue) {
    return deps({
      repository: {
        listBooks: vi.fn().mockResolvedValue(books),
        listAssetPaths: vi.fn().mockResolvedValue(['__cover__']),
      } as never,
      catalogue,
    })
  }

  it('works through the books that have never been asked about', async () => {
    const d = shelf([book({ id: 'a' as BookId }), book({ id: 'b' as BookId })])

    expect(await backfill(d)).toEqual({ matched: 2, unmatched: 0 })
  })

  it('skips the ones already asked about', async () => {
    const d = shelf([book({ id: 'a' as BookId, metadataFetchedAt: AT }), book({ id: 'b' as BookId })])

    expect(await backfill(d)).toMatchObject({ matched: 1 })
    expect(d.saveBook).toHaveBeenCalledTimes(1)
  })

  it('counts the books the catalogue has no record of separately', async () => {
    const d = shelf([book({ id: 'a' as BookId })], answering(undefined))

    expect(await backfill(d)).toEqual({ matched: 0, unmatched: 1 })
  })

  // A quota error is never about one book: the next 30 requests fail too, and
  // making them is what caused it. The unasked books stay unstamped, so they
  // come back tomorrow.
  it('stops on the first failure rather than spending the rest of the quota', async () => {
    const d = shelf(
      [book({ id: 'a' as BookId }), book({ id: 'b' as BookId }), book({ id: 'c' as BookId })],
      { search: vi.fn().mockRejectedValue(new Error('HTTP 429')), volumes: vi.fn() },
    )

    expect(await backfill(d)).toEqual({ matched: 0, unmatched: 0, stopped: 'HTTP 429' })
    expect(d.saveBook).not.toHaveBeenCalled()
  })

  it('takes only as many as it was asked for', async () => {
    const d = shelf([book({ id: 'a' as BookId }), book({ id: 'b' as BookId })])

    expect(await backfill(d, 1)).toEqual({ matched: 1, unmatched: 0 })
  })
})
