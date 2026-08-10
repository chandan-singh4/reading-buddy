// Must come first: installs a real IndexedDB implementation onto globals.
//
// These tests copy between *two real repositories*, not between mocks. Both
// backends satisfy one interface, so a device-to-device copy exercises every
// line the device-to-cloud copy will — the ordering, the folder remapping, the
// skip rule — without needing a network or a Supabase project. What it cannot
// prove is that the cloud backend honours the same contract; that is what
// `repository.test.ts` and the cloud's own tests are for.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatAnchor, sectionPath } from '../structure/index.ts'
import type { Anchor, BookId, BookMeta, ChapterIndex, Manifest, Section } from '../structure/index.ts'
import { createDb, type ReadingBuddyDB } from './db.ts'
import { createRepository, type ParsedBook, type Repository } from './repository.ts'
import { copyLibrary, countBooksToCopy } from './transfer.ts'

let dbCounter = 0
let fromDb: ReadingBuddyDB
let toDb: ReadingBuddyDB
let from: Repository
let to: Repository

beforeEach(() => {
  dbCounter += 1
  fromDb = createDb(`transfer-from-${dbCounter}`)
  toDb = createDb(`transfer-to-${dbCounter}`)
  from = createRepository(fromDb)
  to = createRepository(toDb)
})

afterEach(async () => {
  await Promise.all([fromDb.delete(), toDb.delete()])
})

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

/** A book on the source shelf with everything a real one carries. */
async function shelve(id: string, overrides: Partial<BookMeta> = {}): Promise<ParsedBook> {
  const book = makeParsedBook(id, overrides)
  await from.saveParsedBook(book)
  return book
}

const anchor = (chapter: number, section: number): Anchor =>
  formatAnchor({ chapter, section, paragraph: 1 })

// --- Tests ------------------------------------------------------------------

describe('copying a whole book', () => {
  it('brings the book, its contents page, its chapters and its text', async () => {
    const book = await shelve('a')

    const result = await copyLibrary(from, to)

    expect(result).toMatchObject({ copied: 1, skipped: 0, cancelled: false })
    expect(result.failed).toEqual([])
    expect(await to.getBook(book.meta.id)).toEqual(book.meta)
    expect(await to.getManifest(book.meta.id)).toEqual(book.manifest)
    expect((await to.listChapterIndexes(book.meta.id)).map((c) => c.chapter)).toEqual([1, 2])
    expect((await to.listSections(book.meta.id)).map((s) => s.path)).toEqual([
      sectionPath(1, 1),
      sectionPath(1, 2),
      sectionPath(2, 1),
    ])
  })

  // The id travelling with the book is what makes a second run a no-op rather
  // than a duplicate shelf — the whole resume story rests on it.
  it('keeps the book’s id rather than minting a new one', async () => {
    await shelve('a')
    await copyLibrary(from, to)
    expect((await to.listBooks()).map((b) => b.id)).toEqual(['a'])
  })

  it('brings the pictures across', async () => {
    await shelve('a')
    await from.saveAssets(bookId('a'), [
      { path: 'images/cover.jpg', data: new Blob(['cover-bytes']) },
      { path: 'images/plate-1.png', data: new Blob(['plate-bytes']) },
    ])

    await copyLibrary(from, to)

    const paths = (await to.listAssetPaths(bookId('a'))).sort()
    expect(paths).toEqual(['images/cover.jpg', 'images/plate-1.png'])
    const found = await to.getAssets(bookId('a'), paths)
    expect(await found.get('images/cover.jpg')?.text()).toBe('cover-bytes')
  })

  it('brings the file the book was imported from', async () => {
    await shelve('a')
    await from.saveSource(bookId('a'), new Blob(['epub-bytes']), 'jung.epub')

    await copyLibrary(from, to)

    const source = await to.getSource(bookId('a'))
    expect(source?.filename).toBe('jung.epub')
    expect(await source?.file.text()).toBe('epub-bytes')
  })

  it('brings where the reader had got to', async () => {
    await shelve('a')
    await from.savePosition(bookId('a'), anchor(2, 1), 62)

    await copyLibrary(from, to)

    const position = await to.getPosition(bookId('a'))
    expect(position?.anchor).toBe(anchor(2, 1))
    expect(position?.percent).toBe(62)
  })

  it('brings the reader’s quotes and bookmarks', async () => {
    await shelve('a')
    await from.addQuote(bookId('a'), 'The privilege of a lifetime.')
    await from.addBookmark(bookId('a'), anchor(1, 2), 'Second section')

    await copyLibrary(from, to)

    expect((await to.listQuotes(bookId('a'))).map((q) => q.text)).toEqual([
      'The privilege of a lifetime.',
    ])
    const bookmarks = await to.listBookmarks(bookId('a'))
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0]).toMatchObject({ anchor: anchor(1, 2), label: 'Second section' })
  })
})

