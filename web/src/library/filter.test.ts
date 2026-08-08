import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta, Shelf } from '../structure/index.ts'
import type { ReadingPosition, StoredFolder } from '../storage/index.ts'
import { arrange, matchesSearch, type LibraryContext } from './filter.ts'
import { DEFAULT_PREFS, type LibraryPrefs } from './prefs.ts'
import { progressMap } from './status.ts'
import { FINISHED_FOLDER_ID, UNREAD_FOLDER_ID } from './systemFolders.ts'

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
    const kuhn = book('1', { title: 'Structure', author: 'Kuhn', folderIds: ['f1'] })

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
    const shelf = [book('in', { folderIds: ['f1'] }), book('out')]

    const found = arrange(shelf, '', prefs({ folderId: 'f1' }), context([], [philosophy]))
    expect(ids(found)).toEqual(['in'])
  })

  it('finds a book in any of its folders, and shows it only once', () => {
    const folders = [folder('f1', 'Philosophy'), folder('f2', 'For the course')]
    // The book the whole many-folder change exists for.
    const both = book('both', { folderIds: ['f1', 'f2'] })
    const shelf = [both, book('out')]

    expect(ids(arrange(shelf, '', prefs({ folderId: 'f1' }), context([], folders)))).toEqual([
      'both',
    ])
    expect(ids(arrange(shelf, '', prefs({ folderId: 'f2' }), context([], folders)))).toEqual([
      'both',
    ])
    // The property that keeps this a folder rather than a tag: two folders
    // narrow the library, they never multiply it.
    expect(ids(arrange(shelf, '', prefs(), context([], folders)))).toEqual(['both', 'out'])
  })

  it('searches every folder name a book is filed under', () => {
    const folders = [folder('f1', 'Philosophy'), folder('f2', 'For the course')]
    const both = book('both', { folderIds: ['f1', 'f2'] })
    expect(matchesSearch(both, 'philosophy', context([], folders))).toBe(true)
    expect(matchesSearch(both, 'course', context([], folders))).toBe(true)
  })

  it('drops a folder id whose folder has been deleted, without hiding the book', () => {
    const shelf = [book('a', { folderIds: ['gone'] })]
    // The badge disappears; the book does not.
    expect(ids(arrange(shelf, '', prefs(), context()))).toEqual(['a'])
  })

  it('ignores a folder filter pointing at a folder that has been deleted', () => {
    const shelf = [book('a'), book('b')]
    // Nothing hidden — an empty library behind a name that no longer exists
    // would read as "my books are gone".
    expect(arrange(shelf, '', prefs({ folderId: 'gone' }), context())).toHaveLength(2)
  })
})

/**
 * Reading progress as a filter in quarters, which is what it became when the
 * single "Sort by" chip was split into one control per question. Ordering the
 * whole library by percentage never answered "which books am I half way
 * through"; four bands do.
 */
