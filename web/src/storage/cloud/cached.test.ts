// Must come first: installs a real IndexedDB implementation onto globals.
//
// The "cloud" here is a second real repository with a switch on it, not a mock.
// That is deliberate: what this file is testing is the *wrapper's* decisions —
// when to ask the network, when to answer from the copy, when to let an error
// through — and those are the same decisions whatever sits behind them. Whether
// the real cloud backend honours the interface is `cloudRepository`'s problem,
// and it is checked by the compiler against all 51 methods.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatAnchor, sectionPath } from '../../structure/index.ts'
import type {
  Anchor,
  BookId,
  BookMeta,
  ChapterIndex,
  Manifest,
  Section,
  SectionPath,
} from '../../structure/index.ts'
import { CloudError } from './client.ts'
import { createDb, type ReadingBuddyDB } from '../db.ts'
import { createRepository, type ParsedBook, type Repository } from '../repository.ts'
import { createCachedRepository, forgetFillsInFlight, looksOffline } from './cached.ts'

let dbCounter = 0
let cloudDb: ReadingBuddyDB
let cacheDb: ReadingBuddyDB
/** The far side, unwrapped — what the test uses to set the world up. */
let origin: Repository
let cache: Repository
/** The far side as the wrapper sees it: it stops answering when `signal` is off. */
let cloud: Repository
let repository: Repository
let signal: { up: boolean }

beforeEach(() => {
  dbCounter += 1
  cloudDb = createDb(`cached-cloud-${dbCounter}`)
  cacheDb = createDb(`cached-cache-${dbCounter}`)
  origin = createRepository(cloudDb)
  cache = createRepository(cacheDb)
  signal = { up: true }
  cloud = withSignal(origin, signal)
  repository = createCachedRepository(cloud, cache)
  forgetFillsInFlight()
})

afterEach(async () => {
  await Promise.all([cloudDb.delete(), cacheDb.delete()])
})

// --- Standing in for the network --------------------------------------------

/**
 * A repository that fails the way a phone with no bars fails.
 *
 * The error is shaped like the real one: a `CloudError` the reader could be
 * shown, wrapping the `TypeError` that `fetch` actually throws. Testing against
 * the wrapper alone would let a bug through where the wrapper stops keeping the
 * cause.
 */
function withSignal(base: Repository, state: { up: boolean }): Repository {
  return new Proxy(base, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return async (...args: unknown[]) => {
        if (!state.up) {
          throw new CloudError('Couldn’t reach your library.', {
            cause: new TypeError('Failed to fetch'),
          })
        }
        return (value as (...a: unknown[]) => unknown)(...args)
      }
    },
  }) as Repository
}

/** Waits for the background copy, which is started but never awaited. */
async function until(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for the offline copy')
}

// --- Fixtures ---------------------------------------------------------------

function bookId(value: string): BookId {
  return value as BookId
}