describe('folders', () => {
  it('recreates the folders and re-points the books at them', async () => {
    const folder = await from.createFolder('Philosophy')
    await shelve('a', { folderIds: [folder!.id] })

    await copyLibrary(from, to)

    const [copied] = await to.listFolders()
    expect(copied?.name).toBe('Philosophy')
    // The id is the *target's*, not the source's — that is the remapping.
    expect((await to.getBook(bookId('a')))?.folderIds).toEqual([copied?.id])
  })

  it('reuses a folder of the same name instead of making a second one', async () => {
    const folder = await from.createFolder('Philosophy')
    await to.createFolder('philosophy')
    await shelve('a', { folderIds: [folder!.id] })

    await copyLibrary(from, to)

    expect(await to.listFolders()).toHaveLength(1)
    expect((await to.getBook(bookId('a')))?.folderIds).toHaveLength(1)
  })

  it('lands a book loose rather than carrying a folder id that means nothing', async () => {
    // A book filed in a folder the source no longer has — the id would
    // otherwise arrive pointing at a folder that has never existed over there.
    await shelve('a', { folderIds: ['ghost-folder'] })

    await copyLibrary(from, to)

    expect('folderIds' in (await to.getBook(bookId('a')))!).toBe(false)
  })
})

describe('running it twice', () => {
  it('skips what is already there rather than copying it again', async () => {
    await shelve('a')
    await shelve('b')

    await copyLibrary(from, to)
    const second = await copyLibrary(from, to)

    expect(second).toMatchObject({ copied: 0, skipped: 2 })
    expect(await to.listBooks()).toHaveLength(2)
  })

  // The resume story: the run that dropped out at book two picks up at book two.
  it('copies only what is missing after a run that stopped part-way', async () => {
    await shelve('a')
    await shelve('b')
    await shelve('c')

    const controller = new AbortController()
    await copyLibrary(from, to, {
      signal: controller.signal,
      onProgress: ({ done }) => {
        if (done === 1) controller.abort()
      },
    })
    expect(await to.listBooks()).toHaveLength(1)

    const resumed = await copyLibrary(from, to)
    expect(resumed).toMatchObject({ copied: 2, skipped: 1 })
    expect(await to.listBooks()).toHaveLength(3)
  })

  it('treats the same file imported separately on both sides as already there', async () => {
    await shelve('here', { contentHash: 'sha-jung' })
    await to.saveParsedBook(makeParsedBook('there', { contentHash: 'sha-jung' }))

    const result = await copyLibrary(from, to)

    expect(result).toMatchObject({ copied: 0, skipped: 1 })
    expect(await to.listBooks()).toHaveLength(1)
  })

  it('sends the same file only once when the source shelf holds it twice', async () => {
    await shelve('a', { contentHash: 'sha-same' })
    await shelve('b', { contentHash: 'sha-same' })

    const result = await copyLibrary(from, to)

    expect(result).toMatchObject({ copied: 1, skipped: 1 })
  })
})

