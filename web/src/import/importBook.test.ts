// fake-indexeddb must load first: the end-to-end case imports through a real
// repository backed by a scratch database.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDb, createRepository, type ParsedBook, type ReadingBuddyDB } from '../storage/index.ts'
import type { Repository } from '../storage/index.ts'
import { PARSER_VERSION } from '../parse/version.ts'
import type { BookMeta, SourceFormat } from '../structure/index.ts'
import {
  ImportError,
  formatFromFilename,
  importBook,
  importBooks,
  isOutOfDate,
  reparseBook,
  reparseBooks,
  backfillTextSignatures,
  textSignatureOf,
  titleFromFilename,
  type BatchProgress,
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

/**
 * Contents default to something unique per filename. Two files with the same
 * bytes are now genuinely the same book, so a shared default would make every
 * multi-file fixture a pile of duplicates.
 */
function fileOf(name: string, contents = `# ${name}\n\nSome prose.\n`): File {
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

// --- Many at a time ---------------------------------------------------------

describe('importing many files', () => {
  let idCounter = 0
  const uniqueIds = () => `book-${(idCounter += 1)}`

  it('imports every file and reports one outcome each', async () => {
    const { parsers } = stubParsers()

    const outcomes = await importBooks(
      [fileOf('one.md'), fileOf('two.epub'), fileOf('three.txt')],
      { repository: repo, parsers, newId: uniqueIds },
    )

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'imported',
      'imported',
      'imported',
    ])
    expect((await repo.listBooks()).length).toBe(3)
  })

  it('keeps going after a bad file, rather than losing the whole batch', async () => {
    const { parsers } = stubParsers({
      epub: async () => {
        throw new Error('DRM')
      },
    })

    const outcomes = await importBooks(
      [fileOf('good.md'), fileOf('broken.epub'), fileOf('also-good.txt')],
      { repository: repo, parsers, newId: uniqueIds },
    )

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'imported',
      'failed',
      'imported',
    ])
    // The failure explains itself, and names the file it belongs to.
    const failure = outcomes[1]
    expect(failure?.status === 'failed' && failure.code).toBe('unreadable-file')
    expect(failure?.filename).toBe('broken.epub')
    expect((await repo.listBooks()).length).toBe(2)
  })

  it('reports unreadable files that were hand-picked', async () => {
    const { parsers } = stubParsers()

    const outcomes = await importBooks([fileOf('good.md'), fileOf('kindle.azw3')], {
      repository: repo,
      parsers,
      newId: uniqueIds,
    })

    expect(outcomes.length).toBe(2)
    const failure = outcomes[1]
    expect(failure?.status === 'failed' && failure.code).toBe('unsupported-format')
  })

  it('silently ignores the clutter that comes with a folder', async () => {
    const { parsers } = stubParsers()

    const outcomes = await importBooks(
      [fileOf('book.epub'), fileOf('cover.jpg'), fileOf('metadata.opf'), fileOf('notes.md')],
      { repository: repo, parsers, skipUnsupported: true, newId: uniqueIds },
    )

    // Only the two readable files produce an outcome at all — no wall of
    // "can't open cover.jpg" to read past.
    expect(outcomes.map((outcome) => outcome.filename)).toEqual(['book.epub', 'notes.md'])
    expect(outcomes.every((outcome) => outcome.status === 'imported')).toBe(true)
  })

  it('counts progress against the filtered list, so it never says 4 of 12', async () => {
    const { parsers } = stubParsers()
    const seen: BatchProgress[] = []

    await importBooks([fileOf('a.md'), fileOf('cover.jpg'), fileOf('b.md')], {
      repository: repo,
      parsers,
      skipUnsupported: true,
      newId: uniqueIds,
      onProgress: (progress) => seen.push(progress),
    })

    expect(seen.every((progress) => progress.total === 2)).toBe(true)
    expect(seen.at(-1)?.index).toBe(2)
    expect(seen.at(-1)?.filename).toBe('b.md')
  })

  it('imports one strictly after another', async () => {
    const active: string[] = []
    let overlapped = false

    const serialising = async (_data: unknown, meta: BookMeta) => {
      active.push(meta.title)
      if (active.length > 1) overlapped = true
      await new Promise((resolve) => setTimeout(resolve, 1))
      active.pop()
      return oneParagraphBook(meta)
    }
    const { parsers } = stubParsers({ md: serialising, txt: serialising })

    await importBooks([fileOf('a.md'), fileOf('b.txt'), fileOf('c.md')], {
      repository: repo,
      parsers,
      newId: uniqueIds,
    })

    // Parsing is CPU-bound; overlapping a folder's worth would freeze the UI.
    expect(overlapped).toBe(false)
  })

  it('returns an empty report for an empty list', async () => {
    const { parsers } = stubParsers()
    expect(await importBooks([], { repository: repo, parsers })).toEqual([])
  })
})

