/**
 * Comparing a stored quote with the book's own words.
 *
 * Every mark the reader makes stores the words it is about, never a pair of
 * offsets — offsets die on the first re-parse and the words do not. Two places
 * have to look those words up again: `storage/relocate.ts`, to find the
 * paragraph a mark now belongs to, and `reader/selection.ts`, to paint the ink
 * on the page. They lived with two private ideas of "the same words", and a
 * mark could be found by one and lost by the other.
 *
 * ## Why a plain match is not enough
 *
 * A selection dragged across two paragraphs stringifies with *no space at the
 * join* — the browser leaves no whitespace between block elements — so a
 * highlight over two blocks is stored as "…and fraud, generateillegal funds…".
 * When the parser later decides those two blocks were one paragraph all along,
 * it writes them with a space between. The words the reader marked are all
 * still there, in order, and every exact match fails on one missing space.
 *
 * That is not a corner case. It is what happens to every highlight in a book
 * each time the parser learns to join a line it used to break, and the reader
 * pays for the improvement by marking the book again.
 *
 * ## The rule
 *
 * Try the words exactly as stored. Failing that, try them with every space
 * taken out and the typography folded. Taking the spaces out is what forgives a
 * join, in either direction, and it cannot hide a difference in the words
 * themselves.
 */

/**
 * Fold one character to its plain twin. Length-preserving on purpose: the
 * painter keeps a map from each character back to the page, and a fold that
 * changed the count would break it.
 */
export function softenQuote(text: string): string {
  return text
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‐-―]/gu, '-')
    .toLowerCase()
}

/** The same words with every space removed, for a match that forgives a join. */
export function bareQuote(text: string): string {
  return softenQuote(text).replace(/\s+/gu, '')
}
