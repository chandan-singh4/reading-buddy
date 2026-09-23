// Must come first: installs a real IndexedDB implementation onto globals.
//
// A round trip: the real exporter writes a vault, and the restore reads it back
// into an empty device. The layout is `vault.ts`'s, not a hand-made copy of
// it, so a change to the export that the restore can't read fails here.
import 'fake-indexeddb/auto'

import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDb, type ReadingBuddyDB, type StoredNote, type StoredTutorThread } from '../storage/db.ts'
import type { Anchor, BookId, BookMeta, Section } from '../structure/index.ts'
import { parseChapter, readPicked, restoreVault } from './restore.ts'
import { buildVault, type VaultFile } from './vault.ts'

const meta: BookMeta = {
  id: 'jung-1' as BookId,
  title: 'Man and His Symbols',
  author: 'Carl Gustav Jung',
  source: 'epub',
  type: 'dense-technical',
  importedAt: '2026-08-01T00:00:00.000Z',
}

const a = (text: string) => text as Anchor

/** Chapter 6, two sections. The words the marks were made on are in here. */
const sections: Section[] = [
  {
    chapter: 6,
    section: 1,
    path: 'ch06-s01' as Section['path'],
    paragraphs: [
      { anchor: a('[ch06-s01-p001]'), kind: 'prose', text: 'Approaching the unconscious.' },
      {
        anchor: a('[ch06-s01-p003]'),
        kind: 'prose',
        text: 'Man likes to believe that the gods did not leave; they only changed their names.',
      },
    ],
  },
  {
    chapter: 6,
    section: 2,
    path: 'ch06-s02' as Section['path'],
    paragraphs: [
      { anchor: a('[ch06-s02-p001]'), kind: 'prose', text: 'What we call civilized consciousness.' },
    ],
  },
]

function note(over: Partial<StoredNote>): StoredNote {
  return {
    bookId: meta.id,
    id: 'n1',
    anchor: a('[ch06-s01-p003]'),
    author: 'you',
    text: '',
    createdAt: '2026-08-21T10:00:00.000Z',
    ...over,
  }
}

const thread: StoredTutorThread = {
  bookId: meta.id,
  id: 't1',
  anchor: a('[ch06-s02-p001]'),
  excerpt: 'What we call civilized consciousness.',
  kind: 'paragraph',
  messages: [
    { role: 'you', text: 'What does he mean by this?', ts: 1 },
    {
      role: 'claude',
      text: 'He means the mind you can account for.\n\n> A quoted line inside the answer.\n\nAnd a second paragraph.',
      ts: 2,
    },
    { role: 'you', text: 'And the rest?', ts: 3 },
  ],
  createdAt: '2026-08-21T11:00:00.000Z',
  updatedAt: '2026-08-21T11:05:00.000Z',
}

const notes: StoredNote[] = [
  note({ id: 'n1', quote: 'the gods did not leave', text: '', colour: '#a9c7f0' }),
  note({ id: 'n2', quote: 'they only changed their names', text: 'Compare Aion.\n\nAnd The Red Book.' }),
  note({ id: 'n3', author: 'claude', quote: 'the mind you can account for', text: '', fromThread: 't1' }),
  note({ id: 'n4', quote: 'words this book does not hold', text: 'Lost place.' }),
]

function exported(): VaultFile[] {
  return buildVault({
    books: [{ meta, summaries: [], notes, threads: [thread] }],
    concepts: [],
  })
}

let n = 0
let db: ReadingBuddyDB

beforeEach(() => {
  n += 1
  db = createDb(`restore-${n}`)
})

afterEach(() => db.close())

const deps = () => ({
  listBooks: async () => [meta],
  listSections: async () => sections,
  database: db,
  now: () => Date.parse('2026-09-23T12:00:00.000Z'),
})

