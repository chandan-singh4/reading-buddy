/**
 * Where the way-back link goes.
 *
 * The chapter page can be arrived at from more than one place — a book's
 * details page, or a pasted URL — so it cannot hard-code its exit. The place
 * that sends a reader here names itself in a `from` query parameter, and this
 * reads it back.
 *
 * `navigate(-1)` would be the obvious alternative and is wrong here: the rail
 * writes the chapter into the URL, so a reader who looked at four chapters
 * would walk their own trail backwards rather than leaving.
 */

/** Only same-origin paths. A `from` that is a URL is somebody testing us. */
export function backTo(search: string): string {
  const from = new URLSearchParams(search).get('from')
  if (!from) return '/'
  if (!from.startsWith('/') || from.startsWith('//')) return '/'
  return from
}

/**
 * The label the way-back link shows for a given path.
 *
 * The query string is cut off first. The page carries its own state in the
 * URL — `?chapter=4` — so the path handed here almost always has one, and
 * matching against the whole string would label every one of them "Home".
 */
export function backLabel(target: string): string {
  const path = target.split('?')[0]
  if (path.endsWith('/info')) return 'Book details'
  if (path.endsWith('/chapters')) return 'Chapters'
  if (path === '/library') return 'Library'
  return 'Home'
}

/** Build the `from` parameter for a link out of the page at `path`. */
export function fromParam(path: string): string {
  return `from=${encodeURIComponent(path)}`
}
