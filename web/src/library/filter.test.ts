import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta, Shelf } from '../structure/index.ts'
import type { ReadingPosition, StoredFolder } from '../storage/index.ts'
import { arrange, matchesSearch, type LibraryContext } from './filter.ts'
import { DEFAULT_PREFS, type LibraryPrefs } from './prefs.ts'
import { progressMap } from './status.ts'

function book(id: string, extra: Partial<BookMeta> = {}): BookMeta {
  return {
    id: id as BookId,
    title: id,
    source: 'epub',
    type: 'light-fiction',
    importedAt: '2026-01-01T00:00:00Z',
    ...extra,
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

function folder(id: string, name: string): StoredFolder {
  return { id, name, createdAt: '2026-01-01T00:00:00Z' }
}

function context(
  positions: ReadingPosition[] = [],
  folders: StoredFolder[] = [],
): LibraryContext {
  return {
    progress: progressMap(positions),
    folders: new Map(folders.map((entry) => [entry.id, entry])),
  }
}

function prefs(extra: Partial<LibraryPrefs> = {}): LibraryPrefs {
  return { ...DEFAULT_PREFS, ...extra }
}

const ids = (books: BookMeta[]) => books.map((entry) => entry.id)

describe('matchesSearch', () => {
  it('matches every word, across title and author', () => {
    const red = book('1', { title: 'The Red Book', author: 'C. G. Jung' })
    expect(matchesSearch(red, 'jung red')).toBe(true)
    expect(matchesSearch(red, 'jung blue')).toBe(false)
  })

  it('matches a folder name', () => {
    const philosophy = folder('f1', 'Philosophy')
    const kuhn = book('1', { title: 'Structure', author: 'Kuhn', folderId: 'f1' })

    expect(matchesSearch(kuhn, 'philosophy', context([], [philosophy]))).toBe(true)
    // The words may come from different fields — that is the point of splitting.
    expect(matchesSearch(kuhn, 'philosophy kuhn', context([], [philosophy]))).toBe(true)
  })

  it('matches everything when nothing is typed', () => {
    expect(matchesSearch(book('1'), '   ')).toBe(true)
  })
})

describe('arrange — filtering', () => {
  const books = [
    book('unread'),
    book('reading'),
    book('finished'),
  ]
  const positions = [
    position('reading', '2026-08-01T00:00:00Z', 40),
    position('finished', '2026-08-02T00:00:00Z', 100),
  ]

  it('filters by reading status', () => {
    const found = arrange(books, '', prefs({ statuses: ['unread'] }), context(positions))
    expect(ids(found)).toEqual(['unread'])
  })

  it('treats no statuses as all of them, never as none', () => {
    const found = arrange(books, '', prefs({ statuses: [] }), context(positions))
    expect(found).toHaveLength(3)
  })

  it('filters by content type', () => {
    const mixed = [
      book('a', { shelf: 'book' satisfies Shelf }),
      book('b', { shelf: 'paper' }),
      book('c', { shelf: 'document' }),
    ]
    expect(ids(arrange(mixed, '', prefs({ shelves: ['paper'] })))).toEqual(['b'])
  })

  it('filters to one folder', () => {
    const philosophy = folder('f1', 'Philosophy')
    const shelf = [book('in', { folderId: 'f1' }), book('out')]

    const found = arrange(shelf, '', prefs({ folderId: 'f1' }), context([], [philosophy]))
    expect(ids(found)).toEqual(['in'])
  })

  it('ignores a folder filter pointing at a folder that has been deleted', () => {
    const shelf = [book('a'), book('b')]
    // Nothing hidden — an empty library behind a name that no longer exists
    // would read as "my books are gone".
    expect(arrange(shelf, '', prefs({ folderId: 'gone' }), context())).toHaveLength(2)
  })
})

describe('arrange — sorting', () => {
  it('sorts by title in both directions, ignoring case', () => {
    const shelf = [book('1', { title: 'beta' }), book('2', { title: 'Alpha' })]
    expect(ids(arrange(shelf, '', prefs({ sort: 'title-asc' })))).toEqual(['2', '1'])
    expect(ids(arrange(shelf, '', prefs({ sort: 'title-desc' })))).toEqual(['1', '2'])
  })

  it('puts a book with no author last, in both directions', () => {
    const shelf = [book('none'), book('a', { author: 'Aaronson' }), book('z', { author: 'Zed' })]
    expect(ids(arrange(shelf, '', prefs({ sort: 'author-asc' })))).toEqual(['a', 'z', 'none'])
    expect(ids(arrange(shelf, '', prefs({ sort: 'author-desc' })))).toEqual(['z', 'a', 'none'])
  })

  it('sorts by when a book was last opened, never-opened last', () => {
    const shelf = [book('old'), book('new'), book('never')]
    const positions = [
      position('new', '2026-08-05T00:00:00Z'),
      position('old', '2026-08-01T00:00:00Z'),
    ]
    const found = arrange(shelf, '', prefs({ sort: 'recently-opened' }), context(positions))
    expect(ids(found)).toEqual(['new', 'old', 'never'])
  })

  it('sorts by newest import', () => {
    const shelf = [
      book('old', { importedAt: '2026-01-01T00:00:00Z' }),
      book('new', { importedAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(ids(arrange(shelf, '', prefs({ sort: 'recently-added' })))).toEqual(['new', 'old'])
  })

  it('sorts by progress, furthest through first and unstarted last', () => {
    const shelf = [book('low'), book('high'), book('none')]
    const positions = [position('low', '2026-08-01T00:00:00Z', 10), position('high', '2026-08-01T00:00:00Z', 90)]
    const found = arrange(shelf, '', prefs({ sort: 'progress' }), context(positions))
    expect(ids(found)).toEqual(['high', 'low', 'none'])
  })

  it('groups by folder alphabetically, loose books last, by title within', () => {
    const folders = [folder('f1', 'Zoology'), folder('f2', 'Anthropology')]
    const shelf = [
      book('loose', { title: 'Loose' }),
      book('z', { title: 'Zebras', folderId: 'f1' }),
      book('a2', { title: 'Bones', folderId: 'f2' }),
      book('a1', { title: 'Ancestors', folderId: 'f2' }),
    ]
    const found = arrange(shelf, '', prefs({ sort: 'folder' }), context([], folders))
    expect(ids(found)).toEqual(['a1', 'a2', 'z', 'loose'])
  })

  it('does not sort the array it was given', () => {
    const shelf = [book('b', { title: 'b' }), book('a', { title: 'a' })]
    arrange(shelf, '', prefs({ sort: 'title-asc' }))
    expect(ids(shelf)).toEqual(['b', 'a'])
  })
})
