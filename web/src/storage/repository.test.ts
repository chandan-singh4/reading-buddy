// Must come first: installs a real IndexedDB implementation onto globals so
// these tests exercise the actual database rather than a mock of one.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AnchorError, formatAnchor, sectionPath } from '../structure/index.ts'
import type {
  BookId,
  BookMeta,
  ChapterIndex,
  Manifest,
  Section,
} from '../structure/index.ts'
import { createDb, type ReadingBuddyDB } from './db.ts'
import { createRepository, type ParsedBook, type Repository } from './repository.ts'

let dbCounter = 0
let db: ReadingBuddyDB
let repo: Repository

beforeEach(() => {
  // A scratch database per test — no shared state to leak between them.
  dbCounter += 1
  db = createDb(`reading-buddy-test-${dbCounter}`)
  repo = createRepository(db)
})

afterEach(async () => {
  await db.delete()
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

function makeParsedBook(id: string): ParsedBook {
  const meta = makeBook(id)
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

// --- Tests ------------------------------------------------------------------

describe('books', () => {
  it('round-trips a book', async () => {
    const book = makeBook('a')
    await repo.saveBook(book)
    expect(await repo.getBook(book.id)).toEqual(book)
  })

  it('returns undefined for a book that was never saved', async () => {
    expect(await repo.getBook(bookId('missing'))).toBeUndefined()
  })

  it('upserts rather than duplicating on re-save', async () => {
    await repo.saveBook(makeBook('a'))
    await repo.saveBook(makeBook('a', { title: 'Renamed' }))

    const books = await repo.listBooks()
    expect(books).toHaveLength(1)
    expect(books[0]?.title).toBe('Renamed')
  })

  it('lists newest import first', async () => {
    await repo.saveBook(makeBook('old', { importedAt: '2026-01-01T00:00:00.000Z' }))
    await repo.saveBook(makeBook('new', { importedAt: '2026-08-01T00:00:00.000Z' }))
    await repo.saveBook(makeBook('mid', { importedAt: '2026-04-01T00:00:00.000Z' }))

    expect((await repo.listBooks()).map((b) => b.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('saveParsedBook', () => {
  it('writes metadata, manifest, chapters and sections together', async () => {
    const parsed = makeParsedBook('a')
    await repo.saveParsedBook(parsed)

    expect(await repo.getBook(parsed.meta.id)).toEqual(parsed.meta)
    expect(await repo.getManifest(parsed.meta.id)).toEqual(parsed.manifest)
    expect(await repo.countSections(parsed.meta.id)).toBe(3)

    const chapter = await repo.getChapterIndex(parsed.meta.id, 2)
    expect(chapter?.title).toBe('Chapter 2')
  })
})

describe('section retrieval', () => {
  it('fetches exactly one section by its address', async () => {
    const parsed = makeParsedBook('a')
    await repo.saveParsedBook(parsed)

    const section = await repo.getSection(parsed.meta.id, sectionPath(1, 2))
    expect(section?.paragraphs[0]?.text).toBe('Second section.')
  })

  it('resolves an anchor to the section that contains it', async () => {
    const parsed = makeParsedBook('a')
    await repo.saveParsedBook(parsed)

    const section = await repo.getSectionByAnchor(parsed.meta.id, '[ch02-s01-p001]')
    expect(section?.paragraphs[0]?.text).toBe('Third section.')
  })

  it('throws on a malformed anchor instead of silently missing', async () => {
    await expect(
      repo.getSectionByAnchor(bookId('a'), '[ch2-s1-p1]'),
    ).rejects.toThrow(AnchorError)
  })

  it('keeps sections of different books apart', async () => {
    await repo.saveParsedBook(makeParsedBook('a'))
    await repo.saveParsedBook(makeParsedBook('b'))

    // Same address in both books must not collide.
    expect(await repo.countSections(bookId('a'))).toBe(3)
    expect(await repo.countSections(bookId('b'))).toBe(3)
  })

  it('bulk-writes sections', async () => {
    const sections = Array.from({ length: 250 }, (_, i) =>
      makeSection(1, i + 1, `Section ${i + 1}`),
    )
    await repo.saveSections(bookId('a'), sections)

    expect(await repo.countSections(bookId('a'))).toBe(250)
    const one = await repo.getSection(bookId('a'), sectionPath(1, 199))
    expect(one?.paragraphs[0]?.text).toBe('Section 199')
  })
})

describe('deleteBook', () => {
  it('cascades to manifest, chapters and sections', async () => {
    const parsed = makeParsedBook('a')
    await repo.saveParsedBook(parsed)
    await repo.deleteBook(parsed.meta.id)

    expect(await repo.getBook(parsed.meta.id)).toBeUndefined()
    expect(await repo.getManifest(parsed.meta.id)).toBeUndefined()
    expect(await repo.getChapterIndex(parsed.meta.id, 1)).toBeUndefined()
    expect(await repo.countSections(parsed.meta.id)).toBe(0)
  })

  it('leaves other books untouched', async () => {
    await repo.saveParsedBook(makeParsedBook('a'))
    await repo.saveParsedBook(makeParsedBook('b'))

    await repo.deleteBook(bookId('a'))

    expect(await repo.getBook(bookId('b'))).toBeDefined()
    expect(await repo.countSections(bookId('b'))).toBe(3)
  })

  it('is a no-op for a book that does not exist', async () => {
    await expect(repo.deleteBook(bookId('ghost'))).resolves.toBeUndefined()
  })
})

describe('backfilling word counts', () => {
  /**
   * A book as it was written before word counts existed: no `words` anywhere,
   * and section text whose length is known so the counts can be checked.
   */
  async function saveCountlessBook(id: string): Promise<BookId> {
    const meta = makeBook(id)
    await repo.saveParsedBook({
      meta,
      manifest: {
        bookId: meta.id,
        title: meta.title,
        chapters: [
          { chapter: 1, title: 'Chapter 1', summary: '' },
          { chapter: 2, title: 'Chapter 2', summary: '' },
        ],
      },
      chapters: [
        {
          chapter: 1,
          title: 'Chapter 1',
          path: 'ch01' as ChapterIndex['path'],
          sections: [
            { section: 1, path: sectionPath(1, 1) },
            { section: 2, path: sectionPath(1, 2) },
          ],
        },
        {
          chapter: 2,
          title: 'Chapter 2',
          path: 'ch02' as ChapterIndex['path'],
          sections: [{ section: 1, path: sectionPath(2, 1) }],
        },
      ],
      sections: [
        makeSection(1, 1, 'one two three'),
        makeSection(1, 2, 'four five'),
        makeSection(2, 1, 'six'),
      ],
    })
    return meta.id
  }

  it('fills in every section and totals them per chapter', async () => {
    const id = await saveCountlessBook('a')

    const manifest = await repo.backfillWordCounts(id)
    expect(manifest?.chapters.map((chapter) => chapter.words)).toEqual([5, 1])

    const indexes = await repo.listChapterIndexes(id)
    expect(indexes.map((index) => index.sections.map((entry) => entry.words))).toEqual([
      [3, 2],
      [1],
    ])
  })

  it('persists what it worked out, so it only ever runs once', async () => {
    const id = await saveCountlessBook('a')
    await repo.backfillWordCounts(id)

    // The stored manifest, not the returned one — the second run must find
    // nothing to do, which is what stops this being a cost on every open.
    expect((await repo.getManifest(id))?.chapters[0]?.words).toBe(5)
    expect(await repo.backfillWordCounts(id)).toBeUndefined()
  })

  it('leaves a book that already has counts entirely alone', async () => {
    const book = makeParsedBook('a')
    await repo.saveParsedBook({
      ...book,
      manifest: {
        ...book.manifest,
        chapters: [{ chapter: 1, title: 'Chapter 1', summary: '', words: 999 }],
      },
    })

    expect(await repo.backfillWordCounts(book.meta.id)).toBeUndefined()
    expect((await repo.getManifest(book.meta.id))?.chapters[0]?.words).toBe(999)
  })

  it('does nothing for a book that is not there', async () => {
    expect(await repo.backfillWordCounts(bookId('ghost'))).toBeUndefined()
  })

  it('refuses to resurrect a book deleted while it was counting', async () => {
    // The real sequence: open a long book, back out, delete it before the
    // migration lands. Writing anyway would leave a manifest and chapter
    // indexes behind for a book `deleteBook` had already cascaded away.
    const id = await saveCountlessBook('a')
    await repo.deleteBook(id)

    expect(await repo.backfillWordCounts(id)).toBeUndefined()
    expect(await repo.getManifest(id)).toBeUndefined()
    expect(await repo.listChapterIndexes(id)).toEqual([])
  })
})

describe('listing chapter indexes', () => {
  it('returns them in chapter order', async () => {
    const book = makeParsedBook('a')
    await repo.saveParsedBook({ ...book, chapters: [makeChapter(2), makeChapter(1)] })

    expect((await repo.listChapterIndexes(book.meta.id)).map((index) => index.chapter)).toEqual([
      1, 2,
    ])
  })

  it('returns nothing for a book with no chapters', async () => {
    expect(await repo.listChapterIndexes(bookId('ghost'))).toEqual([])
  })
})

describe('where you stopped reading', () => {
  const anchor = formatAnchor({ chapter: 2, section: 3, paragraph: 13 })

  it('remembers a place and gives it back', async () => {
    await repo.savePosition(bookId('a'), anchor)

    expect(await repo.getPosition(bookId('a'))).toMatchObject({
      bookId: 'a',
      anchor,
    })
  })

  it('keeps one place per book, not a history', async () => {
    const later = formatAnchor({ chapter: 4, section: 1, paragraph: 2 })
    await repo.savePosition(bookId('a'), anchor)
    await repo.savePosition(bookId('a'), later)

    expect((await repo.getPosition(bookId('a')))?.anchor).toBe(later)
    expect(await repo.listPositions()).toHaveLength(1)
  })

  it('has no place for a book never opened', async () => {
    expect(await repo.getPosition(bookId('ghost'))).toBeUndefined()
  })

  it('lists the most recently read first', async () => {
    await repo.savePosition(bookId('a'), anchor)
    // Timestamps come from the clock, so two writes in the same millisecond
    // would tie. Push one back deliberately rather than sleeping.
    await db.positions.put({
      bookId: bookId('b'),
      anchor,
      at: '2020-01-01T00:00:00.000Z',
    })

    expect((await repo.listPositions()).map((place) => place.bookId)).toEqual(['a', 'b'])
  })

  it('forgets a place on request', async () => {
    await repo.savePosition(bookId('a'), anchor)
    await repo.forgetPosition(bookId('a'))

    expect(await repo.getPosition(bookId('a'))).toBeUndefined()
  })

  it('loses the place when the book is deleted', async () => {
    // An orphaned position would be handed straight back if the same book were
    // imported again — reopening a fresh copy partway through a previous read.
    const book = makeParsedBook('a')
    await repo.saveParsedBook(book)
    await repo.savePosition(book.meta.id, anchor)

    await repo.deleteBook(book.meta.id)

    expect(await repo.getPosition(book.meta.id)).toBeUndefined()
  })
})

describe('deleting several books at once', () => {
  it('removes them all, with everything belonging to them', async () => {
    await repo.saveParsedBook(makeParsedBook('a'))
    await repo.saveParsedBook(makeParsedBook('b'))
    await repo.saveParsedBook(makeParsedBook('c'))
    await repo.savePosition(bookId('a'), formatAnchor({ chapter: 1, section: 1, paragraph: 1 }))

    await repo.deleteBooks([bookId('a'), bookId('b')])

    expect((await repo.listBooks()).map((book) => book.id)).toEqual(['c'])
    // The cascade has to apply to each of them — orphaned sections are
    // invisible, unreachable, and still eat the phone's storage quota.
    expect(await repo.countSections(bookId('a'))).toBe(0)
    expect(await repo.countSections(bookId('b'))).toBe(0)
    expect(await repo.getManifest(bookId('a'))).toBeUndefined()
    expect(await repo.getPosition(bookId('a'))).toBeUndefined()
    // And must not have touched the one that wasn't asked for.
    expect(await repo.countSections(bookId('c'))).toBe(3)
  })

  it('does nothing when nothing was selected', async () => {
    await repo.saveParsedBook(makeParsedBook('a'))
    await repo.deleteBooks([])

    expect(await repo.listBooks()).toHaveLength(1)
  })

  it('ignores a book that is already gone', async () => {
    // Two devices, or a double tap. Refusing the whole batch because one row
    // had already been removed would be worse than skipping it.
    await repo.saveParsedBook(makeParsedBook('a'))

    await expect(
      repo.deleteBooks([bookId('a'), bookId('ghost')]),
    ).resolves.toBeUndefined()
    expect(await repo.listBooks()).toHaveLength(0)
  })
})
