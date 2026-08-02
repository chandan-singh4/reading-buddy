/**
 * The single public entry point for the parsed-book structure. Import from
 * `@/structure` (or a relative path to this file) — never reach into
 * `types.ts` / `anchor.ts` directly, so the internals stay free to move.
 */

export type {
  Anchor,
  AnchorParts,
  BookId,
  BookMeta,
  BookType,
  ChapterIndex,
  ChapterIndexEntry,
  ChapterPath,
  Manifest,
  ManifestChapter,
  Paragraph,
  Section,
  SectionPath,
  SourceFormat,
} from './types.ts'

export {
  AnchorError,
  chapterPath,
  formatAnchor,
  isAnchor,
  parseAnchor,
  sectionPath,
  sectionPathOf,
  tryParseAnchor,
} from './anchor.ts'
