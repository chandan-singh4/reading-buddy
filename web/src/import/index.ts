/**
 * The single public entry point for import. Import from `@/import` — the UI
 * should never reach past this to a parser or to the repository directly.
 */

export {
  ACCEPTED_EXTENSIONS,
  ImportError,
  backfillTextSignatures,
  fingerprint,
  formatFromFilename,
  textSignatureOf,
  importBook,
  importBooks,
  isOutOfDate,
  reparseBook,
  reparseBooks,
  titleFromFilename,
} from './importBook.ts'
export type {
  BatchProgress,
  ImportErrorCode,
  ImportManyOptions,
  ImportOptions,
  ImportOutcome,
  ImportStage,
  ParserTable,
  ReparseOutcome,
  ReparseProgress,
} from './importBook.ts'

export { PARSER_VERSION } from '../parse/version.ts'

export { dropHasDirectory, filesFromDrop } from './dropped.ts'

export {
  allowedToRead,
  canRememberFolder,
  chooseFolder,
  filesInFolder,
  forgetFolder,
  hasImportedFolder,
  readRememberedFolder,
  rememberedFolder,
  rememberFolderImport,
} from './folder.ts'
export type { RememberedFolder } from './folder.ts'

export { shelfFor, shelfOf } from './shelf.ts'
