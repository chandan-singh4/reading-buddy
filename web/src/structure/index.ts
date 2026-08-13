/**
 * The single public entry point for the parsed-book structure. Import from
 * `@/structure` (or a relative path to this file) — never reach into
 * `types.ts` / `anchor.ts` directly, so the internals stay free to move.
 */

export type {
  Anchor,
  AnchorParts,
  BlockKind,
  BookId,
  BookMeta,
  BookType,
  CatalogueSource,
  FigureImage,
  ChapterIndex,
  ChapterIndexEntry,
  ChapterPath,
  Manifest,
  ManifestChapter,
  Paragraph,
  ParagraphLink,
  Section,
  SectionPath,
  Shelf,
  SourceFormat,
} from './types.ts'

export { FILE_METADATA_KEYS } from './types.ts'

export { WORDS_PER_PAGE, countWords, countWordsIn, pagesIn } from './words.ts'

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
