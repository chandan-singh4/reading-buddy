/**
 * The single public entry point for the cloud backend. Import from
 * `@/storage/cloud` — never from the modules inside it, so the split between
 * Postgres and R2 stays an implementation detail.
 *
 * `storage/index.ts` still defaults to the IndexedDB repository, because that is
 * the only one that works on a phone with no signal. The reader switches in
 * Settings; see `../backend.ts` for what that does and why it reloads.
 */

export { createCloudRepository } from './cloudRepository.ts'
export type { CloudRepositoryOptions } from './cloudRepository.ts'

export {
  CloudError,
  cloudClient,
  currentUser,
  currentUserId,
  isCloudConfigured,
  onAuthChange,
  requireUserId,
  sendSignInLink,
  signOut,
} from './client.ts'
export type { CloudUser } from './client.ts'

export { createR2BlobStore } from './blobs.ts'
export type { BlobEntry, BlobStore } from './blobs.ts'

export {
  assetKey,
  bookPrefix,
  chapterTextKey,
  safePath,
  sourceKey,
  userPrefix,
} from './keys.ts'

export { MAX_CHUNK_BYTES, chapterTextOf, chunkSections, readChapterText } from './rows.ts'
export type { ChapterText, SectionPayload } from './rows.ts'
