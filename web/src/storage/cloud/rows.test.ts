import { describe, expect, it } from 'vitest'

import type { Anchor, BookId, BookMeta, Section, SectionPath } from '../../structure/index.ts'
import {
  bookFromRow,
  bookToRow,
  chapterTextOf,
  chunkSections,
  folderFromRow,
  isoFrom,
  positionFromRow,
  quoteFromRow,
  readChapterText,
  sectionFromRow,
  sectionToPayload,
  type BookRow,
  type SectionPayload,
} from './rows.ts'

/** A row with every optional column null — the state most books are in. */
function bareRow(overrides: Partial<BookRow> = {}): BookRow {
  return {
    id: 'book-1',
    title: 'Breath',
    author: null,
    source: 'epub',
    type: 'dense-technical',
    subject: null,
    type_overridden: null,
    shelf: null,
    shelf_overridden: null,
    folder_ids: null,
    content_hash: null,
    text_signature: null,
    isbn: null,
    publisher: null,
    published: null,
    language: null,
    description: null,
    subjects: null,
    parser_version: null,
    imported_at: '2026-08-09T10:00:00+00:00',
    finished_at: null,
    rating: null,
    notes: null,
    title_overridden: null,
    title_clean_version: null,
    ...overrides,
  }
}

describe('null is not the same as absent', () => {
  // The whole point. `'author' in book` is false in IndexedDB and must stay
  // false here, or code that checks for the key's presence quietly changes
  // behaviour when the backend is swapped.
  it('omits optional fields rather than setting them undefined', () => {
    const book = bookFromRow(bareRow())

    expect(Object.keys(book).sort()).toEqual(['id', 'importedAt', 'source', 'title', 'type'])
    expect('author' in book).toBe(false)
    expect('rating' in book).toBe(false)
  })

  it('keeps every field that is actually set', () => {
    const book = bookFromRow(
      bareRow({
        author: 'James Nestor',
        subject: 'physiology',
        shelf: 'book',
        shelf_overridden: true,
        content_hash: 'abc',
        text_signature: 'def',
        parser_version: 9,
        rating: 4,
        notes: 'worth re-reading',
        title_overridden: true,
        title_clean_version: 2,
        type_overridden: false,
      }),
    )

    expect(book).toMatchObject({
      author: 'James Nestor',
      subject: 'physiology',
      shelf: 'book',
      shelfOverridden: true,
      contentHash: 'abc',
      textSignature: 'def',
      parserVersion: 9,
      rating: 4,
      notes: 'worth re-reading',
      titleOverridden: true,
      titleCleanVersion: 2,
      typeOverridden: false,
    })
  })

  it('carries what the book file said about itself, both ways', () => {
    const row = bareRow({
      isbn: '9780241988770',
      publisher: 'Penguin',
      published: '2019',
      language: 'en-gb',
      description: 'A voyage into the future of animal communication.',
      subjects: ['Science / Life Sciences', 'Nature'],
    })

    const book = bookFromRow(row)

    expect(book).toMatchObject({
      isbn: '9780241988770',
      publisher: 'Penguin',
      published: '2019',
      language: 'en-gb',
      description: 'A voyage into the future of animal communication.',
      subjects: ['Science / Life Sciences', 'Nature'],
    })
    expect(bookToRow(book)).toMatchObject({
      isbn: '9780241988770',
      publisher: 'Penguin',
      published: '2019',
      language: 'en-gb',
      description: 'A voyage into the future of animal communication.',
      subjects: ['Science / Life Sciences', 'Nature'],
    })
  })

  // The same rule `folderIds` follows: a book with no subject headings has no
  // key at all in IndexedDB, so it must have no key here either.
  it('treats an empty subject list as no subjects', () => {
    expect('subjects' in bookFromRow(bareRow({ subjects: [] }))).toBe(false)
    expect(bookToRow({ ...bookFromRow(bareRow()), subjects: [] }).subjects).toBeNull()
  })

  // `folderIds: []` and no `folderIds` mean the same thing to the library, but
  // only one of them is what Dexie stores — see `unfiled()` in repository.ts.
  it('treats an empty folder list as loose in the library', () => {
    expect('folderIds' in bookFromRow(bareRow({ folder_ids: [] }))).toBe(false)
    expect(bookFromRow(bareRow({ folder_ids: ['f1', 'f2'] })).folderIds).toEqual(['f1', 'f2'])
  })
})

