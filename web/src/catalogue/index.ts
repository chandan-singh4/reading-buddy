/**
 * The catalogue: what Google Books knows about a book on the shelf.
 *
 * The layers, outermost last, each one deciding a different thing:
 *
 * | Module | Decides |
 * |---|---|
 * | `volume.ts` | What a Google record *means* in this app's fields |
 * | `match.ts` | Whether a result is really the book on the shelf |
 * | `lookup.ts` | Matched, not in the catalogue, or never reached |
 * | `apply.ts` | What a lookup is allowed to overwrite |
 * | `refresh.ts` | Storing it, and the cover |
 * | `google.ts` | The wire, and the only part with no judgment in it |
 */
export { createCatalogue, fetchCover } from './google.ts'
export { applied } from './apply.ts'
export { lookupBook, type Outcome, type Catalogue } from './lookup.ts'
export {
  backfill,
  needsLookup,
  refreshBook,
  type BackfillReport,
  type RefreshDeps,
} from './refresh.ts'

import { repository } from '../storage/index.ts'
import { createCatalogue, fetchCover } from './google.ts'
import type { RefreshDeps } from './refresh.ts'

/** The real thing, wired to the real database and the real endpoint. */
export function catalogueDeps(): RefreshDeps {
  return { repository, catalogue: createCatalogue(), fetchCover }
}
