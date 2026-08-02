/**
 * The single public entry point for persistence. Import from here — never from
 * `db.ts` directly, so the database stays swappable behind the repository.
 */

export { DB_NAME, createDb } from './db.ts'
export type {
  ReadingBuddyDB,
  ReadingPosition,
  StoredChapterIndex,
  StoredSection,
} from './db.ts'

export { createRepository, repository } from './repository.ts'
export type { ParsedBook, Repository } from './repository.ts'
