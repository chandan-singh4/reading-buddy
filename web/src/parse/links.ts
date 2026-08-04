/**
 * Turning the links a book was written with into links this app can follow.
 *
 * A source document says `href="chapter3.xhtml#note12"`. That means nothing
 * here: there is no `chapter3.xhtml` at read time, only sections keyed by
 * address and paragraphs keyed by anchor. So every internal link has to be
 * translated once, at import, into the permanent anchor of whatever block held
 * that id.
 *
 * **Why this runs after assembly, not during it.** A link commonly points at a
 * different chapter — often a *later* one, since that is what a footnote
 * marker does. While chapter 2 is being assembled, chapter 9's anchors do not
 * exist yet. Only once the whole book is anchored can anything be resolved, so
 * this is a second pass over a finished `ParsedBook` rather than a step in the
 * walk.
 *
 * Links that resolve to nothing are left as they are — an ordinary web address
 * stays a web address, and a broken internal link stays inert rather than being
 * guessed at. A link that silently goes to the wrong place is worse than one
 * that doesn't go anywhere.
 */

import type { Anchor, Paragraph } from '../structure/index.ts'
import type { ParsedBook } from '../storage/index.ts'

/** Absolute-looking destinations that leave the book. */
const EXTERNAL = /^(https?:|mailto:|tel:)/i

/**
 * Resolve every link in a parsed book, and strip the ids used to do it.
 *
 * Mutates in place. This runs once per import over a book already entirely in
 * memory; copying it would double the peak memory of importing a 15 MB epub to
 * no purpose.
 */
export function resolveLinks(book: ParsedBook): ParsedBook {
  // Where each id lives, now that every block has an anchor.
  const anchorById = new Map<string, Anchor>()

  for (const section of book.sections) {
    for (const paragraph of section.paragraphs) {
      for (const id of paragraph.ids ?? []) {
        // First wins. A duplicate id is invalid HTML but real books contain
        // them, and the first is the one a browser would find.
        if (!anchorById.has(id)) anchorById.set(id, paragraph.anchor)
      }
    }
  }

  for (const section of book.sections) {
    for (const paragraph of section.paragraphs) {
      resolveIn(paragraph, anchorById)
      delete paragraph.ids
    }
  }

  return book
}

function resolveIn(paragraph: Paragraph, anchorById: Map<string, Anchor>): void {
  if (!paragraph.links) return

  for (const link of paragraph.links) {
    const href = link.url
    if (!href || EXTERNAL.test(href)) continue

    // A same-document link is written `#note12` while the id it points at is
    // recorded as `note12`. (Epub qualifies both sides with the file they came
    // from — `chapter3.xhtml#note12` — so those already match.)
    const anchor = lookUp(href.startsWith('#') ? href.slice(1) : href, anchorById)
    if (anchor) {
      link.anchor = anchor
      // Dropped once resolved: keeping both would leave two answers to "where
      // does this go?" and invite a renderer to pick the wrong one.
      delete link.url
    }
  }

  // A link that went nowhere and isn't a web address is inert — drop it, so the
  // renderer never has to decide what an untappable link looks like.
  paragraph.links = paragraph.links.filter(
    (link) => link.anchor !== undefined || (link.url && EXTERNAL.test(link.url)),
  )
  if (paragraph.links.length === 0) delete paragraph.links
}

/**
 * Find where a destination ended up, trying progressively looser readings of it.
 *
 * Only the first is exact. The rest exist because a footnote marker that does
 * nothing is the single most-reported fault on the reading screen, and every
 * loosening below turns one real class of dead marker into a working link:
 *
 * 1. **Exactly as written.** The overwhelming majority.
 * 2. **Case-insensitively.** `#Note12` against `id="note12"`. HTML ids are
 *    case-sensitive in the spec and treated as case-insensitive by roughly
 *    every book-production tool that has ever emitted one.
 * 3. **The document it points into, ignoring the fragment.** This is the one
 *    that matters. `notes.xhtml#fn12` fails whenever the note's own id didn't
 *    survive — it sat on furniture, or on an element that never became a block
 *    of its own — and the link then disappears entirely, which is precisely the
 *    complaint: the marker is there, the note is there, the tap does nothing.
 *    Landing the reader at the top of the notes page is not where they asked to
 *    go, but it is the right page, and a page away beats nowhere.
 */
function lookUp(destination: string, anchorById: Map<string, Anchor>): Anchor | undefined {
  const exact = anchorById.get(destination)
  if (exact) return exact

  const lowered = destination.toLowerCase()
  for (const [id, anchor] of anchorById) {
    if (id.toLowerCase() === lowered) return anchor
  }

  const hash = destination.indexOf('#')
  if (hash <= 0) return undefined
  const document = destination.slice(0, hash)
  return anchorById.get(document) ?? anchorById.get(document.toLowerCase())
}