describe('timestamps', () => {
  // Postgres says +00:00, the app has always written Z, and the library sorts
  // these as strings. Left alone, '2026-08-09T10:00:00+00:00' sorts *after*
  // '2026-08-09T11:00:00.000Z' — the recently-added shelf in the wrong order.
  it('normalises Postgres offsets to the shape the app writes', () => {
    expect(isoFrom('2026-08-09T10:00:00+00:00')).toBe('2026-08-09T10:00:00.000Z')
  })

  it('leaves a value alone when it isn’t a date at all', () => {
    expect(isoFrom('not a date')).toBe('not a date')
  })

  it('applies to every table that carries one', () => {
    expect(bookFromRow(bareRow()).importedAt).toBe('2026-08-09T10:00:00.000Z')
    expect(
      positionFromRow({
        book_id: 'b',
        anchor: '[ch01-s01-p001]',
        at: '2026-08-09T10:00:00+00:00',
        percent: null,
      }).at,
    ).toBe('2026-08-09T10:00:00.000Z')
    expect(
      quoteFromRow({ book_id: 'b', id: 'q', text: 't', added_at: '2026-08-09T10:00:00+00:00' })
        .addedAt,
    ).toBe('2026-08-09T10:00:00.000Z')
    expect(
      folderFromRow({ id: 'f', name: 'Philosophy', created_at: '2026-08-09T10:00:00+00:00' })
        .createdAt,
    ).toBe('2026-08-09T10:00:00.000Z')
  })
})

describe('bookToRow', () => {
  it('round-trips a book without losing or inventing a field', () => {
    const row = bareRow({ author: 'James Nestor', folder_ids: ['f1'], rating: 5 })
    expect(bookToRow(bookFromRow(row))).toEqual({
      ...row,
      imported_at: '2026-08-09T10:00:00.000Z',
    })
  })

  // PostgREST builds its `on conflict do update` from the keys present in the
  // payload. Including `ready` would let any ordinary save flip a book that is
  // still uploading to visible — or a finished one back to hidden.
  it('never carries the readiness flag', () => {
    expect('ready' in bookToRow(bookFromRow(bareRow()))).toBe(false)
  })

  it('writes an absent optional back as null', () => {
    const meta: BookMeta = {
      id: 'book-1' as BookId,
      title: 'Breath',
      source: 'epub',
      type: 'dense-technical',
      importedAt: '2026-08-09T10:00:00.000Z',
    }
    expect(bookToRow(meta).author).toBeNull()
    expect(bookToRow(meta).folder_ids).toBeNull()
  })
})

describe('sectionFromRow', () => {
  it('omits a title the source never gave', () => {
    const section = sectionFromRow(
      {
        book_id: 'b',
        path: 'ch01/s01',
        chapter: 1,
        section: 1,
        title: null,
        r2_key: 'users/u/books/b/text/tok/1.json',
      },
      [],
    )
    expect('title' in section).toBe(false)
  })

  it('joins the row to the words fetched separately', () => {
    const paragraph = { anchor: '[ch01-s01-p001]' as Anchor, text: 'Once.', kind: 'prose' as const }
    const section = sectionFromRow(
      {
        book_id: 'b',
        path: 'ch01/s01',
        chapter: 1,
        section: 1,
        title: 'Opening',
        r2_key: 'users/u/books/b/text/tok/1.json',
      },
      [paragraph],
    )
    // The key is the repository's business. What comes out is the same shape
    // IndexedDB hands back, with no trace of where the words came from.
    expect(section).toEqual({
      bookId: 'b',
      chapter: 1,
      section: 1,
      path: 'ch01/s01',
      title: 'Opening',
      paragraphs: [paragraph],
    })
  })
})

