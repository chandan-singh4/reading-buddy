import type {
  StoredChapterSummary,
  StoredConcept,
  StoredNote,
  StoredTutorThread,
} from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { tryParseAnchor } from '../structure/index.ts'

/**
 * The reader's work, written out as an Obsidian vault.
 *
 * ## Why a folder and not one big file
 *
 * Obsidian's unit is the note, and its one real idea is the link between notes.
 * A single Markdown file would carry the same words and none of the value: no
 * backlinks, no graph, nothing to open when you click a concept. So a book is a
 * note, each of its chapters is a note, and each concept is a note — and every
 * mention of a concept is a `[[wikilink]]` to it. Click "archetype" and you get
 * every chapter that raised it, in every book, for free.
 *
 * ## Why every path is fixed
 *
 * The reader keeps reading, so this export runs again next month with more in
 * it. If the second export named its files differently the vault would end up
 * holding two copies of every chapter. So a note's path is worked out from what
 * it is about — the book's title and the chapter's number — and never from the
 * time, the order, or anything that moves. A second export lands on the same
 * paths, and Obsidian replaces rather than adds.
 *
 * The same rule makes the *contents* fixed: nothing in a note says when it was
 * exported. Every date printed comes from the row it describes. So a chapter
 * the reader has not touched produces the same bytes it did last month, and
 * `changedFiles` in `seen.ts` can leave it out of the next zip altogether.
 *
 * ## Links are written from the vault root
 *
 * `[[Reading Buddy/Books/Man and His Symbols/06 The archetype|06 The archetype]]`
 * rather than `[[06 The archetype]]`. Short links break as soon as two books
 * both have a chapter called "Introduction", and two books eventually do. The
 * cost is that the folder has to sit at the top of the vault, which the index
 * note says in its first line.
 */

/** One note: where it goes in the vault, and what is in it. */
export interface VaultFile {
  path: string
  text: string
}

/** Everything one book contributes. */
export interface BookExport {
  meta: BookMeta
  summaries: readonly StoredChapterSummary[]
  notes: readonly StoredNote[]
  threads: readonly StoredTutorThread[]
}

export interface VaultInput {
  books: readonly BookExport[]
  concepts: readonly StoredConcept[]
}

/** The one folder the reader drags in. */
export const ROOT = 'Reading Buddy'

/* --- Names ---------------------------------------------------------------- */

/**
 * A title turned into a file name that survives Windows, macOS and Obsidian.
 *
 * `#`, `^`, `[`, `]` and `|` are legal on disk and are exactly the characters
 * Obsidian reads as link syntax, so they go too.
 */
