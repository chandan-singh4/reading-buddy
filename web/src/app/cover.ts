/**
 * A placeholder cover for a book with no extractable image — every text and
 * Markdown file, every Word doc, and any EPUB or PDF that simply has none.
 *
 * Deterministic from the title rather than random: the same book gets the
 * same color and initial every time the shelf renders, with no state to store
 * or keep in sync. Real cover extraction (EPUB embedded image, PDF page one)
 * is later work — this is what a book looks like until then, and what it
 * falls back to if extraction finds nothing.
 */

export const COVER_SWATCH_COUNT = 6

/** One of `--cover-1` … `--cover-6` in `theme.css`, chosen from the title. */
export function coverSwatch(title: string): string {
  return `var(--cover-${swatchIndex(title)})`
}

function swatchIndex(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  }
  return (hash % COVER_SWATCH_COUNT) + 1
}

/** The letter shown on a placeholder cover — the first letter that isn't punctuation or a space. */
export function coverInitial(title: string): string {
  const letter = title.match(/[\p{L}\p{N}]/u)?.[0]
  return (letter ?? '?').toUpperCase()
}
