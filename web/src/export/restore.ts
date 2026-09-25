import { strFromU8, unzipSync } from 'fflate'

import { HIGHLIGHT_COLOURS } from '../reader/highlightStyle.ts'
import { recoverMarkdown } from '../reader/pickMarkdown.ts'
import { db as defaultDb, type ReadingBuddyDB, type StoredNote, type StoredTutorThread } from '../storage/db.ts'
import { placesIn, relocate } from '../storage/relocate.ts'
import type { Anchor, BookId, BookMeta, Section } from '../structure/index.ts'
import { formatAnchor } from '../structure/index.ts'
import { safeName, type VaultFile } from './vault.ts'

/**
 * The Obsidian export, read back into the app.
 *
 * ## Why this exists
 *
 * On 2026-09-23 Android Chrome cleared the app's storage to free space, and
 * every highlight and every conversation with Veda went with it — they were
 * device-local then. The only other copy anywhere was the vault the reader had
 * exported on 2026-08-31 and 2026-09-05. This turns that copy back into rows.
 *
 * ## What the vault does not hold, and what stands in for it
 *
 * `vault.ts` wrote for a person, not for a machine, so four things never left:
 *
 *   - **The anchor.** A highlight is written as its words, not its paragraph.
 *     The words are enough: `relocate` finds a passage by its words already,
 *     for the re-parse case, and the chapter number in the front matter keeps
 *     it to the right part of the book.
 *   - **The colour.** Every restored highlight is yellow, the first colour.
 *   - **The dates.** Everything is stamped with the moment of the restore.
 *   - **The link from a kept line of Veda's to its thread.** Found again by
 *     looking for the line inside the restored conversations of that chapter.
 *
 * ## What it will not do
 *
 * It never writes a row twice. A highlight already on the device with the same
 * words and the same note is skipped, and so is a thread about the same
 * passage, so the reader can pick every zip they have — the full one and each
 * "what's new" — in one go, or run it again, and get one copy of each.
 *
 * A mark whose words are not in the book any more is still restored, to the
 * first paragraph of its chapter, and counted: losing the reader's own words a
 * second time because a parser moved a comma is the one outcome worse than a
 * mark in the wrong place.
 */

/** One highlight or note, as the vault wrote it. */
export interface VaultNote {
  quote?: string
  text: string
  author: 'you' | 'claude'
}

/** One conversation, as the vault wrote it. */
export interface VaultThread {
  excerpt: string
  messages: { role: 'you' | 'claude'; text: string }[]
}

/** Everything one chapter note held that belongs back in the app. */
export interface VaultChapter {
  book: string
  chapter: number
  notes: VaultNote[]
  threads: VaultThread[]
}

/* --- Reading the files ---------------------------------------------------- */

/**
 * Every `.md` file in what the reader picked, zips opened.
 *
 * The same path in two zips is the same chapter at two dates, and the later
 * one holds everything the earlier did and more. So files are opened in name
 * order — `reading-buddy-vault-2026-08-31.zip` before `…-09-05.zip` — and the
 * later copy of a path replaces the earlier. The picker's own order is
 * whatever the phone felt like.
 */
export async function readPicked(files: readonly File[]): Promise<VaultFile[]> {
  const byPath = new Map<string, VaultFile>()
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name))
  for (const file of ordered) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.zip')) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (entry) => entry.name.toLowerCase().endsWith('.md'),
      })
      for (const [path, bytes] of Object.entries(entries)) {
        byPath.set(path, { path, text: strFromU8(bytes) })
      }
    } else if (lower.endsWith('.md')) {
      const path = file.webkitRelativePath || file.name
      byPath.set(path, { path, text: await file.text() })
    }
  }
  return [...byPath.values()]
}

