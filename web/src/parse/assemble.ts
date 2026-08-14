/**
 * The shared back half of every parser. Each format's job is only to produce a
 * flat stream of `Block`s — headings, prose, and the non-prose things a book is
 * actually made of — in reading order. From there this module does the same work
 * for all of them: resolve which heading levels mean "chapter" and "section",
 * group the stream accordingly, and assign permanent anchors.
 *
 * Keeping this common means the rules that matter — level resolution, the
 * heading-free fallback, anchor assignment — exist in exactly one place. A book
 * imported as markdown, epub, docx or plain text is chaptered by identical
 * logic, so the reader and the tutor never have to care where it came from.
 *
 * The three rules carried here (see `docs/decisions.md`):
 *
 * 1. **Heading levels are resolved from the document, not assumed.** Plenty of
 *    real books start at `<h2>`, or use `<h1>` only for the title. The
 *    shallowest level actually present becomes chapters, the next one down
 *    becomes sections.
 * 2. **Anchors are a pure function of position**, built only by
 *    `structure/anchor.ts`. Re-parsing identical input yields identical anchors,
 *    which is what lets a highlight survive a re-import.
 * 3. **A table, figure or formula is one block, not many.** Shattering a table
 *    into one anchored paragraph per cell is how a permanent id ends up pointing
 *    at the string `0.91`.
 */

import type { ParsedBook } from '../storage/index.ts'
import { resolveLinks } from './links.ts'
import { stripRunningHeads } from './runningHead.ts'
import type {
  BlockKind,
  BookMeta,
  ChapterIndex,
  ChapterIndexEntry,
  FigureImage,
  Manifest,
  ManifestChapter,
  Paragraph,
  Section,
} from '../structure/index.ts'
import { chapterPath, countWordsIn, formatAnchor, sectionPath } from '../structure/index.ts'

/**
 * Fallback bucket sizes, used only when a document has no headings to divide
 * it. Arbitrary but fixed: the numbers matter far less than being deterministic,
 * because changing them later would move every anchor in every heading-free
 * book already in someone's library.
 */
const PARAGRAPHS_PER_SECTION = 20
const SECTIONS_PER_CHAPTER = 10

// --- The format-neutral input ------------------------------------------------

/**
 * A link as the parser found it: a range of the block's text, and wherever the
 * source document said it pointed (`chapter3.xhtml#note12`, `#note12`, or an
 * ordinary web address). Turned into a permanent anchor by `parse/links.ts`
 * once every block has one — which can't happen until the whole book is
 * assembled, because a link often points at a different chapter.
 */
export interface RawLink {
  /** Character offsets into the block's `text`. */
  start: number
  end: number
  href: string
}

interface BlockFields {
  kind: BlockKind
  /** A readable form of the block. Always present, whatever the kind. */
  text: string
  label?: string
  rows?: string[][]
  image?: FigureImage
  /** Links inside `text`, as the source wrote them. */
  links?: RawLink[]
  /** Ids the source markup put on or inside this block — what links point at. */
  ids?: string[]
  /**
   * This block began a new document in the source. Set by the formats that have
   * such a thing — epub's spine is the one that matters — and carried through
   * untouched; see `startsPage` on `Paragraph` for why it is a boundary rather
   * than a section split.
   */
  startsPage?: true
}

export interface HeadingBlock extends BlockFields {
  kind: 'heading'
  /** 1–6, as in `<h1>`–`<h6>` / `#`–`######`. */
  level: number
}

export interface ContentBlock extends BlockFields {
  kind: Exclude<BlockKind, 'heading'>
}

/** What every format's front end must produce: the book in reading order. */
export type Block = HeadingBlock | ContentBlock

/** Convenience for the common case — most blocks are ordinary prose. */
export function prose(text: string): ContentBlock {
  return { kind: 'prose', text }
}

// --- Level resolution --------------------------------------------------------

interface Levels {
  chapter: number
  /** Absent when the document uses only one heading level. */
  section: number | null
}

/**
 * Pick the chapter and section heading levels from what the document actually
 * contains. Returns `null` for a heading-free document, which routes to the
 * bucketing fallback.
 */
function resolveLevels(blocks: readonly Block[]): Levels | null {
  const present = new Set<number>()
  for (const block of blocks) {
    if (block.kind === 'heading') present.add(block.level)
  }
  if (present.size === 0) return null

  const sorted = [...present].sort((a, b) => a - b)
  return { chapter: sorted[0], section: sorted[1] ?? null }
}

