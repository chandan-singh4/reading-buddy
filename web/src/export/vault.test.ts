import { describe, expect, it } from 'vitest'

import type { StoredChapterSummary, StoredNote, StoredTutorThread } from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { changedFiles, fingerprint } from './seen.ts'
import { buildVault, safeName, type BookExport, type VaultFile } from './vault.ts'

const meta: BookMeta = {
  id: 'jung-1' as BookId,
  title: 'Man and His Symbols',
  author: 'Carl Gustav Jung',
  source: 'epub',
  type: 'dense-technical',
  importedAt: '2026-08-01T00:00:00.000Z',
}

function summary(over: Partial<StoredChapterSummary> = {}): StoredChapterSummary {
  return {
    bookId: meta.id,
    chapterId: 'ch06',
    chapter: 6,
    chapterTitle: 'Approaching the Unconscious',
    recap: 'Jung sets out what a symbol is.',
    concepts: [{ name: 'archetype', status: 'existing-match' }],
    coversNConversations: 0,
    recapAt: '2026-08-20T10:00:00.000Z',
    ...over,
  }
}

function note(over: Partial<StoredNote> = {}): StoredNote {
  return {
    bookId: meta.id,
    id: 'n1',
    anchor: '[ch06-s01-p003]' as StoredNote['anchor'],
    author: 'you',
    text: '',
    createdAt: '2026-08-21T10:00:00.000Z',
    quote: 'the gods did not leave',
    ...over,
  }
}

function thread(over: Partial<StoredTutorThread> = {}): StoredTutorThread {
  return {
    bookId: meta.id,
    id: 't1',
    anchor: '[ch06-s02-p001]' as StoredTutorThread['anchor'],
    excerpt: 'What we call civilized consciousness.',
    kind: 'paragraph',
    messages: [
      { role: 'you', text: 'What does he mean by this?', ts: 1 },
      { role: 'claude', text: 'He means the mind you can account for.', ts: 2 },
    ],
    createdAt: '2026-08-21T11:00:00.000Z',
    updatedAt: '2026-08-21T11:05:00.000Z',
    ...over,
  }
}

function book(over: Partial<BookExport> = {}): BookExport {
  return { meta, summaries: [summary()], notes: [note()], threads: [thread()], ...over }
}

function at(files: readonly VaultFile[], path: string): VaultFile {
  const found = files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`no ${path} in ${files.map((f) => f.path).join(', ')}`)
  return found
}

describe('the vault', () => {
  it('writes a note for the book, one for each chapter, and one for each concept', () => {
    const files = buildVault({ books: [book()], concepts: [] })
    expect(files.map((file) => file.path)).toEqual([
      'Reading Buddy/Books/Man and His Symbols.md',
      'Reading Buddy/Books/Man and His Symbols/06 Approaching the Unconscious.md',
      'Reading Buddy/Concepts/archetype.md',
      'Reading Buddy/Reading Buddy.md',
    ])
  })

  it('carries the recap, the highlight and the conversation into the chapter note', () => {
    const files = buildVault({ books: [book()], concepts: [] })
    const text = at(files, 'Reading Buddy/Books/Man and His Symbols/06 Approaching the Unconscious.md').text

    expect(text).toContain('> Jung sets out what a symbol is.')
    expect(text).toContain('> the gods did not leave')
    expect(text).toContain('**You:** What does he mean by this?')
    expect(text).toContain('**Veda:** He means the mind you can account for.')
    expect(text).toContain('[[Reading Buddy/Concepts/archetype|archetype]]')
  })

  it('links a chapter back to its book, and the book on to its chapters', () => {
    const files = buildVault({ books: [book()], concepts: [] })
    expect(at(files, 'Reading Buddy/Books/Man and His Symbols.md').text).toContain(
      '[[Reading Buddy/Books/Man and His Symbols/06 Approaching the Unconscious|Approaching the Unconscious]]',
    )
    expect(
      at(files, 'Reading Buddy/Books/Man and His Symbols/06 Approaching the Unconscious.md').text,
    ).toContain('[[Reading Buddy/Books/Man and His Symbols|Man and His Symbols]]')
  })

  it('gives a chapter a note even when no model has run on it', () => {
    const files = buildVault({ books: [book({ summaries: [] })], concepts: [] })
    const text = at(files, 'Reading Buddy/Books/Man and His Symbols/06 Chapter 6.md').text
    expect(text).toContain('> the gods did not leave')
  })

  it('names a chapter the reader highlighted before the recap arrived', () => {
    // The highlight opens the bundle first, so the title has to be taken up
    // when the summary follows it in.
    const files = buildVault({
      books: [book({ notes: [note()], summaries: [summary()] })],
      concepts: [],
    })
    expect(
      files.some((file) => file.path.endsWith('06 Approaching the Unconscious.md')),
    ).toBe(true)
  })

  it('collects a concept across every chapter that raised it', () => {
    const two = book({
      summaries: [
        summary(),
        summary({
          chapterId: 'ch07',
          chapter: 7,
          chapterTitle: 'Ancient myths',
          items: [
            { claim: 'An archetype is a form, not an image.', concept: 'archetype', status: 'linked', anchor: '[ch07-s01-p002]' },
          ],
        }),
      ],
    })
    const text = at(buildVault({ books: [two], concepts: [] }), 'Reading Buddy/Concepts/archetype.md').text
    expect(text).toContain('06 Approaching the Unconscious|Man and His Symbols · Approaching the Unconscious')
    expect(text).toContain('An archetype is a form, not an image.')
  })

  it('holds two books of the same name apart', () => {
    const other: BookExport = book({ meta: { ...meta, id: 'jung-2' as BookId } })
    const files = buildVault({ books: [book(), other], concepts: [] })
    const notes = files.filter((file) => file.path.endsWith('.md') && file.path.includes('Books/'))
    expect(new Set(notes.map((file) => file.path)).size).toBe(notes.length)
  })

  it('says the same thing twice over — nothing in a note reads the clock', () => {
    const once = buildVault({ books: [book()], concepts: [] })
    const twice = buildVault({ books: [book()], concepts: [] })
    expect(twice).toEqual(once)
  })
})

describe('a second export', () => {
  it('offers only the notes whose words have moved', () => {
    const first = buildVault({ books: [book()], concepts: [] })
    const seen = Object.fromEntries(first.map((file) => [file.path, fingerprint(file.text)]))

    const grown = book({
      summaries: [summary(), summary({ chapterId: 'ch07', chapter: 7, chapterTitle: 'Ancient myths' })],
    })
    const second = buildVault({ books: [grown], concepts: [] })
    const fresh = changedFiles(second, seen).map((file) => file.path)

    // The new chapter, the book note that now lists it, and the concept note
    // that now names it. Chapter 6 has not moved and is not in the zip.
    expect(fresh).toContain('Reading Buddy/Books/Man and His Symbols/07 Ancient myths.md')
    expect(fresh).not.toContain(
      'Reading Buddy/Books/Man and His Symbols/06 Approaching the Unconscious.md',
    )
  })

  it('carries nothing at all when the reader has read nothing', () => {
    const files = buildVault({ books: [book()], concepts: [] })
    const seen = Object.fromEntries(files.map((file) => [file.path, fingerprint(file.text)]))
    expect(changedFiles(files, seen)).toEqual([])
  })
})

describe('safeName', () => {
  it('drops what a file system and Obsidian both refuse', () => {
    expect(safeName('Chapter 3: what/why? [notes]')).toBe('Chapter 3 what why notes')
  })

  it('never returns an empty name', () => {
    expect(safeName('///')).toBe('Untitled')
  })
})
