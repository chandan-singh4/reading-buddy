// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_PREFS,
  isFiltered,
  readLibraryPrefs,
  writeLibraryPrefs,
  type LibraryPrefs,
} from './prefs.ts'
import { progressMap, progressOf } from './status.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import type { ReadingPosition } from '../storage/index.ts'

const KEY = 'reading-buddy:library-prefs'

beforeEach(() => {
  localStorage.clear()
})

describe('library preferences', () => {
  it('defaults when nothing has been saved', () => {
    expect(readLibraryPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('survives a round trip', () => {
    const prefs: LibraryPrefs = {
      view: 'grid',
      statuses: ['reading'],
      shelves: ['paper'],
      folderId: 'f1',
      sort: 'title-asc',
    }
    writeLibraryPrefs(prefs)
    expect(readLibraryPrefs()).toEqual(prefs)
  })

  it('falls back one field at a time rather than resetting everything', () => {
    localStorage.setItem(KEY, JSON.stringify({ view: 'grid', sort: 'not-a-sort' }))
    const prefs = readLibraryPrefs()
    expect(prefs.view).toBe('grid')
    expect(prefs.sort).toBe(DEFAULT_PREFS.sort)
  })

  it('keeps only the filter values it recognises', () => {
    localStorage.setItem(KEY, JSON.stringify({ statuses: ['reading', 'abandoned'] }))
    expect(readLibraryPrefs().statuses).toEqual(['reading'])
  })

  it('survives malformed JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readLibraryPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('knows when something is narrowing the library', () => {
    expect(isFiltered(DEFAULT_PREFS)).toBe(false)
    expect(isFiltered({ ...DEFAULT_PREFS, statuses: ['unread'] })).toBe(true)
    expect(isFiltered({ ...DEFAULT_PREFS, folderId: 'f1' })).toBe(true)
    // Sorting is not filtering — the same books, in another order.
    expect(isFiltered({ ...DEFAULT_PREFS, sort: 'title-asc' })).toBe(false)
  })
})

function book(id: string): BookMeta {
  return {
    id: id as BookId,
    title: id,
    source: 'epub',
    type: 'light-fiction',
    importedAt: '2026-01-01T00:00:00Z',
  }
}

function position(bookId: string, percent?: number): ReadingPosition {
  return {
    bookId: bookId as BookId,
    anchor: '[ch01-s01-p001]' as ReadingPosition['anchor'],
    at: '2026-08-01T00:00:00Z',
    ...(percent === undefined ? {} : { percent }),
  }
}

describe('reading status', () => {
  it('counts a book never opened as unread', () => {
    expect(progressOf(book('a'), progressMap([])).status).toBe('unread')
  })

  it('counts 100% as finished and anything below it as reading', () => {
    const progress = progressMap([position('done', 100), position('nearly', 99)])
    expect(progressOf(book('done'), progress).status).toBe('finished')
    expect(progressOf(book('nearly'), progress).status).toBe('reading')
  })

  it('counts an opened book with no percent as reading, not as 0%', () => {
    const entry = progressOf(book('a'), progressMap([position('a')]))
    expect(entry.status).toBe('reading')
    expect(entry.percent).toBeUndefined()
  })
})
