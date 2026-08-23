// @vitest-environment jsdom
//
// The wiring, against a real (fake-indexeddb) database.
//
// `digest.ts` is tested on its own with no database at all. What is left here
// is the part that decides *when* money is spent: never ahead of the reader,
// one chapter at a time, and nothing at all unless the reader opted in.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { digestStore } from '../storage/digests.ts'
import { repository, type ParsedBook } from '../storage/index.ts'
import { tutorStore } from '../storage/tutor.ts'
import { placeOf, recapsOn, refreshOneChapter, setRecapsOn } from './refresh.ts'
import {
  chapterPath,
  formatAnchor,
  sectionPath,
  type Anchor,
  type BookId,
} from '../structure/index.ts'
import type { MemoryModule } from './digest.ts'

const BOOK_ID = 'book-1' as BookId

/** Three chapters, each one long enough to be worth two blocks. */
function bookOf(): ParsedBook {
  const chapters = [1, 2, 3]
  const sections = [1, 2, 3, 4]
  return {
    meta: {
      id: BOOK_ID,
      title: 'A Long Book',
      author: 'Someone',
      source: 'epub' as const,
      type: 'dense-technical' as const,
      importedAt: '2026-08-01T00:00:00.000Z',
    },
    manifest: {
      bookId: BOOK_ID,
      title: 'A Long Book',
      chapters: chapters.map((chapter) => ({
        chapter,
        title: `Chapter ${chapter}`,
        summary: '',
        words: 12_000,
      })),
    },
    chapters: chapters.map((chapter) => ({
      chapter,
      title: `Chapter ${chapter}`,
      path: chapterPath(chapter),
      sections: sections.map((section) => ({
        section,
        path: sectionPath(chapter, section),
        words: 3000,
      })),
    })),
    sections: chapters.flatMap((chapter) =>
      sections.map((section) => ({
        chapter,
        section,
        path: sectionPath(chapter, section),
        paragraphs: [
          {
            anchor: formatAnchor({ chapter, section, paragraph: 1 }),
            text: `The prose of chapter ${chapter}, section ${section}.`,
            kind: 'prose' as const,
          },
        ],
      })),
    ),
  }
}

/** A stub relay. Records every call so the spending can be counted. */
function recorder() {
  const calls: MemoryModule[] = []
  const ask = vi.fn(async (module: MemoryModule, material: string) => {
    calls.push(module)
    return `${module} text for ${material.length} characters`
  })
  return { calls, ask }
}

beforeEach(async () => {
  await repository.deleteBook(BOOK_ID)
  localStorage.clear()
  await repository.saveParsedBook(bookOf())
})

afterEach(() => {
  setRecapsOn(false)
})

describe('placeOf', () => {
  it('reads the chapter and section out of an anchor', () => {
    expect(placeOf(formatAnchor({ chapter: 4, section: 2, paragraph: 9 }))).toEqual({
      chapter: 4,
      section: 2,
    })
  })
})

describe('recapsOn', () => {
  it('is off until the reader turns it on', () => {
    expect(recapsOn()).toBe(false)
    setRecapsOn(true)
    expect(recapsOn()).toBe(true)
  })
})

describe('refreshOneChapter', () => {
  it('builds the earliest chapter that has fallen behind, and stops there', async () => {
    const { ask } = recorder()
    const built = await refreshOneChapter(BOOK_ID, { chapter: 3, section: 1 }, ask)

    expect(built).toBe(1)
    expect(await digestStore.get(BOOK_ID, chapterPath(1))).toBeTruthy()
    // Chapter 2 is just as stale, and is deliberately left for the next run.
    expect(await digestStore.get(BOOK_ID, chapterPath(2))).toBeUndefined()
  })

  it('moves on to the next chapter once the first is stored', async () => {
    const { ask } = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 3, section: 1 }, ask)
    expect(await refreshOneChapter(BOOK_ID, { chapter: 3, section: 1 }, ask)).toBe(2)
  })

  it('never digests a chapter the reader has not opened', async () => {
    const { ask } = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 1, section: 4 }, ask)
    expect(await digestStore.get(BOOK_ID, chapterPath(2))).toBeUndefined()
    expect(await digestStore.get(BOOK_ID, chapterPath(3))).toBeUndefined()
  })

  it('stops the recap where the reader stopped inside a chapter', async () => {
    const { ask } = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 1, section: 3 }, ask)

    const row = await digestStore.get(BOOK_ID, chapterPath(1))
    // Sections are 3,000 words, so two of them never share a block: sections 1
    // and 2 are closed, and section 3 is still filling the next one. The recap
    // must stop at section 2 rather than record a page the reader is still on.
    expect(row?.coversThroughSection).toBe(2)
    expect(row?.blocks).toHaveLength(2)
  })

  it('digests the new block only, and never re-reads the old one', async () => {
    const first = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 1, section: 3 }, first.ask)
    expect(first.calls.filter((call) => call === 'recap')).toHaveLength(2)

    // One section further on, one more block has closed. The reader pays for
    // that block and for the stitching, never for the two blocks behind it.
    const next = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 1, section: 4 }, next.ask)
    const row = await digestStore.get(BOOK_ID, chapterPath(1))
    expect(next.calls.filter((call) => call === 'recap')).toHaveLength(1)
    expect(row?.blocks).toHaveLength(3)
    expect(row?.coversThroughSection).toBe(3)
  })

  it('does nothing at all when there is nothing new', async () => {
    const { ask } = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 1, section: 4 }, ask)
    const again = recorder()
    expect(await refreshOneChapter(BOOK_ID, { chapter: 1, section: 4 }, again.ask)).toBeUndefined()
    expect(again.ask).not.toHaveBeenCalled()
  })

  it('takes the questions asked inside the chapter, and only those', async () => {
    await tutorStore.addThread(
      BOOK_ID,
      {
        anchor: formatAnchor({ chapter: 1, section: 1, paragraph: 2 }) as Anchor,
        excerpt: 'a hard sentence',
        kind: 'sentence',
      },
      [{ role: 'you', text: 'What does this mean?', ts: 1 }],
    )
    await tutorStore.addThread(
      BOOK_ID,
      {
        anchor: formatAnchor({ chapter: 2, section: 1, paragraph: 2 }) as Anchor,
        excerpt: 'a later sentence',
        kind: 'sentence',
      },
      [{ role: 'you', text: 'And this one?', ts: 2 }],
    )

    const { ask } = recorder()
    await refreshOneChapter(BOOK_ID, { chapter: 2, section: 1 }, ask)

    const row = await digestStore.get(BOOK_ID, chapterPath(1))
    expect(row?.coversNConversations).toBe(1)
    const confusions = ask.mock.calls.find((call) => call[0] === 'confusions')
    expect(confusions?.[1]).toContain('What does this mean?')
    expect(confusions?.[1]).not.toContain('And this one?')
  })

  it('leaves a book with no chapters alone', async () => {
    const { ask } = recorder()
    expect(
      await refreshOneChapter('book-nothing' as BookId, { chapter: 1, section: 1 }, ask),
    ).toBeUndefined()
    expect(ask).not.toHaveBeenCalled()
  })
})
