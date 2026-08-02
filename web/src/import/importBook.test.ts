// fake-indexeddb must load first: the end-to-end case imports through a real
// repository backed by a scratch database.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createRepository, type ParsedBook, type ReadingBuddyDB } from '../storage/index.ts'
import type { Repository } from '../storage/index.ts'
import type { BookMeta, SourceFormat } from '../structure/index.ts'
import {
  ImportError,
  formatFromFilename,
  importBook,
  titleFromFilename,
  type ParserTable,
} from './importBook.ts'

let dbCounter = 0
let db: ReadingBuddyDB
let repo: Repository

beforeEach(() => {
  dbCounter += 1
  db = createDb(`reading-buddy-import-test-${dbCounter}`)
  repo = createRepository(db)
})

afterEach(async () => {
  await db.delete()
})

// --- Helpers ----------------------------------------------------------------

function fileOf(name: string, contents = '# Title\n\nSome prose.\n'): File {
  return new File([contents], name)
}

/** A parser table that records what it was handed and returns a stub book. */
function stubParsers(
  overrides: Partial<Record<SourceFormat, ParserTable[SourceFormat]>> = {},
): { parsers: ParserTable; calls: SourceFormat[]; payloads: unknown[] } {
  const calls: SourceFormat[] = []
  const payloads: unknown[] = []

  const stub = (format: SourceFormat): ParserTable[SourceFormat] => {
    return async (data, meta) => {
      calls.push(format)
      payloads.push(data)
      return oneParagraphBook(meta)
    }
  }

  const parsers = {
    epub: overrides.epub ?? stub('epub'),
    pdf: overrides.pdf ?? stub('pdf'),
    docx: overrides.docx ?? stub('docx'),
    md: overrides.md ?? stub('md'),
    txt: overrides.txt ?? stub('txt'),
  } satisfies ParserTable

  return { parsers, calls, payloads }
}

function oneParagraphBook(meta: BookMeta): ParsedBook {
  return {
    meta,
    manifest: { bookId: meta.id, title: meta.title, chapters: [{ chapter: 1, title: 'One', summary: '' }] },
    chapters: [
      {
        chapter: 1,
        title: 'One',
        path: 'ch01' as ParsedBook['chapters'][number]['path'],
        sections: [{ section: 1, path: 'ch01/s01' as never }],
      },
    ],
    sections: [
      {
        chapter: 1,
        section: 1,
        path: 'ch01/s01' as never,
        paragraphs: [{ anchor: '[ch01-s01-p001]' as never, text: 'Some prose.', kind: 'prose' }],
      },
    ],
  }
}

function emptyBook(meta: BookMeta): ParsedBook {
  return { meta, manifest: { bookId: meta.id, title: meta.title, chapters: [] }, chapters: [], sections: [] }
}

async function importErrorFrom(promise: Promise<unknown>): Promise<ImportError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ImportError) return error
    throw error
  }
  throw new Error('expected the import to fail, but it succeeded')
}

// --- Filename helpers -------------------------------------------------------

describe('filename helpers', () => {
  it('routes every supported extension, case-insensitively', () => {
    expect(formatFromFilename('a.epub')).toBe('epub')
    expect(formatFromFilename('a.PDF')).toBe('pdf')
    expect(formatFromFilename('a.md')).toBe('md')
    expect(formatFromFilename('a.markdown')).toBe('md')
    expect(formatFromFilename('a.txt')).toBe('txt')
    expect(formatFromFilename('a.DocX')).toBe('docx')
  })

  it('rejects what it cannot parse', () => {
    expect(formatFromFilename('book.azw3')).toBeUndefined()
    expect(formatFromFilename('book.doc')).toBeUndefined()
    expect(formatFromFilename('no-extension')).toBeUndefined()
  })

  it('makes a readable title out of a download-shaped filename', () => {
    expect(titleFromFilename('the_red_book-vol_1.epub')).toBe('the red book vol 1')
    expect(titleFromFilename('notes.md')).toBe('notes')
    expect(titleFromFilename('.gitignore')).toBe('.gitignore')
  })
})

// --- Extension routing ------------------------------------------------------