export function safeName(raw: string): string {
  const name = raw
    .replace(/[\\/:*?"<>|#^[\]]/gu, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 80)
    .trim()
  return name === '' ? 'Untitled' : name
}

/** `06`, so chapters sort by number and not by their first digit. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/* --- Markdown ------------------------------------------------------------- */

/** A YAML scalar that cannot break the front matter, whatever is in it. */
function yaml(value: string): string {
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

/** Text as a block quote, including the blank lines inside it. */
function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line.trim()}`.trimEnd())
    .join('\n')
}

/** Link text cannot hold the characters that end a link. */
function label(text: string): string {
  return text
    .replace(/[[\]|]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function link(path: string, shown: string): string {
  return `[[${path}|${label(shown)}]]`
}

function conceptPath(name: string): string {
  return `${ROOT}/Concepts/${safeName(name)}`
}

/** Sections joined with one blank line, with the empty ones dropped. */
function join(parts: readonly (string | undefined)[]): string {
  return (
    parts.filter((part): part is string => part !== undefined && part !== '').join('\n\n') + '\n'
  )
}

/** The opening of a passage, for a heading. */
function firstWords(text: string, limit = 60): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit).trimEnd()}…`
}

/* --- The build ------------------------------------------------------------ */

/** What one chapter of one book gathered, from all four stores. */
interface ChapterBundle {
  chapter: number
  title: string
  path: string
  chapterSummary?: StoredChapterSummary
  sections: StoredChapterSummary[]
  notes: StoredNote[]
  threads: StoredTutorThread[]
}

function chapterOf(anchor: string): number | undefined {
  return tryParseAnchor(anchor as never)?.chapter
}

/**
 * A book's chapters, in reading order, holding everything anchored in them.
 *
 * A chapter with no summary still gets a note when the reader highlighted
 * something in it. Their own marks are the part of this that is theirs, and
 * they must not wait on a model having been run.
 */
function bundlesIn(book: BookExport, folder: string): ChapterBundle[] {
  const by = new Map<number, ChapterBundle>()

  const open = (chapter: number, title?: string): ChapterBundle => {
    const found = by.get(chapter)
    if (found) {
      if (found.title === `Chapter ${chapter}` && title !== undefined) {
        found.title = title
        found.path = `${folder}/${pad(chapter)} ${safeName(title)}`
      }
      return found
    }
    const named = title ?? `Chapter ${chapter}`
    const bundle: ChapterBundle = {
      chapter,
      title: named,
      path: `${folder}/${pad(chapter)} ${safeName(named)}`,
      sections: [],
      notes: [],
      threads: [],
    }
    by.set(chapter, bundle)
    return bundle
  }

  for (const row of book.summaries) {
    const bundle = open(row.chapter, row.chapterTitle)
    if (row.section === undefined) bundle.chapterSummary = row
    else bundle.sections.push(row)
  }
  for (const note of book.notes) {
    const chapter = chapterOf(note.anchor)
    if (chapter !== undefined) open(chapter).notes.push(note)
  }
  for (const thread of book.threads) {
    const chapter = chapterOf(thread.anchor)
    if (chapter !== undefined) open(chapter).threads.push(thread)
  }

  const bundles = [...by.values()].sort((a, b) => a.chapter - b.chapter)
  for (const bundle of bundles) {
    bundle.sections.sort((a, b) => (a.section ?? 0) - (b.section ?? 0))
    bundle.notes.sort(
      (a, b) => a.anchor.localeCompare(b.anchor) || a.createdAt.localeCompare(b.createdAt),
    )
    bundle.threads.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return bundles
}

function conceptsIn(book: BookExport): string[] {
  const names = new Set<string>()
  for (const row of book.summaries) {
    for (const concept of row.concepts) names.add(concept.name)
    for (const item of row.items ?? []) names.add(item.concept)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

function chapterNote(book: BookExport, bundle: ChapterBundle, bookPath: string): VaultFile {
  const head = [
    '---',
    `book: ${yaml(book.meta.title)}`,
    book.meta.author === undefined ? undefined : `author: ${yaml(book.meta.author)}`,
    `chapter: ${bundle.chapter}`,
    bundle.chapterSummary === undefined
      ? undefined
      : `recapped: ${yaml(bundle.chapterSummary.recapAt)}`,
    'tags:',
    '  - reading-buddy',
    '  - chapter',
    '---',
  ]
    .filter((line) => line !== undefined)
    .join('\n')

  const parts: (string | undefined)[] = [
    head,
    `# ${bundle.title}`,
    `From ${link(bookPath, book.meta.title)}.`,
  ]

  if (bundle.chapterSummary) {
    parts.push('## Recap', `> [!abstract] Recap\n${quote(bundle.chapterSummary.recap)}`)
  }

  if (bundle.sections.length > 0) {
    parts.push('## Section by section')
    for (const section of bundle.sections) {
      parts.push(`### ${section.sectionTitle ?? `Section ${section.section ?? 0}`}`)
      parts.push(quote(section.recap))
    }
  }

  const names = new Set<string>()
  for (const row of [bundle.chapterSummary, ...bundle.sections]) {
    for (const concept of row?.concepts ?? []) names.add(concept.name)
  }
  if (names.size > 0) {
    parts.push('## Concepts')
    parts.push(
      [...names]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => `- ${link(conceptPath(name), name)}`)
        .join('\n'),
    )
  }

  const items = [bundle.chapterSummary, ...bundle.sections].flatMap((row) => row?.items ?? [])
  if (items.length > 0) {
    parts.push('## What you worked out here')
    parts.push(
      items
        .map((item) => `- ${item.claim} — ${link(conceptPath(item.concept), item.concept)}`)
        .join('\n'),
    )
  }

  if (bundle.notes.length > 0) {
    parts.push('## Your highlights')
    for (const note of bundle.notes) {
      if (note.quote !== undefined && note.quote.trim() !== '') {
        parts.push(quote(note.quote) + (note.author === 'claude' ? '\n> — Veda' : ''))
      }
      if (note.text.trim() !== '') parts.push(note.text.trim())
    }
  }

  if (bundle.threads.length > 0) {
    parts.push('## Conversations with Veda')
    for (const thread of bundle.threads) {
      parts.push(`### ${firstWords(thread.excerpt)}`)
      parts.push(quote(thread.excerpt))
      for (const message of thread.messages) {
        parts.push(`**${message.role === 'you' ? 'You' : 'Veda'}:** ${message.text.trim()}`)
      }
    }
  }

  return { path: `${bundle.path}.md`, text: join(parts) }
}

function bookNote(book: BookExport, bundles: readonly ChapterBundle[], path: string): VaultFile {
  const meta = book.meta
  const head = [
    '---',
    `title: ${yaml(meta.title)}`,
    meta.author === undefined ? undefined : `author: ${yaml(meta.author)}`,
    meta.isbn === undefined ? undefined : `isbn: ${yaml(meta.isbn)}`,
    meta.publisher === undefined ? undefined : `publisher: ${yaml(meta.publisher)}`,
    'tags:',
    '  - reading-buddy',
    '  - book',
    '---',
  ]
    .filter((line) => line !== undefined)
    .join('\n')

  const counts = [
    `${bundles.filter((bundle) => bundle.chapterSummary !== undefined).length} chapters summarised`,
    `${book.notes.length} highlight${book.notes.length === 1 ? '' : 's'}`,
    `${book.threads.length} conversation${book.threads.length === 1 ? '' : 's'} with Veda`,
  ].join(' · ')

  const names = conceptsIn(book)

  return {
    path: `${path}.md`,
    text: join([
      head,
      `# ${meta.title}`,
      meta.author === undefined ? undefined : `*by ${meta.author}*`,
      counts,
      '## Chapters',
      bundles.map((bundle) => `- ${link(bundle.path, bundle.title)}`).join('\n'),
      names.length === 0 ? undefined : '## Concepts in this book',
      names.length === 0
        ? undefined
        : names.map((name) => `- ${link(conceptPath(name), name)}`).join('\n'),
    ]),
  }
}

/** Where each concept was met, gathered across every book. */
interface ConceptUse {
  places: { path: string; shown: string }[]
  claims: { claim: string; path: string; shown: string }[]
}

function conceptNote(name: string, use: ConceptUse, first: StoredConcept | undefined): VaultFile {
  const head = [
    '---',
    `concept: ${yaml(name)}`,
    first === undefined ? undefined : `first-met: ${yaml(first.addedAt)}`,
    'tags:',
    '  - reading-buddy',
    '  - concept',
    '---',
  ]
    .filter((line) => line !== undefined)
    .join('\n')

  return {
    path: `${conceptPath(name)}.md`,
    text: join([
      head,
      `# ${name}`,
      use.places.length === 0 ? undefined : '## Where you met it',
      use.places.length === 0
        ? undefined
        : use.places.map((place) => `- ${link(place.path, place.shown)}`).join('\n'),
      use.claims.length === 0 ? undefined : '## What you established',
      use.claims.length === 0
        ? undefined
        : use.claims.map((one) => `- ${one.claim} (${link(one.path, one.shown)})`).join('\n'),
    ]),
  }
}

/**
 * The whole vault, as a list of notes.
 *
 * Sorted, so two runs over the same data produce the same list in the same
 * order. Nothing here reads the clock.
 */
export function buildVault(input: VaultInput): VaultFile[] {
  const books = [...input.books].sort(
    (a, b) => a.meta.title.localeCompare(b.meta.title) || a.meta.id.localeCompare(b.meta.id),
  )

  const files: VaultFile[] = []
  const uses = new Map<string, ConceptUse>()
  const useOf = (name: string): ConceptUse => {
    const found = uses.get(name)
    if (found) return found
    const fresh: ConceptUse = { places: [], claims: [] }
    uses.set(name, fresh)
    return fresh
  }

  const shelf: { path: string; title: string; id: BookId }[] = []
  const taken = new Set<string>()

  for (const book of books) {
    // Two books of the same name would otherwise write over one another. The
    // id is only reached for in that case, so ordinary paths stay readable.
    let path = `${ROOT}/Books/${safeName(book.meta.title)}`
    if (taken.has(path.toLowerCase())) path = `${path} (${book.meta.id.slice(0, 6)})`
    taken.add(path.toLowerCase())

    const bundles = bundlesIn(book, path)
    files.push(bookNote(book, bundles, path))
    for (const bundle of bundles) {
      files.push(chapterNote(book, bundle, path))
      const shown = `${book.meta.title} · ${bundle.title}`
      for (const row of [bundle.chapterSummary, ...bundle.sections]) {
        for (const concept of row?.concepts ?? []) {
          useOf(concept.name).places.push({ path: bundle.path, shown })
        }
        for (const item of row?.items ?? []) {
          useOf(item.concept).claims.push({ claim: item.claim, path: bundle.path, shown })
        }
      }
    }
    shelf.push({ path, title: book.meta.title, id: book.meta.id })
  }

  const known = new Map(input.concepts.map((row) => [row.name, row]))
  for (const name of [...uses.keys()].sort((a, b) => a.localeCompare(b))) {
    files.push(conceptNote(name, uses.get(name) as ConceptUse, known.get(name)))
  }

  files.push({
    path: `${ROOT}/Reading Buddy.md`,
    text: join([
      '---\ntags:\n  - reading-buddy\n---',
      '# Reading Buddy',
      'Drop the **Reading Buddy** folder at the top level of your vault. The links between these notes are written from the vault root, so they only resolve there.',
      'Export again whenever you like. Every note keeps the same file name, so a later export replaces these notes instead of adding a second copy of them.',
      '## Books',
      shelf.map((book) => `- ${link(book.path, book.title)}`).join('\n'),
    ]),
  })

  return files.sort((a, b) => a.path.localeCompare(b.path))
}
