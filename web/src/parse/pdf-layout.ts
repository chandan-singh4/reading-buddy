/**
 * The hard half of PDF parsing, kept pure so it can be tested without pdf.js.
 *
 * A PDF does not contain paragraphs. It contains glyphs, each stamped at an
 * (x, y) coordinate, and nothing else. "This is a heading", "this line
 * continues the previous one", "this is a running footer" — none of that is
 * recorded anywhere. It has to be inferred from geometry, which is why this is
 * the lossiest parser we have and the only one with real heuristics in it.
 *
 * Everything here works on plain numbers, so every rule below is unit-testable
 * against synthetic input rather than a binary fixture.
 *
 * Known limits, honestly stated: heavily designed pages (marginalia, pull
 * quotes, tables, figure captions woven into text) will still come out imperfect.
 * The goal is a book that reads correctly top to bottom, not a facsimile.
 */

import type { Block } from './assemble.ts'

/** One text fragment as pdf.js reports it. Origin is bottom-left. */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  /** Glyph height, which we use as the font size. */
  height: number
}

export interface PdfPage {
  width: number
  height: number
  items: PdfTextItem[]
}

/** A reconstructed line of text, with the geometry needed to group it. */
interface Line {
  text: string
  x: number
  y: number
  /** Right-hand edge, used to tell a wrapped line from a paragraph's last line. */
  right: number
  fontSize: number
  page: number
}

// --- Tunables ---------------------------------------------------------------
// Expressed as multiples of font size so they hold at any zoom or page size.

/** Items whose baselines differ by less than this are on the same line. */
const LINE_TOLERANCE = 0.5
/** A vertical gap wider than this (times line height) starts a new paragraph. */
const PARAGRAPH_GAP = 1.6
/** An indent wider than this (times font size) starts a new paragraph. */
const INDENT = 0.8
/** A line ending this far short of the column edge is a paragraph's last line. */
const SHORT_LINE = 0.85
/** Font this much larger than body text is a heading. */
const HEADING_RATIO = 1.15
/**
 * Headings may wrap — real titles routinely run to two lines — but not further,
 * and not for long. Length is the better discriminator against the thing we're
 * guarding against, which is a large-set pull quote: titles are short, pull
 * quotes are sentences.
 */
const MAX_HEADING_LINES = 2
const MAX_HEADING_CHARS = 120
/** A running header/footer must repeat on at least this share of pages. */
const REPEAT_SHARE = 0.5
/** …and on at least this many pages, so a 2-page document can't trigger it. */
const REPEAT_MINIMUM = 3
/** Fraction of page height at top and bottom where furniture lives. */
const MARGIN_BAND = 0.12

// --- Lines ------------------------------------------------------------------

/**
 * Join fragments into a line. pdf.js splits text at every styling or kerning
 * change, so "however" can arrive as "how" + "ever" — but a genuine word gap
 * shows up as horizontal distance, which is what we test.
 */
function joinItems(items: PdfTextItem[]): string {
  let text = ''
  let previousRight: number | null = null

  for (const item of items) {
    if (!item.str) continue
    if (previousRight !== null) {
      const gap = item.x - previousRight
      const needsSpace = gap > item.height * 0.2 && !/\s$/.test(text) && !/^\s/.test(item.str)
      if (needsSpace) text += ' '
    }
    text += item.str
    previousRight = item.x + item.width
  }

  return text.replace(/\s+/g, ' ').trim()
}

/** Group a set of items into lines, in reading order. */
function toLines(items: PdfTextItem[], pageNumber: number): Line[] {
  if (items.length === 0) return []

  // Descending y: PDF's origin is the bottom-left, so the top of the page is
  // the *largest* y. Reading order is therefore high y to low.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)

  const groups: PdfTextItem[][] = []
  for (const item of sorted) {
    const current = groups.at(-1)
    const reference = current?.[0]
    if (reference && Math.abs(reference.y - item.y) <= reference.height * LINE_TOLERANCE) {
      current.push(item)
    } else {
      groups.push([item])
    }
  }

  return groups
    .map((group) => {
      const ordered = [...group].sort((a, b) => a.x - b.x)
      const text = joinItems(ordered)
      if (!text) return null

      return {
        text,
        x: ordered[0].x,
        y: ordered[0].y,
        right: Math.max(...ordered.map((item) => item.x + item.width)),
        fontSize: Math.max(...ordered.map((item) => item.height)),
        page: pageNumber,
      } satisfies Line
    })
    .filter((line): line is Line => line !== null)
}

// --- Columns ----------------------------------------------------------------

