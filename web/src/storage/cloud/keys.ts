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