// --- Duplicates -------------------------------------------------------------

describe('duplicate detection', () => {
  let idCounter = 100
  const uniqueIds = () => `dup-${(idCounter += 1)}`

  it('refuses the same file twice, naming the book already on the shelf', async () => {
    const { parsers } = stubParsers()
    const contents = '# Man and His Symbols\n\nProse.\n'

    await importBook(fileOf('jung.md', contents), {
      repository: repo,
      parsers,
      newId: uniqueIds,
    })

    // Same bytes, different filename — still the same book.
    const error = await importErrorFrom(
      importBook(fileOf('jung-copy.md', contents), {
        repository: repo,
        parsers,
        newId: uniqueIds,
      }),
    )

    expect(error.code).toBe('duplicate')
    expect(error.message).toContain('already on your shelf')
    expect(error.message).toContain('jung')
    expect((await repo.listBooks()).length).toBe(1)
  })

  it('does not parse a duplicate at all', async () => {
    const { parsers, calls } = stubParsers()
    const contents = '# Same\n\nProse.\n'

    await importBook(fileOf('a.md', contents), { repository: repo, parsers, newId: uniqueIds })
    expect(calls.length).toBe(1)

    await importErrorFrom(
      importBook(fileOf('a.md', contents), { repository: repo, parsers, newId: uniqueIds }),
    )
    // Still 1: the hash answered before the expensive work started.
    expect(calls.length).toBe(1)
  })

  it('treats different content as a different book, however similar the name', async () => {
    const { parsers } = stubParsers()

    await importBook(fileOf('book.md', '# Edition one\n\nProse.\n'), {
      repository: repo,
      parsers,
      newId: uniqueIds,
    })
    await importBook(fileOf('book.md', '# Edition two\n\nDifferent prose.\n'), {
      repository: repo,
      parsers,
      newId: uniqueIds,
    })

    expect((await repo.listBooks()).length).toBe(2)
  })

  it('records the fingerprint on the stored book', async () => {
    const meta = await importBook(fileOf('a.md', '# T\n\nProse.\n'), {
      repository: repo,
      newId: uniqueIds,
    })

    const stored = await repo.getBook(meta.id)
    expect(stored?.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(await repo.findByContentHash(stored!.contentHash!)).toBeDefined()
  })

  it('reports a duplicate in a batch as its own status, not as a failure', async () => {
    const { parsers } = stubParsers()
    const contents = '# Twice\n\nProse.\n'

    const outcomes = await importBooks(
      [fileOf('a.md', contents), fileOf('a-copy.md', contents), fileOf('b.md', '# Other\n\nX.\n')],
      { repository: repo, parsers, newId: uniqueIds },
    )

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'imported',
      'duplicate',
      'imported',
    ])
    expect((await repo.listBooks()).length).toBe(2)
  })
})

// --- Books that predate fingerprinting --------------------------------------

/** Enough prose to clear the signature's minimum-length guard. */
function longMarkdown(title: string): string {
  const sentence =
    'The unconscious speaks in images, and the dreamer must learn to listen to them carefully. '
  return `# ${title}\n\n${sentence.repeat(6)}\n`
}

