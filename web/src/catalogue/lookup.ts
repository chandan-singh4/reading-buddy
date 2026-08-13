/**
 * Finding one book in the catalogue.
 *
 * Three stages, tried in order of how much they can be trusted:
 *
 * 1. **ISBN.** An identifier, not a guess. Twenty of the reader's 32 books carry
 *    one, and a match here skips the guard entirely — a title that looks nothing
 *    like ours means a retitled edition, not a wrong book.
 * 2. **Strict.** The title as a phrase, plus the author. Matched 26 of 32.
 * 3. **Loose.** Free text, and every result put through the guard. Matched 2
 *    more. Four books matched nothing, which is a real answer.
 *
 * ## The outcome is three-valued, and that is the point
 *
 * `matched` and `unmatched` are both answers, and both get written down.
 * `failed` is not an answer — the question never got asked, because the network
 * was down or the quota was gone. Nothing is stored for a `failed`, so the book
 * stays in the queue and gets asked again tomorrow.
 *
 * Collapsing those last two is the single most damaging thing this module could
 * do. The first probe written against this API did exactly that, and reported
 * "NO MATCH" for books whose real response was HTTP 429. Written to the
 * database, that is a permanent lie about a book, and no later run would revisit
 * it.
 */
import type { BookMeta } from '../structure/index.ts'
import { judge } from './match.ts'
import { recordOf, type VolumeInfo } from './volume.ts'

/** How the match was made, mirroring `metadata_source` in the database. */
export type Source = 'isbn' | 'strict' | 'loose'

export type Outcome =
  | { status: 'matched'; source: Source; fields: Partial<BookMeta>; coverUrl?: string }
  | { status: 'unmatched' }
  | { status: 'failed'; reason: string }

/** What `lookupBook` needs from the world: one authenticated call to the proxy. */
export interface Catalogue {
  search(query: string): Promise<{ id: string }[]>
  volumes(ids: readonly string[]): Promise<VolumeInfo[]>
}

/**
 * How many candidates to examine per stage.
 *
 * Each one costs a volume fetch, and the right answer is nearly always first.
 * Three is enough to survive a study guide or an audiobook sitting at the top.
 */
const CANDIDATES = 3

/**
 * Words of the title to put in a loose query.
 *
 * Six was measured and was too many: it dragged `notes` in from a seminar
 * title's run-on subtitle and found nothing. Five matched.
 */
const LOOSE_TITLE_WORDS = 5

/**
 * The title as something worth searching for.
 *
 * Books off a conversion pipeline carry bracketed series numbers and bullet
 * separators in their `dc:title`, and those are punctuation to a search engine.
 */
function searchableTitle(title: string): string {
  return title
    .replace(/\[.*?\]/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Every name in an author field, in a form a search can use.
 *
 * Deliberately *all* of them. An early probe used only the first comma-separated
 * fragment, which turned `Shamdasani, Sonu, Jung, C. G.` into a search for
 * "Shamdasani" alone and lost the book that Jung wrote — a false rejection
 * caused entirely by the query, not by the catalogue.
 */
function authorWords(author: string | undefined): string {
  return (author ?? '')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first candidate that passes the guard. */
async function firstAccepted(
  catalogue: Catalogue,
  query: string,
  title: string,
  author: string | undefined,
): Promise<{ id: string; volume: VolumeInfo } | undefined> {
  const results = await catalogue.search(query)
  if (results.length === 0) return undefined

  const ids = results.slice(0, CANDIDATES).map((result) => result.id)
  // The second hop. A search result is a stub — `pageCount` 0, no publisher,
  // one coarse category — so the guard has to judge the full record, not the
  // summary, or it would be deciding on a different book than it stores.
  const volumes = await catalogue.volumes(ids)

  for (const [index, volume] of volumes.entries()) {
    if (judge(title, author, volume).accepted) return { id: ids[index], volume }
  }
  return undefined
}

/**
 * Ask the catalogue about one book.
 *
 * Every network failure becomes `failed`, never `unmatched` — see the module
 * note. The caller decides what to write down; this decides only what is true.
 */
export async function lookupBook(book: BookMeta, catalogue: Catalogue): Promise<Outcome> {
  const title = searchableTitle(book.title)
  const author = book.author

  try {
    // Stage 1 — the identifier. No guard: `isbn:` is an exact lookup, and the
    // one result it returns is the book by definition.
    if (book.isbn) {
      const results = await catalogue.search(`isbn:${book.isbn.replace(/[^0-9Xx]/g, '')}`)
      if (results.length > 0) {
        const [volume] = await catalogue.volumes([results[0].id])
        if (volume) {
          const { fields, coverUrl } = recordOf(results[0].id, volume)
          return { status: 'matched', source: 'isbn', fields, coverUrl }
        }
      }
    }

    // Stage 2 — the title as a phrase, with the author to corroborate it.
    const strictQuery = author
      ? `intitle:"${title}" inauthor:"${authorWords(author)}"`
      : `intitle:"${title}"`
    const strict = await firstAccepted(catalogue, strictQuery, title, author)
    if (strict) {
      const { fields, coverUrl } = recordOf(strict.id, strict.volume)
      return { status: 'matched', source: 'strict', fields, coverUrl }
    }

    // Stage 3 — free text, guarded. This is the stage that would happily return
    // somebody else's book, which is exactly why nothing leaves it unjudged.
    const looseQuery = [title.split(/\s+/).slice(0, LOOSE_TITLE_WORDS).join(' '), authorWords(author)]
      .filter(Boolean)
      .join(' ')
    const loose = await firstAccepted(catalogue, looseQuery, title, author)
    if (loose) {
      const { fields, coverUrl } = recordOf(loose.id, loose.volume)
      return { status: 'matched', source: 'loose', fields, coverUrl }
    }

    return { status: 'unmatched' }
  } catch (error) {
    // Deliberately broad. Anything thrown between here and the network — a 429,
    // a dropped connection, a body that wasn't JSON — means the question did not
    // get an answer, and "no answer" must never be filed as "no such book".
    return { status: 'failed', reason: error instanceof Error ? error.message : 'Lookup failed.' }
  }
}