/**
 * Split a page into reading groups, detecting a two-column layout.
 *
 * This has to happen *before* lines are formed, not after. The two columns of a
 * spread share the same baselines, so grouping by y first would weld "the left
 * column says" and "the right column says" into a single line — the classic
 * "every other clause is from the wrong column" corruption that makes academic
 * PDFs unreadable.
 *
 * The test is deliberately strict: text must sit clearly on one side or the
 * other of the page's centre, with almost nothing straddling it. A single-column
 * page with a centred heading fails that test and is left whole, which is the
 * safe outcome.
 */
function splitColumns(items: PdfTextItem[], pageWidth: number): PdfTextItem[][] {
  if (items.length < 6) return [items]

  const middle = pageWidth / 2
  const left = items.filter((item) => item.x + item.width < middle)
  const right = items.filter((item) => item.x > middle)
  const spanning = items.filter((item) => item.x + item.width >= middle && item.x <= middle)

  const balanced = left.length >= 3 && right.length >= 3
  // Full-width headings are expected; a page mostly made of them is not two
  // columns, it is one column with centred text.
  const mostlySplit = spanning.length <= items.length * 0.2

  if (!balanced || !mostlySplit) return [items]

  // Full-width text (a title, a spanning figure caption) reads before either
  // column, which is where it almost always sits on a real page.
  return [spanning, left, right].filter((group) => group.length > 0)
}

// --- Running headers and footers --------------------------------------------

/** Normalise page furniture so "Page 3" and "Page 4" count as the same line. */
function furnitureKey(text: string): string {
  return text.replace(/\d+/g, '#').trim().toLowerCase()
}

/**
 * Drop lines that repeat in the top or bottom margin across most pages: journal
 * names, book titles, page numbers. Left in, they interrupt the prose every few
 * hundred words and get permanently anchored as if they were content.
 */
function stripFurniture(lines: Line[], pages: PdfPage[]): Line[] {
  if (pages.length < REPEAT_MINIMUM) return lines

  const pagesSeen = new Map<string, Set<number>>()
  for (const line of lines) {
    const page = pages[line.page - 1]
    if (!page) continue

    const band = page.height * MARGIN_BAND
    const inMargin = line.y > page.height - band || line.y < band
    if (!inMargin) continue

    const key = furnitureKey(line.text)
    if (!key) continue
    const seen = pagesSeen.get(key) ?? new Set<number>()
    seen.add(line.page)
    pagesSeen.set(key, seen)
  }

  const repeated = new Set(
    [...pagesSeen.entries()]
      .filter(
        ([, seen]) => seen.size >= REPEAT_MINIMUM && seen.size >= pages.length * REPEAT_SHARE,
      )
      .map(([key]) => key),
  )
  if (repeated.size === 0) return lines

  return lines.filter((line) => {
    const page = pages[line.page - 1]
    if (!page) return true
    const band = page.height * MARGIN_BAND
    const inMargin = line.y > page.height - band || line.y < band
    return !(inMargin && repeated.has(furnitureKey(line.text)))
  })
}

// --- Body font size ---------------------------------------------------------

/**
 * The most common font size, weighted by how much text is set in it. Weighting
 * matters: a document can easily have more heading *lines* than body lines on a
 * title page, but body text always wins on character count.
 */
function bodyFontSize(lines: Line[]): number {
  const weights = new Map<number, number>()
  for (const line of lines) {
    const size = Math.round(line.fontSize * 2) / 2
    weights.set(size, (weights.get(size) ?? 0) + line.text.length)
  }

  let best = 0
  let bestWeight = -1
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size
      bestWeight = weight
    }
  }
  return best
}

// --- Paragraphs -------------------------------------------------------------

interface Paragraph {
  text: string
  fontSize: number
  lineCount: number
  /** Where it began: the page, and the baseline of its first line. */
  page: number
  y: number
}

/** Join a wrapped line onto the paragraph, healing hyphenation across breaks. */
function appendLine(text: string, next: string): string {
  if (/[-‐]$/.test(text)) return `${text.slice(0, -1)}${next}`
  return `${text} ${next}`
}

