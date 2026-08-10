/**
 * Where a book's bytes live in R2.
 *
 * Object storage has no folders — a key is one flat string, and the slashes in
 * it are a convention every console renders as a tree. That makes the layout a
 * decision rather than a detail, and this module is the only place it is made.
 *
 * ```
 * users/<userId>/books/<bookId>/source/<filename>
 * users/<userId>/books/<bookId>/assets/<archive path>
 * users/<userId>/books/<bookId>/text/<parse token>/<chapter>.json
 * ```
 *
 * **The `users/<userId>/` prefix is load-bearing, not decoration.** The signing
 * endpoint refuses to mint a URL for a key outside the caller's own prefix, so
 * this string is the boundary between one reader's files and another's. It is
 * the only thing standing between a signed-in stranger and everything in the
 * bucket, because a signed URL works regardless of what Postgres would have
 * shown them.
 */

/** The reserved prefix everything belonging to one reader sits under. */
export function userPrefix(userId: string): string {
  return `users/${userId}/`
}

/** Everything belonging to one book — the prefix a delete sweeps. */
export function bookPrefix(userId: string, bookId: string): string {
  return `${userPrefix(userId)}books/${bookId}/`
}

/**
 * Make one path segment safe to put in a key.
 *
 * Two things are removed, and the second is a security fix rather than tidiness:
 *
 * - **Empty, `.` and `..` segments.** A key is a literal string to R2, but the
 *   signing endpoint builds a `URL` from it, and the `URL` constructor
 *   *normalises* `..` the way a filesystem would. So a path of
 *   `../../../users/someone-else` would pass a `startsWith` check on the raw
 *   key and then resolve, once signed, to a different reader's object. The
 *   endpoint rejects these too — this is the belt to its braces.
 * - **Backslashes**, folded to forward slashes, because a Windows-flavoured
 *   archive path would otherwise produce one unreadable segment.
 */
function safeSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Normalise an archive path into the tail of a key.
 *
 * Returns `undefined` when nothing survives — an empty path, or one made
 * entirely of traversal. A caller must treat that as "this asset has no
 * address" rather than storing it at the book's root, where it would collide
 * with the next such asset.
 */
export function safePath(path: string): string | undefined {
  const segments = safeSegments(path)
  return segments.length === 0 ? undefined : segments.join('/')
}

/**
 * The key for a book's original file.
 *
 * The filename is kept in the key — it is never read back out (the `sources`
 * row is what records it) but a bucket you can read by eye is worth a great
 * deal the first time something is wrong.
 */
export function sourceKey(userId: string, bookId: string, filename: string): string {
  const safe = safePath(filename) ?? 'source'
  // A filename cannot be a path: a book called `a/b.epub` would otherwise nest.
  return `${bookPrefix(userId, bookId)}source/${safe.replace(/\//g, '_')}`
}

/**
 * The key for one picture, addressed by the same archive path the figure's
 * `image.src` carries — so a page that mentions `OEBPS/images/fig1.png` needs
 * nothing resolved to find its bytes.
 */
export function assetKey(
  userId: string,
  bookId: string,
  path: string,
): string | undefined {
  const safe = safePath(path)
  if (safe === undefined) return undefined
  return `${bookPrefix(userId, bookId)}assets/${safe}`
}

/**
 * The key for one chapter's text — every paragraph of every section in it, as
 * one JSON object.
 *
 * ## Why a chapter and not a section
 *
 * A page turn fetches one object either way, and over a phone connection the
 * cost of that fetch is almost entirely the round trip: 30 KB and 2 KB arrive
 * within a few milliseconds of each other. So the grain is chosen for the two
 * operations where the count actually shows.
 *
 * - **In-book search** reads the whole book. Per chapter that is twenty
 *   requests; per section it is three hundred, which a browser serialises six
 *   at a time into a visible wait.
 * - **Import** uploads twenty objects instead of three hundred, on the
 *   connection least able to bear either.
 *
 * ## Why a parse token sits in the middle
 *
 * So that writing a book's text never overwrites the text it currently has.
 * Each parse invents a token and writes to keys nothing else points at; the
 * `sections` rows are swapped over to the new keys in one transaction, and only
 * then do the old objects go. That is what keeps `replaceParsedBook`'s promise
 * — a failed re-parse leaves the old book exactly as it was — now that the
 * paragraphs are no longer inside the transaction that swaps them.
 *
 * A deterministic key would make that impossible: the first upload of chapter 1
 * would land on top of the text the reader is currently reading.
 */
export function chapterTextKey(
  userId: string,
  bookId: string,
  parseToken: string,
  chapter: number,
): string {
  // The token is ours (a uuid), but it arrives here as a plain string and this
  // module is the boundary that decides what a key may contain. Flattened the
  // same way a filename is, so nothing can nest or traverse out of the book.
  const safe = (safePath(parseToken) ?? 'text').replace(/\//g, '_')
  return `${bookPrefix(userId, bookId)}text/${safe}/${chapter}.json`
}