/**
 * Demote a heading that turned out not to be structural. Levels deeper than the
 * section level are content, not divisions — keeping them as prose means no
 * text is lost between the source file and the reader.
 *
 * The text used to be prefixed with markdown `#`s to record the level it came
 * from. Nothing ever read them back: the reader renders a block's text as it
 * stands, so `#### Tantrism and Kundalini Yoga` reached the page with the
 * hashes still on it. The level is carried by `label: 'subheading'` instead,
 * which the reader already knows how to draw as a small heading.
 */
function demoteHeading(block: HeadingBlock): ContentBlock {
  const demoted: ContentBlock = { kind: 'prose', text: block.text, label: 'subheading' }
  // A demoted heading keeps its place in the book, so it keeps the fact that it
  // opened one of the source's documents — losing that here would silently undo
  // the page break for exactly the books that use deep heading levels.
  if (block.startsPage) demoted.startsPage = true
  return demoted
}

function asContent(block: Block): ContentBlock {
  return block.kind === 'heading' ? demoteHeading(block) : block
}

// --- Grouping ----------------------------------------------------------------

interface DraftSection {
  title?: string
  blocks: ContentBlock[]
}

interface DraftChapter {
  title: string
  sections: DraftSection[]
}

/** Start a section that exists only to hold prose appearing before any heading. */
function implicitSection(): DraftSection {
  return { blocks: [] }
}

function groupByHeadings(
  blocks: readonly Block[],
  levels: Levels,
  meta: BookMeta,
): DraftChapter[] {
  const chapters: DraftChapter[] = []

  /**
   * Open a chapter and return it. Prose can legitimately appear before the
   * first heading (a preface, an epigraph), so this is also how an untitled
   * opening chapter gets created on demand.
   */
  function openChapter(title: string): DraftChapter {
    const draft: DraftChapter = { title, sections: [implicitSection()] }
    chapters.push(draft)
    return draft
  }

  /** The chapter being filled, creating one if the book hasn't started yet. */
  function currentChapter(): DraftChapter {
    return chapters.at(-1) ?? openChapter(meta.title)
  }

  /**
   * Ids belonging to headings that have been consumed as titles.
   *
   * A heading that opens a chapter or a section becomes that division's
   * *title* — the block itself is not kept, and until now its ids went with it.
   * Headings are the commonest link target in a book: every entry on an epub's
   * own contents page points at one, and so does many a cross-reference. So
   * each one was a link that resolved to nothing and was then dropped, leaving
   * text that looks tappable and isn't.
   *
   * They are handed to the first block of the division the heading opened,
   * which is where the heading itself would have sat.
   */
  let pendingIds: string[] = []

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === levels.chapter) {
      openChapter(block.text)
      pendingIds = [...pendingIds, ...(block.ids ?? [])]
      continue
    }

    const chapter = currentChapter()

    if (block.kind === 'heading' && levels.section !== null && block.level === levels.section) {
      chapter.sections.push({ title: block.text, blocks: [] })
      pendingIds = [...pendingIds, ...(block.ids ?? [])]
      continue
    }

    const section = chapter.sections.at(-1) ?? implicitSection()
    if (chapter.sections.length === 0) chapter.sections.push(section)

    const content = asContent(block)
    if (pendingIds.length > 0) {
      content.ids = [...pendingIds, ...(content.ids ?? [])]
      pendingIds = []
    }
    section.blocks.push(content)
  }

  // Drop a leading implicit section that never received any content — an
  // artefact of opening a chapter, not something the book actually contains.
  for (const draft of chapters) {
    if (
      draft.sections.length > 1 &&
      draft.sections[0].title === undefined &&
      draft.sections[0].blocks.length === 0
    ) {
      draft.sections.shift()
    }
  }

  return chapters
}

/**
 * The heading-free path: chop the block stream into fixed-size sections and
 * chapters so the book is still addressable, navigable and askable.
 */
function groupByBuckets(blocks: readonly Block[], meta: BookMeta): DraftChapter[] {
  const content = blocks.map(asContent)
  if (content.length === 0) return []

  const sections: DraftSection[] = []
  for (let i = 0; i < content.length; i += PARAGRAPHS_PER_SECTION) {
    sections.push({ blocks: content.slice(i, i + PARAGRAPHS_PER_SECTION) })
  }

  const chapters: DraftChapter[] = []
  for (let i = 0; i < sections.length; i += SECTIONS_PER_CHAPTER) {
    chapters.push({
      title: sections.length > SECTIONS_PER_CHAPTER ? `Part ${chapters.length + 1}` : meta.title,
      sections: sections.slice(i, i + SECTIONS_PER_CHAPTER),
    })
  }

  return chapters
}