function toParagraphs(lines: Line[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let current: Paragraph | null = null
  let previous: Line | null = null
  let columnRight = 0

  for (const line of lines) {
    const breaks =
      previous === null ||
      line.page !== previous.page ||
      // A markedly different size is a different kind of text entirely.
      Math.abs(line.fontSize - previous.fontSize) > previous.fontSize * 0.15 ||
      // Extra leading between lines.
      previous.y - line.y > previous.fontSize * PARAGRAPH_GAP ||
      // A first-line indent.
      line.x > previous.x + previous.fontSize * INDENT ||
      // The previous line stopped well short of the column edge, so it ended a
      // paragraph rather than wrapping.
      previous.right < columnRight * SHORT_LINE

    if (breaks || current === null) {
      current = {
        text: line.text,
        fontSize: line.fontSize,
        lineCount: 1,
        page: line.page,
        y: line.y,
      }
      paragraphs.push(current)
      columnRight = line.right
    } else {
      current.text = appendLine(current.text, line.text)
      current.lineCount += 1
      columnRight = Math.max(columnRight, line.right)
    }

    previous = line
  }

  return paragraphs
}

// --- Public API -------------------------------------------------------------

/**
 * Turn pdf.js page output into a block stream: lines rebuilt, columns ordered,
 * running furniture removed, paragraphs reflowed, headings inferred from size.
 */
/**
 * A rendered band, ready to be put back in the text it was found in.
 *
 * `pdfFigures.ts` found it, `pdfRender.ts` drew it, and this is the only thing
 * the layout pass is told about either: where it sat, and what to call it.
 */
export interface PdfFigure {
  page: number
  /** The band's lower edge, counting up from the foot of the page. */
  bottom: number
  /** The asset path its picture is stored under. */
  path: string
}

export function pdfPagesToBlocks(pages: PdfPage[], figures: readonly PdfFigure[] = []): Block[] {
  const lines = pages.flatMap((page, index) => {
    const items = page.items.filter((item) => item.str.trim() !== '')
    return splitColumns(items, page.width).flatMap((group) => toLines(group, index + 1))
  })
  const content = stripFurniture(lines, pages)
  if (content.length === 0) return []

  const body = bodyFontSize(content)
  const paragraphs = toParagraphs(content)

  // Rank the heading sizes present, largest first, so the biggest text in the
  // document becomes level 1 and the next size down level 2. The assembler then
  // maps whatever it finds onto chapters and sections.
  const couldBeHeading = (paragraph: Paragraph): boolean =>
    paragraph.lineCount <= MAX_HEADING_LINES &&
    paragraph.text.length <= MAX_HEADING_CHARS &&
    paragraph.fontSize > body * HEADING_RATIO

  const headingSizes = [
    ...new Set(
      paragraphs.filter(couldBeHeading).map((p) => Math.round(p.fontSize * 2) / 2),
    ),
  ].sort((a, b) => b - a)

  const blockOf = (paragraph: Paragraph): Block => {
    const size = Math.round(paragraph.fontSize * 2) / 2
    const rank = headingSizes.indexOf(size)
    if (couldBeHeading(paragraph) && rank !== -1) {
      return { kind: 'heading', level: Math.min(rank + 1, 6), text: paragraph.text }
    }
    // PDF carries no structural markup, so everything else is prose. *Tables*
    // are still geometry here, not tags, and recognising them would mean
    // another round of heuristics on an already-lossy pass.
    //
    // Figures are the exception, and only because they are not recognised
    // either: `pdfFigures.ts` finds a tall band of the page with no text in it
    // and photographs it, which is a fact about the page rather than a judgment
    // about its contents. They arrive here already found and already drawn.
    return { kind: 'prose', text: paragraph.text }
  }

  return withFigures(paragraphs, figures, blockOf)
}

/**
 * The paragraphs with the pictures put back between them.
 *
 * A figure belongs where the reader met it: after the last paragraph that began
 * above it on the page, and before the first that begins below. Both are
 * decided in PDF coordinates, where a *larger* `y` is further up the page.
 *
 * A figure whose page holds no text at all — a full-page plate — has no
 * paragraph to sit after. It goes in when the reading reaches that page, which
 * is the first paragraph on any later page.
 */
function withFigures(
  paragraphs: readonly Paragraph[],
  figures: readonly PdfFigure[],
  blockOf: (paragraph: Paragraph) => Block,
): Block[] {
  if (figures.length === 0) return paragraphs.map(blockOf)

  const waiting = [...figures].sort((one, two) =>
    one.page === two.page ? two.bottom - one.bottom : one.page - two.page,
  )
  const blocks: Block[] = []
  let at = 0

  const figureBlock = (figure: PdfFigure): Block => ({
    kind: 'figure',
    text: '[Figure]',
    image: { src: figure.path },
  })

  for (const paragraph of paragraphs) {
    while (
      at < waiting.length &&
      (waiting[at]!.page < paragraph.page ||
        (waiting[at]!.page === paragraph.page && waiting[at]!.bottom >= paragraph.y))
    ) {
      blocks.push(figureBlock(waiting[at]!))
      at += 1
    }
    blocks.push(blockOf(paragraph))
  }

  // Anything below the last paragraph in the book — a plate on the final page.
  for (; at < waiting.length; at += 1) blocks.push(figureBlock(waiting[at]!))

  return blocks
}
