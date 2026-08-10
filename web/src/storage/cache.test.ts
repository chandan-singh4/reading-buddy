// Must come first: installs a real IndexedDB implementation onto globals.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatAnchor, sectionPath } from '../structure/index.ts'
import type { BookId, BookMeta, ChapterIndex, Manifest, Section } from '../structure/index.ts'
import {
  evictLeastRecent,
  evictOverflow,
  forgetCachedBooks,
  looksFull,
  touchCachedBook,
} from './cache.ts'
import { createDb, type ReadingBuddyDB } from './db.ts'
import { createRepository, type ParsedBook, type Repository } from './repository.ts'

let dbCounter = 0
let db: ReadingBuddyDB
let cache: Repository

/** The test environment is Node, which has no `localStorage` of its own. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage
}

beforeEach(() => {
  dbCounter += 1
  db = createDb(`cache-keeping-${dbCounter}`)
  cache = createRepository(db)
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

// --- Fixtures ---------------------------------------------------------------

function bookId(value: string): BookId {
  return value as BookId
}

function makeParsedBook(id: string): ParsedBook {
  const meta: BookMeta = {
    id: bookId(id),
    title: `Book ${id}`,
    source: 'epub',
    type: 'dense-technical',
    importedAt: '2026-08-01T10:00:00.000Z',
  }
  const manifest: Manifest = {
    bookId: meta.id,
    title: meta.title,
    chapters: [{ chapter: 1, title: 'Chapter 1', summary: 'The opening.' }],
  }
  const chapters: ChapterIndex[] = [
    { chapter: 1, title: 'Chapter 1', path: 'ch01' as ChapterIndex['path'], sections: [] },
  ]
  const sections: Section[] = [
    {
      chapter: 1,
      section: 1,
      path: sectionPath(1, 1),
      paragraphs: [
        {
          anchor: formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
          text: 'Some words.',
          kind: 'prose',
        },
      ],
    },
  ]
  return { meta, manifest, chapters, sections }
}

/**
 * A plausible "now". Every offset below is measured from it, and it has to be a
 * real-looking clock reading rather than a small number: `touchCachedBook`
 * throttles against `0` for a book it has never seen, so a read "at 1,000" is a
 * book read one second after 1970 — indistinguishable from a repeat within the
 * minute, and correctly ignored.
 */
const NOW = 1_700_000_000_000

/** A book in the offline copy, last read `readAt` ms into the run. */
async function cached(id: string, readAt: number): Promise<void> {
  await cache.saveParsedBook(makeParsedBook(id))
  touchCachedBook(bookId(id), NOW + readAt)
}

/** The same book opened again, `after` ms into the run. */
function reread(id: string, after: number): void {
  touchCachedBook(bookId(id), NOW + after)
}

const titles = async (): Promise<string[]> =>
  (await cache.listBooks()).map((book) => book.title).sort()

// --- Remembering what was read when -----------------------------------------

describe('touchCachedBook', () => {
  it('does not write again for a book read a moment ago', async () => {
    await cached('a', 0)
    await cached('b', 10)

    // Within the minute, so this is ignored — 'a' stays the older of the two.
    reread('a', 5_000)

    expect(await evictOverflow(cache, 1)).toEqual([bookId('a')])
  })

  it('writes again once a minute has passed', async () => {
    await cached('a', 0)
    await cached('b', 10)

    reread('a', 61_000)

    expect(await evictOverflow(cache, 1)).toEqual([bookId('b')])
  })

  it('survives a browser that refuses local storage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied in private mode')
      },
      setItem: () => {
        throw new Error('denied in private mode')
      },
    })

    await cache.saveParsedBook(makeParsedBook('a'))
    expect(() => touchCachedBook(bookId('a'))).not.toThrow()
    // Without a reading order every book looks equally old, so eviction still
    // works — it just picks arbitrarily, which is the right way to degrade.
    expect(await evictOverflow(cache, 0)).toEqual([bookId('a')])
  })

  it('ignores a corrupt record rather than failing the page turn', async () => {
    localStorage.setItem('rb.cache.read', 'not json at all')

    await cache.saveParsedBook(makeParsedBook('a'))
    expect(() => touchCachedBook(bookId('a'))).not.toThrow()
    expect(await titles()).toEqual(['Book a'])
  })
})