/** A double-quoted YAML scalar, as `vault.ts` writes it. */
function unyaml(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\(["\\])/gu, '$1')
  }
  return value
}

function frontMatter(text: string): { fields: Map<string, string>; body: string } | undefined {
  const normal = text.replace(/\r\n?/gu, '\n')
  if (!normal.startsWith('---\n')) return undefined
  const end = normal.indexOf('\n---', 4)
  if (end < 0) return undefined
  const fields = new Map<string, string>()
  const tags: string[] = []
  for (const line of normal.slice(4, end).split('\n')) {
    const tag = /^\s+-\s+(.+)$/u.exec(line)
    if (tag) {
      tags.push(tag[1]!.trim())
      continue
    }
    const field = /^([a-z]+):\s?(.*)$/u.exec(line)
    if (field) fields.set(field[1]!, field[2]!)
  }
  fields.set('tags', tags.join(','))
  return { fields, body: normal.slice(end + 4).replace(/^[^\n]*\n/u, '') }
}

const isQuote = (block: string): boolean => block.split('\n').every((line) => line.startsWith('>'))

function unquote(block: string): string {
  return block
    .split('\n')
    .map((line) => line.replace(/^> ?/u, ''))
    .join('\n')
    .trim()
}

/** The blocks under one `## ` heading, up to the next one. */
function part(blocks: readonly string[], heading: string): string[] {
  const start = blocks.indexOf(`## ${heading}`)
  if (start < 0) return []
  const rest = blocks.slice(start + 1)
  const end = rest.findIndex((block) => /^## /u.test(block))
  return end < 0 ? rest : rest.slice(0, end)
}

/**
 * One chapter note back into its parts, or undefined for any other note.
 *
 * The layout is `chapterNote` in `vault.ts`: blocks joined by one blank line,
 * a passage always as a block quote, a message always opening `**You:**` or
 * `**Veda:**`. Veda's answers are Markdown and may hold blank lines, quotes and
 * headings of their own, so a message runs until the next message marker, and a
 * `### ` only opens a new conversation when a quoted passage follows it.
 */
export function parseChapter(file: VaultFile): VaultChapter | undefined {
  const parsed = frontMatter(file.text)
  if (!parsed) return undefined
  const { fields, body } = parsed
  if (!fields.get('tags')?.split(',').includes('chapter')) return undefined
  const raw = fields.get('book')
  const book = raw === undefined ? undefined : unyaml(raw)
  const chapter = Number(fields.get('chapter'))
  if (book === undefined || !Number.isInteger(chapter)) return undefined

  const blocks = body
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter((block) => block !== '')

  const notes: VaultNote[] = []
  for (const block of part(blocks, 'Your highlights')) {
    if (isQuote(block)) {
      const lines = unquote(block).split('\n')
      const byVeda = lines[lines.length - 1]?.trim() === '— Veda'
      const quote = (byVeda ? lines.slice(0, -1) : lines).join('\n').trim()
      notes.push({ quote, text: '', author: byVeda ? 'claude' : 'you' })
      continue
    }
    const last = notes[notes.length - 1]
    if (last) last.text = last.text === '' ? block : `${last.text}\n\n${block}`
    else notes.push({ text: block, author: 'you' })
  }

  const threads: VaultThread[] = []
  const talk = part(blocks, 'Conversations with Veda')
  for (let i = 0; i < talk.length; i += 1) {
    const block = talk[i]!
    const next = talk[i + 1]
    if (/^### /u.test(block) && next !== undefined && isQuote(next)) {
      threads.push({ excerpt: unquote(next), messages: [] })
      i += 1
      continue
    }
    const thread = threads[threads.length - 1]
    if (!thread) continue
    const opens = /^\*\*(You|Veda):\*\* ?/u.exec(block)
    if (opens) {
      thread.messages.push({
        role: opens[1] === 'You' ? 'you' : 'claude',
        text: block.slice(opens[0].length),
      })
      continue
    }
    const message = thread.messages[thread.messages.length - 1]
    if (message) message.text = `${message.text}\n\n${block}`
  }

  return { book, chapter, notes, threads }
}

/* --- Putting it back ------------------------------------------------------ */

export interface RestoreReport {
  notes: number
  threads: number
  /** Already on the device, so left alone. */
  skipped: number
  /** Restored to the start of their chapter, because the words were not found. */
  unplaced: number
  /** Kept lines of Veda's the files held, whatever became of them. */
  vedaFound: number
  /** Of those, the ones no conversation could be found for: under "Veda", not "Veda's Quotes". */
  vedaUnlinked: number
  /** Kept lines of Veda's, restored earlier without their thread, now linked. */
  linked: number
  /** Book titles in the vault that match nothing on the shelf. */
  missingBooks: string[]
}

export interface RestoreDeps {
  listBooks(): Promise<BookMeta[]>
  listSections(bookId: BookId): Promise<Section[]>
  database?: ReadingBuddyDB
  now?: () => number
}

/** Titles compare as the vault named their folder, so a renamed colon still matches. */
function sameTitle(a: string, b: string): boolean {
  return safeName(a).toLowerCase() === safeName(b).toLowerCase()
}

const fold = (text: string): string => text.replace(/\s+/gu, ' ').trim().toLowerCase()

/** Words only: no marks, no curly quotes, no case. What both copies share. */
function words(text: string): string[] {
  return text
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[“”„‟]/gu, '"')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word) => word !== '')
}

