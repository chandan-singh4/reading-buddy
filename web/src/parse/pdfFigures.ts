/**
 * Finding the pictures in a PDF, without looking for pictures.
 *
 * A PDF carries no structure. `pdf-layout.ts` says so at the foot of
 * `pdfPagesToBlocks`, and declines to recognise figures for a good reason:
 * classifying geometry is a second round of heuristics on top of an already
 * lossy pass, and a wrong guess costs more than flat text.
 *
 * This does something narrower, and that is the whole idea. It never asks "is
 * this a figure?" It asks "is there a tall band of this page with no text in
 * it?" A gap is a fact about the page, not a judgment about its contents.
 *
 * ## Why not read the embedded images instead
 *
 * A PDF's draw operations do name the bitmaps on a page, and reading them is
 * precise for a photograph or a scanned plate. It also misses every diagram
 * drawn as vectors — charts, graphs, line art, the anatomy plate with labels —
 * because there is no image object in the file to find. In a technical book
 * that is most of the figures. Rendering a band catches both, because it
 * photographs whatever the page draws there.
 *
 * ## What a wrong answer costs
 *
 * A band with nothing in it renders as blank paper. `pdf.ts` throws those away
 * after rendering, by looking at the pixels, so the failure a reader could see
 * — an Ask button under a picture of white space — is caught one step later
 * rather than guessed at here.
 *
 * ## Coordinates
 *
 * PDF user space, so `y` counts **up** from the foot of the page and a band's
 * `top` is numerically larger than its `bottom`. Every number here is in that
 * space, and `pdf.ts` converts once, where it renders.
 */

import type { PdfPage, PdfTextItem } from './pdf-layout.ts'

/** A horizontal strip of a page with no text in it. */
export interface Band {
  /** 1-based, as a reader counts pages. */
  page: number
  /** The upper edge, counting up from the foot of the page. */
  top: number
  /** The lower edge. Always less than `top`. */
  bottom: number
}

/**
 * The shortest band worth rendering, as a fraction of the page height.
 *
 * A fifth of the page. Below that a gap is the ordinary furniture of a book —
 * the space under a heading, a scene break, the last line of a chapter — and
 * offering to discuss it would put an Ask button on half the pages in a novel.
 * A real plate is rarely smaller: at a fifth of A4 a figure is about 5cm tall.
 */
const MIN_HEIGHT = 0.2

/**
 * The tallest a *line* of text can be before it stops being one.
 *
 * A guard on the input, not on the answer. A single glyph with a broken
 * transform can claim to be 400 points high and swallow the page, which would
 * hide a real band behind it.
 */
const MAX_LINE = 0.25

/** The span a text item occupies vertically: its baseline, and its glyph box. */
function spanOf(item: PdfTextItem, pageHeight: number): [number, number] | null {
  const height = Math.min(item.height, pageHeight * MAX_LINE)
  if (!(height > 0)) return null
  // The baseline sits at the foot of the glyphs, and descenders hang below it.
  // A quarter of the height covers them without eating into the gap above.
  return [item.y - height * 0.25, item.y + height]
}

/**
 * The bands of one page.
 *
 * Only the space *between* the topmost and bottommost text is considered, which
 * is how the margins stay out of this without anything having to measure them:
 * a page's own text says where its text area is. A page with no text at all is
 * the exception, and is one band from edge to edge — a full-page plate, which
 * is exactly the case a book of pictures is full of.
 *
 * The cost is a figure that sits above all of a page's text, or below all of
 * it, with no text on the other side of it. That band touches the margin and
 * cannot be told from one, so it is not offered. A figure between two
 * paragraphs, which is how a book sets one, always is.
 */
export function bandsOf(page: PdfPage, number: number): Band[] {
  const height = page.height
  if (!(height > 0)) return []

  const spans = page.items
    .filter((item) => item.str.trim() !== '')
    .map((item) => spanOf(item, height))
    .filter((span): span is [number, number] => span !== null)
    .sort((one, two) => one[0] - two[0])

  const least = height * MIN_HEIGHT

  // Nothing on the page. The whole sheet is the picture.
  if (spans.length === 0) return [{ page: number, top: height, bottom: 0 }]

  const bands: Band[] = []
  // Where the text so far reaches. Walking upwards, so this only ever grows.
  let reached = spans[0]![1]

  for (const [low, high] of spans) {
    if (low - reached >= least) bands.push({ page: number, top: low, bottom: reached })
    reached = Math.max(reached, high)
  }

  /*
   * Reading order, which is the opposite of the order they were found in.
   *
   * The walk goes up the page, because that is the direction PDF coordinates
   * count in. A reader goes down it. Left as found, two plates on one page
   * would be offered to the tutor bottom one first, and inserted into the text
   * in that order too.
   */
  return bands.reverse()
}

/** Every band in the document, in reading order. */
export function bandsIn(pages: readonly PdfPage[]): Band[] {
  return pages.flatMap((page, index) => bandsOf(page, index + 1))
}

/**
 * The asset path a rendered band is stored under.
 *
 * Shaped like the archive paths an epub's pictures use, so everything
 * downstream — the assets table, the figure block, the reading page's lookup —
 * treats the two the same and knows nothing about where either came from.
 */
export function bandPath(band: Band): string {
  return `pdf/page-${String(band.page).padStart(4, '0')}-at-${Math.round(band.bottom)}.png`
}