// --- Dropping the oldest -----------------------------------------------------

describe('evictOverflow', () => {
  it('drops nothing while there is room', async () => {
    await cached('a', 1)
    await cached('b', 2)

    expect(await evictOverflow(cache, 5)).toEqual([])
    expect(await titles()).toEqual(['Book a', 'Book b'])
  })

  it('drops the least recently read first', async () => {
    await cached('old', 1_000)
    await cached('newer', 2_000)
    await cached('newest', 3_000)

    expect(await evictOverflow(cache, 2)).toEqual([bookId('old')])
    expect(await titles()).toEqual(['Book newer', 'Book newest'])
  })

  it('drops as many as it takes to get under the limit', async () => {
    await cached('a', 1_000)
    await cached('b', 2_000)
    await cached('c', 3_000)
    await cached('d', 4_000)

    expect(await evictOverflow(cache, 2)).toEqual([bookId('a'), bookId('b')])
    expect(await titles()).toEqual(['Book c', 'Book d'])
  })

  it('drops a book with no record before one that has been read', async () => {
    await cache.saveParsedBook(makeParsedBook('never-opened'))
    await cached('read-once', 1_000)

    expect(await evictOverflow(cache, 1)).toEqual([bookId('never-opened')])
  })

  it('takes the whole book with it, not just the row on the shelf', async () => {
    await cached('a', 1_000)
    await cache.saveAssets(bookId('a'), [
      { path: 'images/plate.png', data: new Blob(['a plate']) },
    ])
    await cached('b', 2_000)

    await evictOverflow(cache, 1)

    expect(await cache.listSections(bookId('a'))).toEqual([])
    expect(await cache.getManifest(bookId('a'))).toBeUndefined()
    expect(await cache.listAssetPaths(bookId('a'))).toEqual([])
  })

  it('forgets the bookkeeping too, so a re-read book starts fresh', async () => {
    await cached('a', 1_000)
    await cached('b', 2_000)
    await evictOverflow(cache, 1)

    // Back again later, and read *before* b was. It should still outlive b,
    // because the record eviction left behind must not be the old one.
    await cached('a', 3_000)

    expect(await evictOverflow(cache, 1)).toEqual([bookId('b')])
  })
})

describe('evictLeastRecent', () => {
  it('drops one whatever the count', async () => {
    await cached('a', 1_000)
    await cached('b', 2_000)

    expect(await evictLeastRecent(cache)).toEqual([bookId('a')])
    expect(await titles()).toEqual(['Book b'])
  })

  it('does nothing when there is nothing to drop', async () => {
    expect(await evictLeastRecent(cache)).toEqual([])
  })
})

describe('forgetCachedBooks', () => {
  it('does nothing when handed nothing', () => {
    expect(() => forgetCachedBooks([])).not.toThrow()
  })
})

// --- Telling "out of room" from everything else ------------------------------

describe('looksFull', () => {
  it('recognises the browser refusing a write for want of room', () => {
    expect(looksFull(new DOMException('over quota', 'QuotaExceededError'))).toBe(true)
  })

  it('recognises Firefox’s name for it', () => {
    expect(looksFull({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
  })

  it('looks past a wrapper into the cause', () => {
    const wrapped = new Error('The copy failed.', {
      cause: new DOMException('over quota', 'QuotaExceededError'),
    })
    expect(looksFull(wrapped)).toBe(true)
  })

  it('says no to an ordinary failure', () => {
    expect(looksFull(new TypeError('Failed to fetch'))).toBe(false)
    expect(looksFull(undefined)).toBe(false)
  })

  it('does not hang on a cause that points at itself', () => {
    const error = new Error('round') as Error & { cause?: unknown }
    error.cause = error
    expect(looksFull(error)).toBe(false)
  })
})