describe('reading a chapter note back', () => {
  it('finds every highlight, its note, and who wrote it', () => {
    const chapter = exported()
      .map(parseChapter)
      .find((c) => c !== undefined)
    expect(chapter?.book).toBe('Man and His Symbols')
    expect(chapter?.chapter).toBe(6)
    expect(chapter?.notes).toEqual([
      { quote: 'the gods did not leave', text: '', author: 'you' },
      { quote: 'they only changed their names', text: 'Compare Aion.\n\nAnd The Red Book.', author: 'you' },
      { quote: 'the mind you can account for', text: '', author: 'claude' },
      { quote: 'words this book does not hold', text: 'Lost place.', author: 'you' },
    ])
  })

  it('keeps a Veda answer whole, blank lines and quotes and all', () => {
    const chapter = exported().map(parseChapter).find((c) => c !== undefined)
    expect(chapter?.threads).toEqual([
      {
        excerpt: 'What we call civilized consciousness.',
        messages: thread.messages.map(({ role, text }) => ({ role, text })),
      },
    ])
  })

  it('ignores the book, concept and index notes', () => {
    const parsed = exported().map(parseChapter).filter((c) => c !== undefined)
    expect(parsed).toHaveLength(1)
  })
})

describe('restoring', () => {
  it('puts every highlight and conversation back where it was', async () => {
    const report = await restoreVault(exported(), deps())
    expect(report).toEqual({ notes: 4, threads: 1, skipped: 0, unplaced: 1, missingBooks: [] })

    const rows = await db.notes.toArray()
    const byQuote = new Map(rows.map((row) => [row.quote, row]))
    expect(byQuote.get('the gods did not leave')?.anchor).toBe('[ch06-s01-p003]')
    expect(byQuote.get('the gods did not leave')?.colour).toBe('#f2df6b')
    expect(byQuote.get('they only changed their names')?.text).toBe('Compare Aion.\n\nAnd The Red Book.')
    // The words are not in the book: kept, at the top of its chapter.
    expect(byQuote.get('words this book does not hold')?.anchor).toBe('[ch06-s01-p001]')

    const [restored] = await db.tutor.toArray()
    expect(restored?.anchor).toBe('[ch06-s02-p001]')
    expect(restored?.kind).toBe('paragraph')
    expect(restored?.messages.map((m) => m.role)).toEqual(['you', 'claude', 'you'])

    // Veda's kept line goes back to the conversation it was said in.
    const kept = byQuote.get('the mind you can account for')
    expect(kept?.author).toBe('claude')
    expect(kept?.fromThread).toBe(restored?.id)
    expect(kept?.anchor).toBe(restored?.anchor)
  })

  it('writes nothing twice, however many times it runs', async () => {
    await restoreVault(exported(), deps())
    const again = await restoreVault(exported(), deps())
    expect(again).toMatchObject({ notes: 0, threads: 0, skipped: 5 })
    expect(await db.notes.count()).toBe(4)
    expect(await db.tutor.count()).toBe(1)
  })

  it('names a book the shelf does not have', async () => {
    const report = await restoreVault(exported(), { ...deps(), listBooks: async () => [] })
    expect(report.missingBooks).toEqual(['Man and His Symbols'])
    expect(await db.notes.count()).toBe(0)
  })

  it('reads zips, the later one winning on the same chapter', async () => {
    const files = exported()
    const older = files.map((file) => ({ ...file, text: file.text.replace('Compare Aion.', 'Draft.') }))
    const zip = (vault: VaultFile[], name: string) => {
      const entries: Record<string, Uint8Array> = {}
      for (const file of vault) entries[file.path] = strToU8(file.text)
      return new File([zipSync(entries) as BlobPart], name)
    }
    const picked = await readPicked([
      zip(files, 'reading-buddy-vault-2026-09-05.zip'),
      zip(older, 'reading-buddy-vault-2026-08-31.zip'),
    ])
    const chapter = picked.map(parseChapter).find((c) => c !== undefined)
    expect(chapter?.notes[1]?.text).toBe('Compare Aion.\n\nAnd The Red Book.')
  })
})