/**
 * How surely a kept line of Veda's was said in this thread, from 0 to 1.
 *
 * The note keeps the line twice: `quote` as the plain words the reader saw,
 * and `text` with its Markdown marks. Veda's answer in the thread is Markdown,
 * so the plain words are not a substring of it wherever the line held a bold
 * word or a list marker. `recoverMarkdown` — the reader screen's own way back
 * — reads past the marks and settles most lines outright.
 *
 * What it misses (a line across two list items, a curly quote, a line too
 * short for it) is scored by its words: the share of the line's words, in
 * order, found as one run in the answer's words. A line the reader picked out
 * of an answer is a run of that answer, so a true match scores near 1 and a
 * wrong thread scores low.
 */
function saidIn(thread: StoredTutorThread, note: VaultNote): number {
  const line = words(note.quote || note.text)
  if (line.length === 0) return 0
  let best = 0
  for (const message of thread.messages) {
    if (message.role !== 'claude') continue
    if (note.quote && recoverMarkdown(note.quote, message.text) !== null) return 1
    const said = words(message.text)
    // The longest run of the line's words found in order in the answer.
    for (let i = 0; i < said.length; i += 1) {
      let run = 0
      while (i + run < said.length && run < line.length && said[i + run] === line[run]) run += 1
      if (run > 0) best = Math.max(best, run / line.length)
      if (best === 1) return 1
    }
    // A line may start part-way into its first word's run; try each start.
    const text = ` ${said.join(' ')} `
    if (text.includes(` ${line.join(' ')} `)) return 1
  }
  return best
}

/** Below this, a line is not linked: a wrong conversation is worse than none. */
const LINKED = 0.8

/** The thread a kept line came from: its own chapter's first, then the book's. */
function originOf(
  note: VaultNote,
  here: readonly StoredTutorThread[],
  all: readonly StoredTutorThread[],
): StoredTutorThread | undefined {
  let found: StoredTutorThread | undefined
  let score = 0
  for (const thread of [...here, ...all]) {
    const s = saidIn(thread, note)
    // Strictly better only, so a tie keeps the chapter's own thread.
    if (s > score) {
      found = thread
      score = s
    }
    if (score === 1) break
  }
  return score >= LINKED ? found : undefined
}