function makeBook(id: string, overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: bookId(id),
    title: `Book ${id}`,
    source: 'epub',
    type: 'dense-technical',
    importedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeSection(chapter: number, section: number, text: string): Section {
  return {
    chapter,
    section,
    path: sectionPath(chapter, section),
    paragraphs: [
      { anchor: formatAnchor({ chapter, section, paragraph: 1 }), text, kind: 'prose' },
    ],
  }
}

function makeChapter(chapter: number): ChapterIndex {
  return {
    chapter,
    title: `Chapter ${chapter}`,
    path: `ch0${chapter}` as ChapterIndex['path'],
    sections: [],
  }
}

function makeParsedBook(id: string, overrides: Partial<BookMeta> = {}): ParsedBook {
  const meta = makeBook(id, overrides)
  const manifest: Manifest = {
    bookId: meta.id,
    title: meta.title,
    chapters: [{ chapter: 1, title: 'Chapter 1', summary: 'The opening.' }],
  }
  return {
    meta,
    manifest,
    chapters: [makeChapter(1), makeChapter(2)],
    sections: [
      makeSection(1, 1, 'First section.'),
      makeSection(1, 2, 'Second section.'),
      makeSection(2, 1, 'Third section.'),
    ],
  }
}

/** A book in the cloud library, with everything a real one carries. */
async function inTheCloud(id: string, overrides: Partial<BookMeta> = {}): Promise<ParsedBook> {
  const book = makeParsedBook(id, overrides)
  await origin.saveParsedBook(book)
  return book
}

const path = (chapter: number, section: number): SectionPath => sectionPath(chapter, section)
const anchor = (chapter: number, section: number): Anchor =>
  formatAnchor({ chapter, section, paragraph: 1 })

/** Read one section, then wait for the copy that reading it starts. */
async function readAndCache(id: string): Promise<void> {
  await repository.getSection(bookId(id), path(1, 1))
  await until(async () => Boolean(await cache.getBook(bookId(id))))
  await until(async () => (await cache.listSections(bookId(id))).length === 3)
}

// --- Telling a lost signal from a real answer --------------------------------

describe('looksOffline', () => {
  it('recognises what fetch throws with nothing to connect to', () => {
    expect(looksOffline(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('recognises Safari’s wording, which is the iPhone case', () => {
    expect(looksOffline(new Error('Load failed'))).toBe(true)
  })

  it('recognises Firefox’s wording', () => {
    expect(looksOffline(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
  })

  it('looks past the reader-facing message into the cause', () => {
    const error = new CloudError('Couldn’t reach your library.', {
      cause: new TypeError('Failed to fetch'),
    })
    expect(looksOffline(error)).toBe(true)
  })

  it('says no to a real answer, so deleted books cannot come back', () => {
    expect(looksOffline(new CloudError('That book is no longer in your library.'))).toBe(false)
  })

  it('says no to nothing at all', () => {
    expect(looksOffline(undefined)).toBe(false)
    expect(looksOffline('some string')).toBe(false)
  })

  it('does not hang on a cause that points at itself', () => {
    const error = new Error('round') as Error & { cause?: unknown }
    error.cause = error
    expect(looksOffline(error)).toBe(false)
  })
})

// --- Which side answers ------------------------------------------------------

describe('while there is a signal', () => {
  it('answers from the cloud, not the copy', async () => {
    await inTheCloud('a', { title: 'The current title' })
    await cache.saveBook(makeBook('a', { title: 'A stale copy' }))

    const book = await repository.getBook(bookId('a'))

    expect(book?.title).toBe('The current title')
  })

  it('shows the cloud’s shelf even when the copy holds other books', async () => {
    await inTheCloud('a')
    await cache.saveBook(makeBook('ghost'))

    const titles = (await repository.listBooks()).map((book) => book.title)

    expect(titles).toEqual(['Book a'])
  })
})

describe('when the signal is gone', () => {
  it('reads the book from the copy', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    signal.up = false

    const section = await repository.getSection(bookId('a'), path(1, 1))
    expect(section?.paragraphs[0]?.text).toBe('First section.')
  })

  it('still knows the shelf, the contents and the chapters', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    signal.up = false

    expect((await repository.listBooks()).map((book) => book.title)).toEqual(['Book a'])
    expect((await repository.getManifest(bookId('a')))?.title).toBe('Book a')
    expect(await repository.listChapterIndexes(bookId('a'))).toHaveLength(2)
    expect(await repository.countSections(bookId('a'))).toBe(3)
  })

  it('finds the section an anchor points into', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    signal.up = false

    const section = await repository.getSectionByAnchor(bookId('a'), anchor(2, 1))
    expect(section?.paragraphs[0]?.text).toBe('Third section.')
  })

  it('serves the pictures from the copy', async () => {
    await inTheCloud('a')
    await origin.saveAssets(bookId('a'), [
      { path: 'images/plate-1.png', data: new Blob(['plate one']) },
    ])
    await readAndCache('a')

    signal.up = false

    expect(await repository.listAssetPaths(bookId('a'))).toEqual(['images/plate-1.png'])
    const found = await repository.getAssets(bookId('a'), ['images/plate-1.png'])
    expect(await found.get('images/plate-1.png')?.text()).toBe('plate one')
  })

  it('remembers where the reader was, and what they marked', async () => {
    await inTheCloud('a')
    await origin.savePosition(bookId('a'), anchor(2, 1), 60)
    await origin.addQuote(bookId('a'), 'A line worth keeping.')
    await origin.addBookmark(bookId('a'), anchor(1, 2), 'Come back here')
    await readAndCache('a')

    signal.up = false

    expect((await repository.getPosition(bookId('a')))?.percent).toBe(60)
    expect((await repository.listQuotes(bookId('a')))[0]?.text).toBe('A line worth keeping.')
    expect((await repository.listBookmarks(bookId('a')))[0]?.label).toBe('Come back here')
  })

  it('keeps books on the shelves the reader filed them under', async () => {
    const folder = await origin.createFolder('Philosophy')
    await inTheCloud('a', { folderIds: [folder!.id] })
    await readAndCache('a')

    signal.up = false

    const folders = await repository.listFolders()
    expect(folders.map((each) => each.name)).toEqual(['Philosophy'])
    const book = await repository.getBook(bookId('a'))
    expect(book?.folderIds).toEqual([folders[0]!.id])
  })

  it('shows nothing for a book that was never opened', async () => {
    await inTheCloud('a')

    signal.up = false

    expect(await repository.listBooks()).toEqual([])
    expect(await repository.getManifest(bookId('a'))).toBeUndefined()
  })
})

// --- The line between "no signal" and "no" ----------------------------------

describe('a real error is not a lost signal', () => {
  it('lets the error through instead of answering from the copy', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    const refusing = createCachedRepository(
      {
        ...origin,
        async getManifest() {
          throw new CloudError('That book is no longer in your library.')
        },
      },
      cache,
    )

    await expect(refusing.getManifest(bookId('a'))).rejects.toThrow('no longer in your library')
  })
})

// --- Filling the copy --------------------------------------------------------

describe('keeping a book offline', () => {
  it('copies the whole book the first time it is read', async () => {
    await inTheCloud('a')

    expect(await cache.listBooks()).toEqual([])
    await readAndCache('a')

    expect((await cache.listBooks()).map((book) => book.title)).toEqual(['Book a'])
    expect(await cache.listSections(bookId('a'))).toHaveLength(3)
    expect(await cache.listChapterIndexes(bookId('a'))).toHaveLength(2)
    expect(await cache.getManifest(bookId('a'))).toBeDefined()
  })

  it('does not copy a book merely because the shelf listed it', async () => {
    await inTheCloud('a')
    await inTheCloud('b')

    await repository.listBooks()
    await repository.getBook(bookId('a'))
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(await cache.listBooks()).toEqual([])
  })

  it('does not copy again on the next page turn', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    // Change the far side, then read on. A second copy would overwrite this.
    await cache.renameBook(bookId('a'), 'Proof this was not rewritten')
    await repository.getSection(bookId('a'), path(1, 2))
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect((await cache.getBook(bookId('a')))?.title).toBe('Proof this was not rewritten')
  })

  it('does not start a second copy while the first is running', async () => {
    await inTheCloud('a')

    await Promise.all([
      repository.getSection(bookId('a'), path(1, 1)),
      repository.getSection(bookId('a'), path(1, 2)),
      repository.getSection(bookId('a'), path(2, 1)),
    ])
    await until(async () => Boolean(await cache.getBook(bookId('a'))))

    expect(await cache.listBooks()).toHaveLength(1)
    expect(await cache.listSections(bookId('a'))).toHaveLength(3)
  })

  it('never lets a failed copy reach the reader', async () => {
    await inTheCloud('a')
    const breaking = createCachedRepository(cloud, {
      ...cache,
      async saveParsedBook() {
        throw new Error('the copy went wrong')
      },
    })

    const section = await breaking.getSection(bookId('a'), path(1, 1))

    expect(section?.paragraphs[0]?.text).toBe('First section.')
  })
})

// --- What offline still cannot do -------------------------------------------

describe('writing still needs a signal', () => {
  it('refuses rather than pretending a bookmark was saved', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    signal.up = false

    await expect(repository.addBookmark(bookId('a'), anchor(1, 1), 'On the train')).rejects.toThrow(
      'Couldn’t reach your library',
    )
    await expect(repository.savePosition(bookId('a'), anchor(1, 2), 20)).rejects.toThrow(
      'Couldn’t reach your library',
    )
  })

  it('refuses to delete a book', async () => {
    await inTheCloud('a')
    await readAndCache('a')

    signal.up = false

    await expect(repository.deleteBook(bookId('a'))).rejects.toThrow('Couldn’t reach your library')
  })
})
