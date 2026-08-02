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
import { chapterPath, formatAnchor, sectionPath } from '../structure/index.ts'

/**
 * Fallback bucket sizes, used only when a document has no headings to divide
 * it. Arbitrary but fixed: the numbers matter far less than being deterministic,
 * because changing them later would move every anchor in every heading-free
 * book already in someone's library.
 */
const PARAGRAPHS_PER_SECTION = 20
const SECTIONS_PER_CHAPTER = 10

// --- The format-neutral input ------------------------------------------------

interface BlockFields {
  kind: BlockKind
  /** A readable form of the block. Always present, whatever the kind. */
  text: string
  label?: string
  rows?: string[][]
  image?: FigureImage
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
 * section level are content, not divisions — keeping them as markdown-style
 * prose means no text is lost between the source file and the reader.
 */
function demoteHeading(block: HeadingBlock): ContentBlock {
  return { kind: 'prose', text: `${'#'.repeat(block.level)} ${block.text}` }
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

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === levels.chapter) {
      openChapter(block.text)
      continue
    }

    const chapter = currentChapter()

    if (block.kind === 'heading' && levels.section !== null && block.level === levels.section) {
      chapter.sections.push({ title: block.text, blocks: [] })
      continue
    }

    const section = chapter.sections.at(-1) ?? implicitSection()
    if (chapter.sections.length === 0) chapter.sections.push(section)
    section.blocks.push(asContent(block))
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

  const levels = resolveLevels(content)
  const drafts =
    levels === null ? groupByBuckets(content, meta) : groupByHeadings(content, levels, meta)

  const manifestChapters: ManifestChapter[] = []
  const chapters: ChapterIndex[] = []
  const sections: Section[] = []

  drafts.forEach((draft, chapterIndex) => {
    const chapterNumber = chapterIndex + 1

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
        return paragraph
      })

      sections.push({
        chapter: chapterNumber,
        section: sectionNumber,
        path,
        title: draftSection.title,
        paragraphs,
      })

      return { section: sectionNumber, title: draftSection.title, path }
    })

    chapters.push({
      chapter: chapterNumber,
      title: draft.title,
      path: chapterPath(chapterNumber),
      sections: entries,
    })

    // Summary is WP-09's job; the field is present but deliberately empty.
    manifestChapters.push({ chapter: chapterNumber, title: draft.title, summary: '' })
  })

  const manifest: Manifest = {
    bookId: meta.id,
    title: meta.title,
    chapters: manifestChapters,
  }

  return { meta, manifest, chapters, sections }
}
