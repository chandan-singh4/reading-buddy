/**
 * What a catalogue answer is allowed to change about a book.
 *
 * The lookup decides what is *true*; this decides what gets *written*. They are
 * separate because the interesting rules are all about restraint — three kinds
 * of field the catalogue may not touch, however confident it is:
 *
 * - **The reader's own words.** Rating, notes, shelf, folders, the day they
 *   finished it, and the title on the spine. Google has opinions about none of
 *   these and would be wrong to.
 * - **Anything they corrected by hand.** `genreOverridden` is the live case: a
 *   mountaineering memoir came back `Fiction`, and once that is fixed no
 *   re-fetch may quietly undo it. Same rule as `shelfOverridden`.
 * - **An author that is already known.** The file's `dc:creator` describes the
 *   edition actually held; the catalogue describes whichever edition it
 *   matched. Google fills the blank ones and overrules none.
 *
 * Everything else — publisher, page count, subjects, dimensions, the blurb — is
 * catalogue-owned. The file's version of those is thinner where it exists at
 * all, and the reader never types them.
 *
 * ## The two writes that happen when nothing was found
 *
 * A book that matched nothing still gets `metadataFetchedAt`, and that stamp is
 * the entire reason it exists: it is what separates *asked and not in the
 * catalogue* from *never successfully asked*. Five of 32 books really are not
 * in Google Books, and without the stamp the backfill would ask about them
 * again every single night forever.
 *
 * A book whose lookup **failed** gets nothing at all — not even the stamp. A
 * quota error is not a fact about a book, and writing one down would mark the
 * shelf missing with nothing left to revisit it.
 */
import type { BookMeta } from '../structure/index.ts'
import type { Outcome } from './lookup.ts'

/** Fields the catalogue may never write, whatever it thinks it knows. */
const READER_OWNED = ['title', 'rating', 'notes', 'shelf', 'folderIds', 'finishedAt'] as const

/**
 * The book as it should be stored after one lookup, or `undefined` to store
 * nothing.
 *
 * `undefined` is only ever returned for a failed lookup — see the module note.
 */
export function applied(
  book: BookMeta,
  outcome: Outcome,
  at: string = new Date().toISOString(),
): BookMeta | undefined {
  if (outcome.status === 'failed') return undefined

  // Asked, and genuinely not in the catalogue. The stamp is the whole answer.
  if (outcome.status === 'unmatched') return { ...book, metadataFetchedAt: at }

  const updated: BookMeta = { ...book }

  for (const [key, value] of Object.entries(outcome.fields)) {
    if (value === undefined) continue
    if ((READER_OWNED as readonly string[]).includes(key)) continue

    // Only where the shelf has no author yet. A book on the shelf saying
    // "Shamdasani, Sonu, Jung, C. G." is the edition in hand; overwriting it
    // with the catalogue's tidier "C. G. Jung" would be losing information to
    // gain neatness.
    if (key === 'author' && book.author) continue

    // A correction, once made, outlives every later fetch.
    if (key === 'genre' && book.genreOverridden) continue

    ;(updated as unknown as Record<string, unknown>)[key] = value
  }

  updated.metadataSource = outcome.source
  updated.metadataFetchedAt = at
  return updated
}
