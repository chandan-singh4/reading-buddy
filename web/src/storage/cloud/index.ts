/**
 * The single public entry point for the cloud backend. Import from
 * `@/storage/cloud` — never from the modules inside it, so the split between
 * Postgres and R2 stays an implementation detail.
 *
 * Nothing in the app imports this yet. `storage/index.ts` still exports the
 * IndexedDB repository as the app-wide one, because that is the only one that
 * works on a phone with no signal. Switching is one line there, once the
 * accounts in `docs/cloud-setup.md` exist and a sign-in screen does.
 */

export { createCloudRepository } from './cloudRepository.ts'
export type { CloudRepositoryOptions } from './cloudRepository.ts'

export {
  CloudError,
  cloudClient,
  currentUserId,
  isCloudConfigured,
  onAuthChange,
  requireUserId,
  sendSignInLink,
  signOut,
} from './client.ts'

export { createR2BlobStore } from './blobs.ts'
export type { BlobEntry, BlobStore } from './blobs.ts'

export { assetKey, bookPrefix, safePath, sourceKey, userPrefix } from './keys.ts'

export { MAX_CHUNK_BYTES, chunkSections } from './rows.ts'