describe('a book imported before fingerprinting existed', () => {
  it('is still recognised on re-import, via its stored text', async () => {
    const contents = longMarkdown('Man and His Symbols')

    // Exactly the state the app was in before this feature: a book on the
    // shelf, with real sections, and no fingerprint of any kind.
    await importBook(fileOf('jung.md', contents), { repository: repo, newId: () => 'legacy-1' })
    const legacy = (await repo.listBooks())[0]!
    await repo.saveBook({
      ...legacy,
      contentHash: undefined,
      textSignature: undefined,
    })
    expect((await repo.getBook(legacy.id))?.textSignature).toBeUndefined()

    // Re-importing the very same file used to sail straight through.
    const error = await importErrorFrom(
      importBook(fileOf('jung.md', contents), { repository: repo, newId: () => 'legacy-2' }),
    )

    expect(error.code).toBe('duplicate')
    expect((await repo.listBooks()).length).toBe(1)
  })

  it('gives older books a signature without touching anything else', async () => {
    const contents = longMarkdown('Backfill Me')
    await importBook(fileOf('a.md', contents), { repository: repo, newId: () => 'old-1' })

    const stored = (await repo.listBooks())[0]!
    await repo.saveBook({ ...stored, textSignature: undefined })

    expect(await backfillTextSignatures(repo)).toBe(1)

    const after = await repo.getBook(stored.id)
    expect(after?.textSignature).toMatch(/^[0-9a-f]{64}$/)
    expect(after?.title).toBe(stored.title)
    expect(after?.importedAt).toBe(stored.importedAt)
    // Nothing to do the second time.
    expect(await backfillTextSignatures(repo)).toBe(0)
  })

  it('catches the same book arriving as a different file', async () => {
    const contents = longMarkdown('Same Words')
    await importBook(fileOf('from-one-source.md', contents), {
      repository: repo,
      newId: () => 'text-1',
    })

    // Different bytes — a trailing newline is enough to change the file hash —
    // but the same words, so the text signature still catches it.
    const error = await importErrorFrom(
      importBook(fileOf('from-another-source.md', `${contents}\n`), {
        repository: repo,
        newId: () => 'text-2',
      }),
    )

    expect(error.code).toBe('duplicate')
  })

  it('refuses to judge a book with too little opening text', async () => {
    // A false "already on your shelf" would lock a real book out, so a thin
    // opening — a title page, a "Contents" line — makes no claim at all.
    expect(await textSignatureOf(['Contents'])).toBeUndefined()
    expect(await textSignatureOf([])).toBeUndefined()

    const { parsers } = stubParsers()
    await importBook(fileOf('thin-one.md', '# A\n\nShort.\n'), {
      repository: repo,
      parsers,
      newId: () => 'thin-1',
    })
    await importBook(fileOf('thin-two.md', '# B\n\nAlso short.\n'), {
      repository: repo,
      parsers,
      newId: () => 'thin-2',
    })

    expect((await repo.listBooks()).length).toBe(2)
  })
})

// --- Removal ----------------------------------------------------------------

