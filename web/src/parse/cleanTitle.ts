/**
 * Rescuing a title from a citation dump.
 *
 * Some epubs — especially ones that passed through a download/conversion
 * pipeline such as Anna's Archive — carry a `<dc:title>` that isn't a title at
 * all: the real title run straight into the author, the publisher, an ISBN, a
 * content hash and a trailing "Anna's Archive" credit, with no punctuation
 * marking where one field ends and the next begins (`The Book Author,
 * Firstname Place of publication not identified, 2009 9780307566126
 * 60cda61f8cf1d1443efe944bb205a3a2 Anna's Archive`). None of that was ever
 * something a reader chose to see, so once any of it is spotted, the title is
 * cut right there — everything from the earliest match onward is dropped.
 *
 * This is a best effort, not a guarantee: a subtitle mashed into the same
 * run-on string with no marker of its own (no author, no ISBN, nothing this
 * function recognises) can't be told apart from the real title
 * algorithmically. The book's own detail page offers a manual rename for
 * exactly that gap.
 *
 * ---
 *
 * This lives in its own module, apart from `epub.ts`, because it has two
 * callers with different needs. The parser runs it on the way in. The *heal*
 * pass (`storage/healTitles.ts`) runs it again over books already on the shelf,
 * so improving the rules here fixes existing books without anyone re-importing
 * anything. That second caller is the whole reason `TITLE_CLEAN_VERSION` below
 * exists.
 */

/**
 * Bump this whenever the rules below change in a way that would produce a
 * better title for a book already on the shelf.
 *
 * This is deliberately *not* `PARSER_VERSION`. That one means "the text of this
 * book was produced by an older parser", and the only cure is re-reading the
 * original file — which needs the kept source, takes real time, and rewrites
 * every section. A title is one short string sitting in one row: it can be
 * recomputed from what is already stored, offline, in milliseconds. Tying the
 * two together would mean a title fix could only reach a reader who still had
 * the source file and thought to press Update, which is exactly the failure
 * this separation removes.
 *
 * History:
 *   1 — hash removal, ISBN / "Anna's Archive" / publisher / author-name cuts
 *       (the rules as they stood at `PARSER_VERSION` 6).
 */
export const TITLE_CLEAN_VERSION = 1

export function cleanTitle(
  raw: string | null | undefined,
  author: string | undefined,
): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined

  // A stray hash is removed in place, not treated as a cut point: what comes
  // after it can be real title text (an edition marker like "Annotated"), and
  // a hash alone doesn't mean everything past it is a citation dump.
  const dehashed = trimmed
    .replace(/\b[0-9a-f]{16,40}\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // These markers are different: once one is spotted, everything from there
  // to the end really is a citation dump — an ISBN, a publisher credit, an
  // author's name never lead back into more title — so it's cut wholesale.
  const markers: RegExp[] = [
    /\b\d{9,13}\b/g, // an ISBN
    /anna['’]s archive/gi,
    /place of publication not identified/gi,
    ...authorMarkers(author),
  ]

  let cut = dehashed.length
  for (const marker of markers) {
    marker.lastIndex = 0
    const match = marker.exec(dehashed)
    if (match && match.index < cut) cut = match.index
  }

  const stripped = dehashed.slice(0, cut).replace(/[\s,;:.\-–—]+$/, '').trim()
  return stripped || undefined
}

/**
 * A known author's name, turned into patterns that catch it reappearing
 * citation-style inside a polluted title (`Ricard, Matthieu` for an author of
 * `Matthieu Ricard`) — the "Lastname, Firstname" shape these pipelines write
 * names in, wherever it shows up in the string.
 */
function authorMarkers(author: string | undefined): RegExp[] {
  if (!author) return []
  const names = author
    .split(/[,;]/)
    .flatMap((part) => part.trim().split(/\s+/))
    .filter((name) => name.length > 1)
  return names.map((name) => new RegExp(`\\b${escapeRegExp(name)}\\s*,`, 'gi'))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