describe('when something goes wrong', () => {
  it('records the bad book and keeps going with the rest', async () => {
    await shelve('good-1')
    // A book with no contents page — the shape a half-finished import leaves.
    await from.saveBook(makeBook('broken'))
    await shelve('good-2')

    const result = await copyLibrary(from, to)

    expect(result.copied).toBe(2)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.title).toBe('Book broken')
    expect((await to.listBooks()).map((b) => b.id).sort()).toEqual(['good-1', 'good-2'])
  })

  it('still delivers the book when only the kept file fails', async () => {
    await shelve('a')
    await from.saveSource(bookId('a'), new Blob(['epub-bytes']), 'jung.epub')
    vi.spyOn(to, 'saveSource').mockRejectedValue(new Error('out of room'))

    const result = await copyLibrary(from, to)

    // The book matters and the file is a convenience.
    expect(result).toMatchObject({ copied: 1 })
    expect(result.failed).toEqual([])
    expect(await to.getBook(bookId('a'))).toBeDefined()
    expect(await to.getSource(bookId('a'))).toBeUndefined()
  })
})

describe('stopping it', () => {
  it('keeps the books already copied and says it was stopped', async () => {
    await shelve('a')
    await shelve('b')
    await shelve('c')

    const controller = new AbortController()
    const result = await copyLibrary(from, to, {
      signal: controller.signal,
      onProgress: ({ done }) => {
        if (done === 2) controller.abort()
      },
    })

    expect(result).toMatchObject({ copied: 2, cancelled: true })
    expect(await to.listBooks()).toHaveLength(2)
  })

  it('does nothing at all when stopped before it starts', async () => {
    await shelve('a')
    const controller = new AbortController()
    controller.abort()

    const result = await copyLibrary(from, to, { signal: controller.signal })

    expect(result).toMatchObject({ copied: 0, cancelled: true })
    expect(await to.listBooks()).toEqual([])
  })
})

describe('progress', () => {
  it('reports once per book, counting skipped ones too', async () => {
    await shelve('a')
    await shelve('b')
    await to.saveParsedBook(makeParsedBook('a'))

    const seen: number[] = []
    await copyLibrary(from, to, { onProgress: ({ done, total }) => seen.push(done / total) })

    expect(seen).toEqual([0.5, 1])
  })

  it('names the book it just finished', async () => {
    await shelve('a')
    const titles: string[] = []
    await copyLibrary(from, to, { onProgress: ({ title }) => titles.push(title) })
    expect(titles).toEqual(['Book a'])
  })
})

describe('countBooksToCopy', () => {
  it('counts what is missing on the far side, not what is there', async () => {
    await shelve('a')
    await shelve('b')
    await to.saveParsedBook(makeParsedBook('a'))

    expect(await countBooksToCopy(from, to)).toBe(1)
  })

  it('is zero for an empty shelf and zero once everything has been copied', async () => {
    expect(await countBooksToCopy(from, to)).toBe(0)
    await shelve('a')
    await copyLibrary(from, to)
    expect(await countBooksToCopy(from, to)).toBe(0)
  })
})

describe('it only ever adds', () => {
  it('leaves books the target already had alone', async () => {
    await shelve('mine')
    await to.saveParsedBook(makeParsedBook('theirs'))

    await copyLibrary(from, to)

    expect((await to.listBooks()).map((b) => b.id).sort()).toEqual(['mine', 'theirs'])
  })

  it('leaves the source shelf exactly as it found it', async () => {
    await shelve('a')
    await from.saveSource(bookId('a'), new Blob(['epub-bytes']), 'jung.epub')

    await copyLibrary(from, to)

    expect(await from.listBooks()).toHaveLength(1)
    expect(await from.getSource(bookId('a'))).toBeDefined()
    expect(await from.listSections(bookId('a'))).toHaveLength(3)
  })

  // Direction is not a parameter and not a branch — it is which way round the
  // two arguments go. This is the test that says so.
  it('works the same way back', async () => {
    await to.saveParsedBook(makeParsedBook('from-the-cloud'))

    const result = await copyLibrary(to, from)

    expect(result).toMatchObject({ copied: 1 })
    expect(await from.getBook(bookId('from-the-cloud'))).toBeDefined()
  })
})