describe('arrange — filtering by reading progress', () => {
  const shelf = [book('barely'), book('half'), book('nearly'), book('done'), book('never')]
  const positions = [
    position('barely', '2026-08-01T00:00:00Z', 10),
    position('half', '2026-08-01T00:00:00Z', 50),
    position('nearly', '2026-08-01T00:00:00Z', 80),
    position('done', '2026-08-01T00:00:00Z', 100),
  ]

  it('keeps only the books inside a band', () => {
    const found = arrange(shelf, '', prefs({ bands: ['0-25'] }), context(positions))
    expect(ids(found)).toEqual(['barely'])
  })

  it('takes several bands at once', () => {
    // "The ones I've barely started and the ones I'm nearly done with" is a
    // real thing to ask for, and the panel stays open so it can be asked.
    const found = arrange(shelf, '', prefs({ bands: ['0-25', '75-100'] }), context(positions))
    expect(ids(found).sort()).toEqual(['barely', 'done', 'nearly'])
  })

  it('puts a book on a boundary in exactly one band', () => {
    // 50% is in 50-75%, not in both. Overlapping bands would show one book
    // under two filters and make the counts disagree with the shelf.
    expect(ids(arrange(shelf, '', prefs({ bands: ['25-50'] }), context(positions)))).toEqual([])
    expect(ids(arrange(shelf, '', prefs({ bands: ['50-75'] }), context(positions)))).toEqual([
      'half',
    ])
  })

  it('keeps a finished book in the top band rather than falling off the end', () => {
    const found = arrange(shelf, '', prefs({ bands: ['75-100'] }), context(positions))
    expect(ids(found).sort()).toEqual(['done', 'nearly'])
  })

  it('leaves a book with no recorded percentage out of every band', () => {
    // An unknown percentage is not 0% — the book was never opened. Sweeping it
    // into "0-25%" would answer "barely started" with books never touched.
    for (const band of ['0-25', '25-50', '50-75', '75-100'] as const) {
      expect(ids(arrange(shelf, '', prefs({ bands: [band] }), context(positions)))).not.toContain(
        'never',
      )
    }
  })

  it('treats no bands as all of them, never as none', () => {
    expect(arrange(shelf, '', prefs({ bands: [] }), context(positions))).toHaveLength(5)
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

  it('does not sort the array it was given', () => {
    const shelf = [book('b', { title: 'b' }), book('a', { title: 'a' })]
    arrange(shelf, '', prefs({ sort: 'title-asc' }))
    expect(ids(shelf)).toEqual(['b', 'a'])
  })
})

/**
 * Unread and Finished are not rows anywhere — membership is worked out from the
 * reading positions every time the shelf is drawn. These tests are the guard on
 * that: a book "moves" between them because the answer changed, and nothing was
 * written down to be moved.
 */
describe('the Unread and Finished folders', () => {
  const shelf = [book('never'), book('midway'), book('done')]
  const started = [position('midway', '2026-02-01T00:00:00Z', 40)]
  const completed = [position('done', '2026-02-02T00:00:00Z', 100)]

  it('holds every book that has never been opened, under Unread', () => {
    const found = arrange(
      shelf,
      '',
      prefs({ folderId: UNREAD_FOLDER_ID }),
      context([...started, ...completed]),
    )
    expect(ids(found)).toEqual(['never'])
  })

  it('holds the finished books, and not the one halfway through', () => {
    const found = arrange(
      shelf,
      '',
      prefs({ folderId: FINISHED_FOLDER_ID }),
      context([...started, ...completed]),
    )
    expect(ids(found)).toEqual(['done'])
  })

  it('moves a book from Unread to Finished when it is finished, with nothing written', () => {
    const unread = prefs({ folderId: UNREAD_FOLDER_ID })
    const finished = prefs({ folderId: FINISHED_FOLDER_ID })
    const one = [book('b')]

    expect(ids(arrange(one, '', unread, context()))).toEqual(['b'])
    expect(ids(arrange(one, '', finished, context()))).toEqual([])

    // The *only* thing that changes is the reading position. The book itself is
    // the same object it was on the line above.
    const after = context([position('b', '2026-03-01T00:00:00Z', 100)])
    expect(ids(arrange(one, '', unread, after))).toEqual([])
    expect(ids(arrange(one, '', finished, after))).toEqual(['b'])
  })

  it('puts a book back in Unread when its place is reset', () => {
    const one = [book('b')]
    const reset = context()
    expect(ids(arrange(one, '', prefs({ folderId: UNREAD_FOLDER_ID }), reset))).toEqual(['b'])
    expect(ids(arrange(one, '', prefs({ folderId: FINISHED_FOLDER_ID }), reset))).toEqual([])
  })

  it('does not treat a system folder as one the reader can be filed into', () => {
    // A book carrying the id anyway — which nothing in the app can produce, and
    // which must not be honoured if it ever appeared.
    const forged = [book('forged', { folderIds: [FINISHED_FOLDER_ID] })]
    const found = arrange(forged, '', prefs({ folderId: FINISHED_FOLDER_ID }), context())
    expect(ids(found)).toEqual([])
  })
})