export async function restoreVault(
  files: readonly VaultFile[],
  deps: RestoreDeps,
): Promise<RestoreReport> {
  const database = deps.database ?? defaultDb
  const now = deps.now ?? Date.now
  const report: RestoreReport = { notes: 0, threads: 0, skipped: 0, unplaced: 0, linked: 0, vedaFound: 0, vedaUnlinked: 0, missingBooks: [] }

  const chapters = files.map(parseChapter).filter((c): c is VaultChapter => c !== undefined)
  const shelf = await deps.listBooks()
  const byBook = new Map<string, VaultChapter[]>()
  for (const chapter of chapters) {
    const list = byBook.get(chapter.book) ?? []
    list.push(chapter)
    byBook.set(chapter.book, list)
  }

  let tick = 0
  const stamp = (): number => now() + (tick += 1)

  for (const [title, bookChapters] of byBook) {
    const meta = shelf.find((book) => sameTitle(book.title, title))
    if (!meta) {
      report.missingBooks.push(title)
      continue
    }
    const bookId = meta.id
    const sections = await deps.listSections(bookId)
    const places = placesIn(sections)
    const firstIn = (chapter: number): Anchor =>
      places.find((place) => place.chapter === chapter)?.anchor ??
      formatAnchor({ chapter, section: 1, paragraph: 1 })

    /** Where these words are now, and whether they were found at all. */
    const place = (chapter: number, words: string): { anchor: Anchor; found: boolean } => {
      const hint = firstIn(chapter)
      const anchor = words.trim() === '' ? undefined : relocate(places, hint, words)
      return anchor ? { anchor, found: true } : { anchor: hint, found: false }
    }

    const haveNotes = await database.notes.where('bookId').equals(bookId).toArray()
    const haveThreads = await database.tutor.where('bookId').equals(bookId).toArray()
    const noteKey = (quote: string | undefined, text: string) => `${fold(quote ?? '')}\u0000${fold(text)}`
    const seenNotes = new Map(haveNotes.map((row) => [noteKey(row.quote, row.text), row]))
    const seenThreads = new Map(haveThreads.map((row) => [fold(row.excerpt), row]))

    const newNotes: StoredNote[] = []
    const repairs: StoredNote[] = []
    const newThreads: StoredTutorThread[] = []

    /** Every thread of the book, by the chapter its vault note was in. */
    const threadsBy = new Map<number, StoredTutorThread[]>()
    for (const chapter of bookChapters) {
      const threadsHere = threadsBy.get(chapter.chapter) ?? []
      threadsBy.set(chapter.chapter, threadsHere)
      for (const thread of chapter.threads) {
        const known = seenThreads.get(fold(thread.excerpt))
        if (known) {
          report.skipped += 1
          threadsHere.push(known)
          continue
        }
        const { anchor, found } = place(chapter.chapter, thread.excerpt)
        if (!found) report.unplaced += 1
        const paragraph = places.find((p) => p.anchor === anchor)
        const at = stamp()
        const row: StoredTutorThread = {
          bookId,
          id: crypto.randomUUID(),
          anchor,
          excerpt: thread.excerpt,
          kind: paragraph && paragraph.text === fold(thread.excerpt) ? 'paragraph' : 'sentence',
          messages: thread.messages.map((message) => ({
            role: message.role,
            text: message.text,
            ts: stamp(),
          })),
          createdAt: new Date(at).toISOString(),
          updatedAt: new Date(stamp()).toISOString(),
        }
        seenThreads.set(fold(thread.excerpt), row)
        threadsHere.push(row)
        newThreads.push(row)
      }
    }
    const allThreads = [...seenThreads.values()]

    for (const chapter of bookChapters) {
      const threadsHere = threadsBy.get(chapter.chapter) ?? []
      for (const note of chapter.notes) {
        const key = noteKey(note.quote, note.text)
        const origin =
          note.author === 'claude' && note.quote
            ? originOf(note, threadsHere, allThreads)
            : undefined
        if (note.author === 'claude' && note.quote) {
          report.vedaFound += 1
          if (!origin && !seenNotes.get(key)?.fromThread) report.vedaUnlinked += 1
        }

        const have = seenNotes.get(key)
        if (have) {
          // Restored before this fix without the link to its thread, and so
          // drawn as a whole conversation rather than a kept line. Mend it.
          if (origin && have.author === 'claude' && !have.fromThread) {
            repairs.push({ ...have, anchor: origin.anchor, fromThread: origin.id })
          } else {
            report.skipped += 1
          }
          continue
        }

        let anchor: Anchor
        let fromThread: string | undefined
        if (origin) {
          anchor = origin.anchor
          fromThread = origin.id
        } else {
          const placed = place(chapter.chapter, note.quote ?? '')
          anchor = placed.anchor
          if (!placed.found) report.unplaced += 1
        }

        const row: StoredNote = {
          bookId,
          id: crypto.randomUUID(),
          anchor,
          author: note.author,
          text: note.text,
          createdAt: new Date(stamp()).toISOString(),
          ...(note.quote ? { quote: note.quote } : {}),
          // A mark of the reader's own on the book's words is a highlight, and
          // a highlight carries a colour; the vault kept none, so the first.
          ...(note.author === 'you' && note.quote ? { colour: HIGHLIGHT_COLOURS[0]!.value } : {}),
          ...(fromThread ? { fromThread } : {}),
        }
        seenNotes.set(key, row)
        newNotes.push(row)
      }
    }

    await database.transaction('rw', database.notes, database.tutor, async () => {
      if (newThreads.length > 0) await database.tutor.bulkPut(newThreads)
      if (newNotes.length > 0) await database.notes.bulkPut(newNotes)
      if (repairs.length > 0) await database.notes.bulkPut(repairs)
    })
    report.linked += repairs.length
    report.notes += newNotes.length
    report.threads += newThreads.length
  }

  return report
}
