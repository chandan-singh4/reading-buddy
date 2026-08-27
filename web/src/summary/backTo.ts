/**
 * Where the way-back link goes.
 *
 * Both summary views can be arrived at from more than one place — a book's
 * details page, the other view's concept chip, or a pasted URL — so neither
 * can hard-code its exit. The place that sends a reader here names it in a
 * `from` query parameter, and this reads it back.
 *
 * `navigate(-1)` would be the obvious alternative and is wrong here: a reader
 * who crossed from the Chapter View to the Commonplace Book and back again
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
 * The query string is cut off first. A crossing between the two lenses carries
 * its own state in the URL — `?chapter=4` — so the path handed here almost
 * always has one, and matching against the whole string would label every
 * crossing "Home".
 */
export function backLabel(target: string): string {
  const path = target.split('?')[0]
  if (path.endsWith('/info')) return 'Book details'
  if (path.endsWith('/chapters')) return 'Chapters'
  if (path === '/commonplace') return 'Commonplace Book'
  if (path === '/library') return 'Library'
  return 'Home'
}

/** Build the `from` parameter for a link out of the page at `path`. */
export function fromParam(path: string): string {
  return `from=${encodeURIComponent(path)}`
}