describe('removing a book', () => {
  it('takes its sections and manifest with it, and frees the fingerprint', async () => {
    const contents = '# Gone\n\nProse.\n'
    const meta = await importBook(fileOf('gone.md', contents), {
      repository: repo,
      newId: () => 'gone-1',
    })

    expect(await db.sections.count()).toBeGreaterThan(0)

    await repo.deleteBook(meta.id)

    expect(await repo.listBooks()).toEqual([])
    expect(await db.sections.count()).toBe(0)
    expect(await db.manifests.count()).toBe(0)
    expect(await db.chapters.count()).toBe(0)

    // Removing then re-importing must work — otherwise a delete would blacklist
    // the book forever.
    const again = await importBook(fileOf('gone.md', contents), {
      repository: repo,
      newId: () => 'gone-2',
    })
    expect(again.id).toBe('gone-2')
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

// --- Keeping the file, and re-reading a book from it -------------------------

describe('re-parsing a book already on the shelf', () => {
  it('stamps every import with the parser that made it', async () => {
    const { parsers } = stubParsers()
    const meta = await importBook(fileOf('a.md'), { repository: repo, parsers })

    expect(meta.parserVersion).toBe(PARSER_VERSION)
    expect(isOutOfDate(meta)).toBe(false)
  })

  // The whole set this feature exists for: books imported before any of this
  // existed carry no stamp, and are exactly the ones needing a re-parse.
  it('counts an unstamped book as out of date', () => {
    expect(isOutOfDate({ ...oneParagraphBook({} as BookMeta).meta, parserVersion: undefined } as BookMeta)).toBe(true)
  })

  it('keeps the file it was imported from', async () => {
    const { parsers } = stubParsers()
    const meta = await importBook(fileOf('a.md', '# A\n\nSome prose.\n'), {
      repository: repo,
      parsers,
    })

    const source = await repo.getSource(meta.id)
    expect(source?.filename).toBe('a.md')
    expect(await source?.file.text()).toBe('# A\n\nSome prose.\n')
  })

  it('reads the book again from that file', async () => {
    const { parsers } = stubParsers()
    const meta = await importBook(fileOf('a.md'), { repository: repo, parsers })

    // Pretend it was made by an older build, then hand the parser a different
    // answer — the same thing a parser fix does.
    await repo.saveBook({ ...meta, parserVersion: 1 })
    const rebuilt: ParserTable = {
      ...parsers,
      md: async (_data, m) => ({
        ...oneParagraphBook(m),
        sections: [
          {
            chapter: 1,
            section: 1,
            path: 'ch01/s01' as never,
            paragraphs: [
              { anchor: '[ch01-s01-p001]' as never, text: 'Now with links.', kind: 'prose' },
            ],
          },
        ],
      }),
    }

    const updated = await reparseBook(meta.id, { repository: repo, parsers: rebuilt })

    expect(updated.parserVersion).toBe(PARSER_VERSION)
    const section = await repo.getSection(meta.id, 'ch01/s01' as never)
    expect(section?.paragraphs[0]?.text).toBe('Now with links.')
  })

  // The point of an *update* rather than a delete-and-re-import: everything the
  // reader has decided about this book has to survive it.
  it('keeps the book’s identity, shelf and reading place', async () => {
    const { parsers } = stubParsers()
    const meta = await importBook(fileOf('a.md'), { repository: repo, parsers })
    await repo.saveBook({ ...meta, shelf: 'paper', shelfOverridden: true, parserVersion: 1 })
    await repo.savePosition(meta.id, '[ch01-s01-p001]' as never)

    const updated = await reparseBook(meta.id, { repository: repo, parsers })

    expect(updated.id).toBe(meta.id)
    expect(updated.title).toBe(meta.title)
    expect(updated.shelf).toBe('paper')
    expect(updated.shelfOverridden).toBe(true)
    expect(updated.importedAt).toBe(meta.importedAt)
    expect((await repo.getPosition(meta.id))?.anchor).toBe('[ch01-s01-p001]')
  })

  it('explains itself when the file was never kept', async () => {
    const { parsers } = stubParsers()
    const meta = await importBook(fileOf('a.md'), { repository: repo, parsers })
    await repo.forgetSources()

    const error = await importErrorFrom(reparseBook(meta.id, { repository: repo, parsers }))
    expect(error.code).toBe('no-source')
    expect(error.message).toContain('import the file again')
  })

  // A failed update must never cost the reader the book they already had.
  it('leaves the old book untouched when the new parse comes back empty', async () => {
    const { parsers } = stubParsers()
    const meta = await importBook(fileOf('a.md'), { repository: repo, parsers })

    const broken: ParserTable = { ...parsers, md: async (_data, m) => emptyBook(m) }
    const error = await importErrorFrom(
      reparseBook(meta.id, { repository: repo, parsers: broken }),
    )

    expect(error.code).toBe('no-text')
    const section = await repo.getSection(meta.id, 'ch01/s01' as never)
    expect(section?.paragraphs[0]?.text).toBe('Some prose.')
  })

  it('reports on each book of a batch and finishes the rest', async () => {
    const { parsers } = stubParsers()
    const first = await importBook(fileOf('a.md'), { repository: repo, parsers })
    const second = await importBook(fileOf('b.md'), { repository: repo, parsers })
    await repo.forgetSources()
    await repo.saveSource(first.id, new File(['# A\n\nSome prose.\n'], 'a.md'), 'a.md')

    const outcomes = await reparseBooks([first, second], { repository: repo, parsers })

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['updated', 'failed'])
  })
})
