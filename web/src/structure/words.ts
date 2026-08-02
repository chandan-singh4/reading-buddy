/**
 * How long a piece of the book is, measured in its own words.
 *
 * This exists so the reader can say "Page 250 of 338" honestly. A page counted
 * in *screens* changes with the font, the margins and the phone — it describes
 * the device rather than the book. A page counted in *words* is a property of
 * the text itself, so the total never moves. It is Kindle's "locations" idea
 * under a name people already understand. See `decisions.md`, session 3.
 *
 * The accepted cost, agreed with the reader: a visible page turn will sometimes
 * leave the number alone and sometimes advance it by two, because a screenful
 * and a word-page are different sizes. Google Books behaves the same way.
 *
 * Counting is deliberately crude — whitespace-separated runs. It does not need
 * to be linguistically correct, only *stable*: the same text must always yield
 * the same count, so the page number a reader saw yesterday is the one they see
 * today. Anything cleverer (hyphenation, CJK segmentation) would be a change to
 * every stored count, so keep this function boring.
 */

/**
 * Words in a page. 300 is a mass-market paperback page, which is the point —
 * "page 250" should feel like the same distance a reader already has intuitions
 * about.
 *
 * **Changing this renumbers every book in the library.** Nothing breaks — counts
 * are stored as words, not pages, so the arithmetic simply produces different
 * pages — but a reader's remembered "I'm around page 120" stops being true.
 */
export const WORDS_PER_PAGE = 300

/** Words in one string. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

/**
 * Words across many strings — a section's paragraphs, say.
 *
 * Every block kind is counted, including tables and figure captions, because
 * every block carries a readable `text` and all of it is text the reader moves
 * through. A 40-row table genuinely does take a while to get past.
 */
export function countWordsIn(texts: readonly string[]): number {
  let total = 0
  for (const text of texts) total += countWords(text)
  return total
}

/** Pages in a stretch of `words`. A non-empty book is always at least one page. */
export function pagesIn(words: number): number {
  if (words <= 0) return 0
  return Math.max(1, Math.ceil(words / WORDS_PER_PAGE))
}