describe('chapterTextOf / readChapterText', () => {
  const paragraph = (text: string) => ({
    anchor: `[ch01-s01-p001]` as Anchor,
    text,
    kind: 'prose' as const,
  })

  function section(index: number, text: string): Section {
    return {
      chapter: 1,
      section: index,
      path: `ch01/s0${index}` as SectionPath,
      paragraphs: [paragraph(text)],
    }
  }

  it('survives the round trip through JSON unchanged', () => {
    const sections = [section(1, 'First.'), section(2, 'Second.')]
    const parsed = readChapterText(JSON.parse(JSON.stringify(chapterTextOf(sections))))
    expect(parsed['ch01/s01']).toEqual([paragraph('First.')])
    expect(parsed['ch01/s02']).toEqual([paragraph('Second.')])
  })

  it('keys by path rather than by position', () => {
    // The reason this is an object and not an array: a re-parse that divides a
    // chapter into a different number of sections would silently shift every
    // index, handing the reader another section's words under this one's name.
    expect(Object.keys(chapterTextOf([section(2, 'Second.')]))).toEqual(['ch01/s02'])
  })

  it('drops a malformed entry without losing the rest of the chapter', () => {
    const parsed = readChapterText({ 'ch01/s01': [paragraph('Kept.')], 'ch01/s02': 'not an array' })
    expect(parsed['ch01/s01']).toEqual([paragraph('Kept.')])
    expect('ch01/s02' in parsed).toBe(false)
  })

  it.each([
    ['null', null],
    ['an array', [1, 2, 3]],
    ['a string', 'nonsense'],
    ['a number', 7],
  ])('reads %s as an empty chapter rather than throwing', (_label, value) => {
    expect(readChapterText(value)).toEqual({})
  })
})

describe('sectionToPayload', () => {
  it('sends the pointer and no words at all', () => {
    const payload = sectionToPayload(
      {
        chapter: 1,
        section: 1,
        path: 'ch01/s01' as SectionPath,
        title: 'Opening',
        paragraphs: [{ anchor: '[ch01-s01-p001]' as Anchor, text: 'Once.', kind: 'prose' }],
      },
      'users/u/books/b/text/tok/1.json',
    )
    expect(payload).toEqual({
      path: 'ch01/s01',
      chapter: 1,
      section: 1,
      title: 'Opening',
      r2Key: 'users/u/books/b/text/tok/1.json',
    })
    expect('paragraphs' in payload).toBe(false)
  })

  it('writes an absent title back as null', () => {
    const payload = sectionToPayload(
      { chapter: 1, section: 1, path: 'ch01/s01' as SectionPath, paragraphs: [] },
      'k',
    )
    expect(payload.title).toBeNull()
  })
})

describe('chunkSections', () => {
  // What travels now is the pointer, not the prose, so the title is the only
  // field left that can vary in size — which is why it stands in for bulk here.
  function section(chapter: number, index: number, size: number): SectionPayload {
    return {
      chapter,
      section: index,
      path: `ch${chapter}/s${index}`,
      title: 'x'.repeat(size),
      r2Key: `users/u/books/b/text/tok/${chapter}.json`,
    }
  }

  it('keeps a small book in one request', () => {
    const sections = [section(1, 1, 10), section(1, 2, 10)]
    expect(chunkSections(sections)).toEqual([sections])
  })

  it('splits on accumulated size, not on a row count', () => {
    // Sections are wildly uneven — a chapter opening is two lines and a dense
    // middle section is forty paragraphs — so counting rows would produce
    // batches somewhere between 20 KB and 4 MB.
    const chunks = chunkSections([section(1, 1, 600), section(1, 2, 600), section(1, 3, 600)], 1000)
    expect(chunks.length).toBe(3)
  })

  it('never drops or reorders a section', () => {
    const sections = Array.from({ length: 25 }, (_, index) => section(1, index + 1, 200))
    const flattened = chunkSections(sections, 1000).flat()
    expect(flattened).toEqual(sections)
  })

  it('sends an oversized section on its own rather than losing the book', () => {
    const huge = section(1, 1, 5000)
    const chunks = chunkSections([huge, section(1, 2, 10)], 1000)
    expect(chunks[0]).toEqual([huge])
    expect(chunks[1]?.length).toBe(1)
  })

  it('has nothing to send for a book with no sections', () => {
    expect(chunkSections([])).toEqual([])
  })
})
