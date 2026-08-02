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
    paragraphs: [{ anchor: formatAnchor({ chapter, section, paragraph: 1 }), text }],
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