// --- Public API --------------------------------------------------------------

/**
 * Turn a format-neutral block stream into the shared structure, ready to hand
 * straight to `repository.saveParsedBook`.
 *
 * Manifest summaries and the per-section concept/vocabulary/theme fields are
 * left unfilled on purpose — those are WP-09 and WP-10, and they need a model
 * call this pure function has no business making.
 */
export function assembleBook(blocks: readonly Block[], meta: BookMeta): ParsedBook {
  // Furniture is dropped here, before anything is numbered. Running headers and
  // the table of contents must never consume an anchor — an anchor is permanent,
  // and one spent on page furniture is one that shifts every id after it if we
  // ever learn to recognise it properly.
  const content = blocks.filter((block) => block.kind !== 'furniture')

  // Running heads that were glued to the front of a paragraph rather than left
  // standing alone. This runs here, and not in a format's own parser, because
  // it needs the *whole* book: it identifies the head by what repeats across
  // every page, and a single chapter file may only contain one.
  const stripped = stripRunningHeads(content)

  const levels = resolveLevels(stripped)
  const drafts =
    levels === null ? groupByBuckets(stripped, meta) : groupByHeadings(stripped, levels, meta)

  const manifestChapters: ManifestChapter[] = []
  const chapters: ChapterIndex[] = []
  const sections: Section[] = []

  drafts.forEach((draft, chapterIndex) => {
    const chapterNumber = chapterIndex + 1
    let chapterWords = 0

    const entries: ChapterIndexEntry[] = draft.sections.map((draftSection, sectionIndex) => {
      const sectionNumber = sectionIndex + 1
      const path = sectionPath(chapterNumber, sectionNumber)

      const paragraphs: Paragraph[] = draftSection.blocks.map((block, paragraphIndex) => {
        const paragraph: Paragraph = {
          anchor: formatAnchor({
            chapter: chapterNumber,
            section: sectionNumber,
            paragraph: paragraphIndex + 1,
          }),
          text: block.text,
          kind: block.kind,
        }
        // Only set the optional fields when they carry something, so a plain
        // prose paragraph stays a two-field object in storage.
        if (block.label !== undefined) paragraph.label = block.label
        if (block.rows !== undefined) paragraph.rows = block.rows
        if (block.image !== undefined) paragraph.image = block.image
        if (block.startsPage) paragraph.startsPage = true
        // Carried through unresolved — as bare destinations, which is all the
        // parser knows. `parse/links.ts` upgrades the ones that turn out to
        // point inside this book into anchors, once every block has one: a link
        // into chapter 9 can't be resolved while chapter 2 is being assembled.
        if (block.links !== undefined) {
          paragraph.links = block.links.map((link) => ({
            start: link.start,
            end: link.end,
            url: link.href,
          }))
        }
        if (block.ids !== undefined) paragraph.ids = block.ids
        return paragraph
      })

      // Counted from the same `text` every block is guaranteed to carry, so a
      // table or a formula contributes its readable form rather than nothing —
      // getting past a 40-row table really is a chunk of reading.
      const words = countWordsIn(paragraphs.map((paragraph) => paragraph.text))
      chapterWords += words

      sections.push({
        chapter: chapterNumber,
        section: sectionNumber,
        path,
        title: draftSection.title,
        paragraphs,
      })

      return { section: sectionNumber, title: draftSection.title, path, words }
    })

    chapters.push({
      chapter: chapterNumber,
      title: draft.title,
      path: chapterPath(chapterNumber),
      sections: entries,
    })

    // Summary is WP-09's job; the field is present but deliberately empty.
    // `words` is not — the manifest is the only thing the reader has in memory,
    // so the page number has to be answerable from here alone.
    manifestChapters.push({
      chapter: chapterNumber,
      title: draft.title,
      summary: '',
      words: chapterWords,
    })
  })

  const manifest: Manifest = {
    bookId: meta.id,
    title: meta.title,
    chapters: manifestChapters,
  }

  // Last, and here rather than at each format's call site: resolution needs the
  // *finished* book, because a link usually points at a chapter that didn't
  // exist yet when its own chapter was assembled. Doing it here also means no
  // parser can forget to — and a book whose ids reached storage unresolved
  // would carry thousands of rows of dead weight.
  return resolveLinks({ meta, manifest, chapters, sections })
}