describe('extension routing', () => {
  it('sends each extension to its own parser', async () => {
    for (const [name, format] of [
      ['a.epub', 'epub'],
      ['a.pdf', 'pdf'],
      ['a.docx', 'docx'],
      ['a.md', 'md'],
      ['a.txt', 'txt'],
    ] as const) {
      const { parsers, calls } = stubParsers()
      await importBook(fileOf(name), { repository: repo, parsers })
      expect(calls).toEqual([format])
    }
  })

  it('hands binary formats bytes and text formats a string', async () => {
    const binary = stubParsers()
    await importBook(fileOf('a.epub'), { repository: repo, parsers: binary.parsers })
    expect(binary.payloads[0]).toBeInstanceOf(ArrayBuffer)

    const text = stubParsers()
    await importBook(fileOf('a.md'), { repository: repo, parsers: text.parsers })
    expect(typeof text.payloads[0]).toBe('string')
  })
})

// --- Failure paths ----------------------------------------------------------

describe('failure is explained, never silent', () => {
  it('names the file and the supported formats for an unknown extension', async () => {
    const { parsers, calls } = stubParsers()
    const error = await importErrorFrom(
      importBook(fileOf('book.azw3'), { repository: repo, parsers }),
    )

    expect(error.code).toBe('unsupported-format')
    expect(error.message).toContain('book.azw3')
    expect(error.message).toMatch(/EPUB/)
    // Nothing was even read, let alone parsed.
    expect(calls).toEqual([])
  })

  it('turns a parser error into a plain-language message, keeping the cause', async () => {
    const cause = new Error('EpubError: no OPF')
    const { parsers } = stubParsers({
      epub: async () => {
        throw cause
      },
    })

    const error = await importErrorFrom(
      importBook(fileOf('a.epub'), { repository: repo, parsers }),
    )

    expect(error.code).toBe('unreadable-file')
    expect(error.message).toMatch(/copy-protected|damaged/)
    expect(error.message).not.toContain('OPF')
    expect(error.cause).toBe(cause)
  })

  it('explains a scanned PDF specifically, rather than saving an empty book', async () => {
    const { parsers } = stubParsers({ pdf: async (_data, meta) => emptyBook(meta) })

    const error = await importErrorFrom(
      importBook(fileOf('scan.pdf'), { repository: repo, parsers }),
    )

    expect(error.code).toBe('no-text')
    expect(error.message).toMatch(/scan/i)
    expect(await repo.listBooks()).toEqual([])
  })

  it('reports a storage failure as its own thing', async () => {
    const { parsers } = stubParsers()
    const failing = {
      ...repo,
      saveParsedBook: async () => {
        throw new Error('QuotaExceededError')
      },
    } as Repository

    const error = await importErrorFrom(
      importBook(fileOf('a.md'), { repository: failing, parsers }),
    )

    expect(error.code).toBe('save-failed')
    expect(error.message).toMatch(/storage space/)
  })

  it('leaves nothing behind when it fails', async () => {
    const { parsers } = stubParsers({
      txt: async () => {
        throw new Error('boom')
      },
    })

    await importErrorFrom(importBook(fileOf('a.txt'), { repository: repo, parsers }))

    expect(await repo.listBooks()).toEqual([])
    expect(await db.sections.count()).toBe(0)
    expect(await db.manifests.count()).toBe(0)
  })
})

// --- End to end -------------------------------------------------------------

describe('end-to-end import', () => {
  it('parses a real markdown file all the way into the repository', async () => {
    const markdown = [
      '# Chapter One',
      '',
      'The first paragraph of the book.',
      '',
      '## A section',
      '',
      'More prose here.',
      '',
      '# Chapter Two',
      '',
      'And on it goes.',
      '',
    ].join('\n')

    const stages: string[] = []
    const meta = await importBook(fileOf('a_short_book.md', markdown), {
      repository: repo,
      onStage: (stage) => stages.push(stage),
      newId: () => 'book-1',
      now: () => new Date('2026-08-02T12:00:00.000Z'),
    })

    expect(meta.id).toBe('book-1')
    expect(meta.title).toBe('a short book')
    expect(meta.source).toBe('md')
    expect(meta.type).toBe('dense-technical')
    expect(meta.importedAt).toBe('2026-08-02T12:00:00.000Z')
    expect(stages).toEqual(['reading', 'parsing', 'saving'])

    // It survives as data, not just as a return value — the same reads the
    // library and the reader will make.
    const books = await repo.listBooks()
    expect(books.map((book) => book.title)).toEqual(['a short book'])

    const manifest = await repo.getManifest(meta.id)
    expect(manifest?.chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter One',
      'Chapter Two',
    ])

    const section = await repo.getSectionByAnchor(meta.id, '[ch01-s01-p001]')
    expect(section?.paragraphs[0]?.text).toBe('The first paragraph of the book.')
  })
})
