/**
 * HTML → `Block` stream. The shared front end for every format that arrives as
 * markup: epub chapters (XHTML) and Word documents (via mammoth) both land
 * here, so the "which tag is a paragraph" question is answered once.
 *
 * This deliberately does *not* produce a `ParsedBook` on its own. A single HTML
 * file is usually one chapter, not a whole book — epub hands us a dozen of them
 * and concatenates the streams. Assembly stays in `assemble.ts`.
 *
 * We use the browser's own `DOMParser` rather than a dependency: it is the same
 * battle-tested parser the reader will render with, it is free, and it recovers
 * from the malformed markup that real epubs are full of. Parsing as `text/html`
 * even for XHTML is intentional — the HTML parser never throws on a stray
 * unclosed tag, whereas the XML one refuses the whole file.
 *
 * The walk is structured around one rule: **an element that owns its contents
 * is a single block.** A table is one block with its rows, not one block per
 * cell; a list is one block, not one per item; a formula is one block, not one
 * per symbol. Anything else gets recursed into.
 */

import type { ParsedBook } from '../storage/index.ts'
import type { BookMeta, FigureImage } from '../structure/index.ts'
import {
  assembleBook,
  type Block,
  type BlockAppearance,
  type ContentBlock,
  type RawLink,
  type RawMark,
} from './assemble.ts'
import { isRunningHead } from './runningHead.ts'
import { appearanceOf, baselineOf, NO_STYLES, type Appearance, type StyleSheet } from './styles.ts'

/** Presentational or non-prose — never contributes text to a book. */
const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'HEAD',
  'TITLE',
  'IFRAME',
  'AUDIO',
  'VIDEO',
])

/**
 * Elements that own their contents: each becomes exactly one block, and the walk
 * does not descend into it. This is the heart of WP-38 — every entry here is a
 * structure that used to be shattered into one anchored paragraph per fragment.
 */
const SELF_CONTAINED: Record<string, ContentBlock['kind']> = {
  TABLE: 'table',
  FIGURE: 'figure',
  IMG: 'figure',
  SVG: 'figure',
  BLOCKQUOTE: 'quote',
  PRE: 'code',
  UL: 'list',
  OL: 'list',
  DL: 'list',
  MATH: 'formula',
  ASIDE: 'note',
}

/** Elements that end a paragraph: their text content is one prose block. */
const PARAGRAPH = new Set(['P', 'DD', 'DT', 'FIGCAPTION', 'CAPTION', 'TD', 'TH'])

/**
 * Inline elements are *not* recursed into. Splitting on them would shatter
 * "the <em>real</em> question" into three paragraphs, which would then be
 * anchored separately and be unaskable as a single thought.
 */
const INLINE = new Set([
  'A',
  'ABBR',
  'B',
  'BR',
  'CITE',
  'CODE',
  'DEL',
  'EM',
  'I',
  'INS',
  'KBD',
  'MARK',
  'Q',
  'RP',
  'RT',
  'RUBY',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
  'VAR',
  'WBR',
])

const HEADING = /^H([1-6])$/

/**
 * Emphasis in force at a point in an inline walk.
 *
 * `size` is cumulative and multiplicative, because that is what `em` means and
 * what books rely on: `.smallcaps { font-size: smaller }` inside a heading
 * already set at `x-large` is *relatively* smaller, not absolutely. Treating it
 * as absolute would shrink a part title's small caps to body size and destroy
 * the effect the publisher was after.
 */
interface Emphasis {
  italic: boolean
  bold: boolean
  /** A multiple of the enclosing block's size. `1` is no change. */
  size: number
}

const NO_EMPHASIS: Emphasis = { italic: false, bold: false, size: 1 }

/**
 * A size difference small enough that no reader would see it as a difference.
 *
 * Books round oddly — `0.9999em`, `medium` against a 16px base — and storing
 * those as a deliberate size step would put an `appearance` on every paragraph
 * of some books to say nothing at all.
 */
const SIZE_NOISE = 0.04

/**
 * What is worth recording about how a block was set.
 *
 * Returns `undefined` for ordinary body text, which is most of a book. Sizes
 * are divided by the book's own baseline first, so a `large` heading is stored
 * as `1.2` whatever the book thinks `1em` is, and two books can be compared.
 */
function blockAppearance(style: Appearance, baseline: number): BlockAppearance | undefined {
  const appearance: BlockAppearance = {}
  const size = style.size / baseline
  if (Math.abs(size - 1) > SIZE_NOISE) appearance.size = Math.round(size * 100) / 100
  if (style.bold) appearance.bold = true
  if (style.italic) appearance.italic = true
  if (style.centred) appearance.centred = true
  if (style.indented) appearance.indented = true
  return Object.keys(appearance).length > 0 ? appearance : undefined
}

/**
 * Fold one element's own styling into the emphasis already in force.
 *
 * Italic and bold accumulate — nothing inside an italic passage un-italicises
 * itself, and no book expects it to. Size only accumulates when the element
 * *declared* a size: `appearanceOf` reports `1` both for "no rule" and for "a
 * rule saying 1em", and reading the first as a change would put a spurious mark
 * on every ordinary `<span>` in the book.
 */
function merge(state: Emphasis, own: Appearance): Emphasis {
  return {
    italic: state.italic || own.italic,
    bold: state.bold || own.bold,
    size: own.size === 1 ? state.size : state.size * own.size,
  }
}

/**
 * The text of an element, plus where its links sit inside that text.
 *
 * This exists because `textContent` throws away the one thing a link needs:
 * *where* it was. A footnote marker and a cross-reference are both a few
 * characters in the middle of a sentence, so a link has to be recorded as a
 * range within the paragraph, not as a separate block — splitting the sentence
 * around it would shatter one thought into three, and anchor them separately.
 *
 * Whitespace is collapsed as it goes rather than afterwards, because collapsing
 * afterwards would move every offset already recorded.
 */
function textAndLinks(
  source: Element | readonly Node[],
  styleOf?: (element: Element) => Appearance,
): { text: string; links: RawLink[]; marks: RawMark[] } {
  let text = ''
  const links: RawLink[] = []
  const marks: RawMark[] = []

  /**
   * The emphasis in force at the point the walk has reached.
   *
   * Tracked as one merged state rather than one mark per element, so that
   * `<em>a <span class="smallcaps">B</span></em>` yields two adjacent runs
   * rather than an outer mark overlapping an inner one. Overlapping ranges are
   * legal but leave the renderer to resolve them, and the renderer should not
   * have to.
   */
  let run: RawMark | null = null

  function plain(state: Emphasis): boolean {
    return !state.italic && !state.bold && state.size === 1
  }

  /** Close the open run at the current end of `text`. */
  function closeRun(): void {
    if (run && run.end > run.start) marks.push(run)
    run = null
  }

  function setState(state: Emphasis): void {
    // Same emphasis as the open run: let it keep growing.
    if (
      run &&
      Boolean(run.italic) === state.italic &&
      Boolean(run.bold) === state.bold &&
      (run.size ?? 1) === state.size
    ) {
      return
    }
    closeRun()
    if (plain(state)) return
    run = { start: text.length, end: text.length }
    if (state.italic) run.italic = true
    if (state.bold) run.bold = true
    if (state.size !== 1) run.size = state.size
  }

  function push(raw: string): void {
    const collapsed = raw.replace(/\s+/g, ' ')
    if (collapsed === '') return
    // No leading space, and never two in a row — the same result `normalise`
    // reaches by collapsing the finished string. A newline just written by a
    // `<br>` counts as a space here: the next line must start at its own
    // beginning, not one character in.
    if ((text === '' || text.endsWith(' ') || text.endsWith('\n')) && collapsed.startsWith(' ')) {
      text += collapsed.slice(1)
      if (run) run.end = text.length
      return
    }
    text += collapsed
    // The open run grows with the text, so a mark always ends where the emphasis
    // it describes actually stopped rather than where it started.
    if (run) run.end = text.length
  }

  function walk(nodes: readonly Node[], state: Emphasis = NO_EMPHASIS): void {
    for (const child of nodes) {
      if (child.nodeType === 3 /* text */) {
        setState(state)
        push(child.textContent ?? '')
        continue
      }
      if (child.nodeType !== 1 /* element */) continue

      const el = child as Element
      if (SKIP.has(el.tagName.toUpperCase())) continue
      // A page-break marker is a position, not a word. Its number is read off
      // the element by the caller; letting its text through would drop a bare
      // "137" into the middle of the sentence it interrupts.
      if (isBarePageMarker(el)) continue

      // What this span adds to whatever is already in force. Only departures
      // count: a `<span>` with no rule of its own resolves to `size: 1` and must
      // not be read as "reset this heading to body size".
      const inner = styleOf ? merge(state, styleOf(el)) : state

      // A `<br>` is a line, and it has no text of its own to carry that with.
      // Walking it therefore contributed nothing at all, and the words either
      // side of it were pasted together: a title page reading `Published
      // by<br/>Dell Publishing<br/>a division of<br/>Random House, Inc.` came
      // out as "Published byDell Publishinga division ofRandom House, Inc."
      //
      // Kept as a real newline rather than smoothed into a space, because the
      // lines of an imprint, an address or a verse are not one sentence — the
      // renderer honours it (`white-space: pre-line`), the same newline lists
      // already use to separate their items.
      if (el.tagName.toUpperCase() === 'BR') {
        if (text !== '') text = `${text.trimEnd()}\n`
        continue
      }

      if (el.tagName.toUpperCase() === 'A') {
        const href = el.getAttribute('href') ?? ''
        const start = text.length
        walk(Array.from(el.childNodes), inner)
        // A link with no text is a bookmark target, not something to tap.
        if (href && text.length > start) links.push({ start, end: text.length, href })
        continue
      }

      walk(Array.from(el.childNodes), inner)
    }
  }

  walk(Array.isArray(source) ? source : Array.from((source as Element).childNodes))
  closeRun()

  const trimmed = text.trimEnd()
  /** Pull a range back inside the string once trailing space has gone. */
  function clamp<T extends { start: number; end: number }>(ranges: T[]): T[] {
    return ranges
      .filter((range) => range.start < trimmed.length)
      .map((range) => ({ ...range, end: Math.min(range.end, trimmed.length) }))
  }

  return {
    text: trimmed,
    // Trailing whitespace was just removed, so a link that ended on it has to
    // be pulled back inside the string it now points into.
    links: clamp(links),
    marks: clamp(marks),
  }
}

/**
 * Every id inside an element — the things links point *at*.
 *
 * Recorded per block so that, once anchors are assigned, `#footnote12` can be
 * turned into the permanent anchor of whichever block contained it.
 */
function idsIn(element: Element): string[] {
  const ids = element.id ? [element.id] : []
  for (const node of Array.from(element.querySelectorAll('[id]'))) {
    if (node.id) ids.push(node.id)
  }

  // `<a name="fn12">` is the pre-HTML5 way of marking a spot, and it is still
  // what a great many epubs use for footnote targets — books are converted from
  // old sources far more often than they are authored fresh. A link pointing at
  // one of these found nothing, so every footnote in such a book was dead text.
  const named = element.matches('a[name]') ? [element] : []
  for (const node of [...named, ...Array.from(element.querySelectorAll('a[name]'))]) {
    const name = node.getAttribute('name')
    if (name) ids.push(name)
  }

  return ids
}

/** Attach text, links and ids to a block, leaving absent fields off. */
function withLinks(block: ContentBlock, element: Element): ContentBlock {
  const ids = idsIn(element)
  if (ids.length > 0) block.ids = ids
  return block
}

/**
 * Navigation and back-matter that is *about* the book rather than part of it.
 * EPUB marks these with `epub:type`; the equivalent ARIA `role` covers HTML5
 * and the docx path. Matched as substrings because real files combine values
 * (`epub:type="frontmatter toc"`).
 */
const FURNITURE_TYPES = [
  'toc',
  'landmarks',
  'page-list',
  'index',
  'colophon',
  'cover',
  'copyright-page',
]

const NOTE_TYPES = ['footnote', 'endnote', 'rearnote', 'note']

/**
 * Parts of a book that are *displayed* rather than read straight through — a
 * dedication, an epigraph. Print centres these and gives them room; running
 * them as ordinary left-aligned body text is what makes a book's opening page
 * read like a text file. Recorded as a `label` so the renderer can set them
 * apart without a new block kind: they are still prose, and everything that
 * handles prose must keep working on them.
 */
const DISPLAY_TYPES = ['dedication', 'epigraph']

/**
 * Collapse the incidental whitespace of source markup. HTML treats newlines and
 * indentation as a single space, and a book's prose should read the same way.
 */
function normalise(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Join several pieces into one block, keeping every link on the words it began
 * on.
 *
 * Lists and multi-paragraph quotes are each *one* block built from many
 * elements, and both used to be assembled with `textContent` — which silently
 * threw every link inside them away. That is exactly why an epub's own contents
 * page had no tappable entries while a footnote in a paragraph did: a contents
 * page is a list.
 *
 * The arithmetic is the whole job. Each piece lands at a known offset in the
 * finished string, so every link inside it moves by precisely that much.
 */
function joinParts(
  parts: readonly { text: string; links: RawLink[]; prefix?: string }[],
  separator: string,
): { text: string; links: RawLink[] } {
  const links: RawLink[] = []
  let text = ''

  for (const part of parts) {
    if (text !== '') text += separator
    const at = text.length + (part.prefix?.length ?? 0)
    text += `${part.prefix ?? ''}${part.text}`
    for (const link of part.links) {
      links.push({ ...link, start: link.start + at, end: link.end + at })
    }
  }

  return { text, links }
}

/**
 * Text of a container that holds block-level children, one child per line.
 *
 * `textContent` alone is wrong here: it concatenates with no separator, so a
 * two-paragraph quote comes back as `One.Two.` and the last word of one
 * paragraph fuses with the first word of the next. Only falls back to the
 * element itself when there are no block children to join.
 */
function containerContent(element: Element): { text: string; links: RawLink[] } {
  const parts = Array.from(element.children)
    .filter((child) => ['P', 'DIV', 'BLOCKQUOTE', 'LI'].includes(child.tagName))
    .map((child) => textAndLinks(child))
    .filter((part) => part.text !== '')

  return parts.length > 0 ? joinParts(parts, '\n') : textAndLinks(element)
}

/** The semantic role an element declares, from either EPUB or ARIA vocabulary. */
function semanticType(element: Element): string {
  const epubType = element.getAttribute('epub:type') ?? element.getAttributeNS?.(
    'http://www.idpf.org/2007/ops',
    'type',
  )
  const role = element.getAttribute('role') ?? ''
  return `${epubType ?? ''} ${role}`.toLowerCase()
}

function matchesAny(haystack: string, needles: string[]): string | undefined {
  return needles.find((needle) => haystack.includes(needle))
}

/**
 * The printed page a marker announces, or `null` if this element is not one.
 *
 * A page break in an epub is an empty element dropped into the text at the spot
 * where the paper edition turned over — `<span epub:type="pagebreak" id="page7"
 * title="7"/>`. It has no reading content of its own, so it is read for its
 * number and then thrown away rather than left to appear as a stray "7" in the
 * middle of a sentence.
 *
 * The number is written in four different places by four different converters,
 * so all four are tried in the order of how deliberate each one is: `title` and
 * `aria-label` are stated on purpose, the text content is next, and the id is a
 * last resort because `page7` is a naming habit rather than a statement.
 */
const PAGE_ID = /^(?:page[_-]?)(.+)$/i

/**
 * The longest text a page-break marker can hold and still be only a marker.
 *
 * A marker is normally empty, and at most holds the page number it announces.
 * Anything longer is a container that happens to carry the attribute, and
 * skipping it would delete a page of the book to record a number about it. The
 * number is still read; only the skipping is refused.
 */
const PAGE_MARKER_MAX = 12

function isBarePageMarker(element: Element): boolean {
  return printedPageOf(element) !== null && normalise(element.textContent).length <= PAGE_MARKER_MAX
}

function printedPageOf(element: Element): string | null {
  const semantics = semanticType(element)
  if (!semantics.includes('pagebreak') && !semantics.includes('doc-pagebreak')) return null

  const stated = (element.getAttribute('title') ?? element.getAttribute('aria-label') ?? '').trim()
  if (stated) return stated

  // The text is only a page number when it is short enough to be one. A
  // container carrying the attribute holds a page of the book, and reading that
  // as the page number would label the paragraph with its own first sentence.
  const written = normalise(element.textContent)
  if (written && written.length <= PAGE_MARKER_MAX) return written

  const fromId = PAGE_ID.exec(element.getAttribute('id') ?? '')?.[1]
  return fromId ?? null
}

// --- Self-contained element readers -----------------------------------------

/**
 * The string a row's cells are joined by in the flattened text.
 *
 * Exported through `CELL_SEPARATOR` in `reader/linkRuns.ts` too — the renderer
 * cuts the flattened text back into cells on exactly this string, so the two
 * halves have to agree letter for letter.
 */
const CELL_SEPARATOR = ' | '

/**
 * The longest text a paragraph can hold and still count as "a paragraph that is
 * really just an image".
 *
 * Generous, because real captions run long ("Figure 3.2: the distribution of…"),
 * but far short of a paragraph of prose. The failure it prevents is the loud
 * one: a page of text swallowed into a caption.
 */
const FIGURE_CAPTION_MAX = 300

/**
 * A table becomes one block: a flattened `text` plus the grid in `rows`.
 *
 * The flattened form is built by `joinParts`, not by pasting strings together,
 * for the same reason lists were rewritten in WP-45: `textContent` keeps a
 * cell's words and throws away every `<a>` inside it. That is not a corner case
 * — **a book's contents page is very often a two-column table** (roman numeral,
 * title), which is precisely why the app showed plain text where Google Books
 * showed a tappable list of chapters. Cells carry their links now, offset by
 * where each cell landed in the finished string.
 */
function readTable(element: Element): ContentBlock {
  const rows: string[][] = []
  const rowParts: { text: string; links: RawLink[] }[] = []

  for (const row of Array.from(element.getElementsByTagName('tr'))) {
    const cells = Array.from(row.children)
      .filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH')
      .map((cell) => textAndLinks(cell))
    if (!cells.some((cell) => cell.text !== '')) continue

    rows.push(cells.map((cell) => cell.text))
    rowParts.push(joinParts(cells, CELL_SEPARATOR))
  }

  const caption = normalise(element.getElementsByTagName('caption')[0]?.textContent ?? '')
  const grid = joinParts(rowParts, '\n')
  // A caption is prepended as its own line, which shifts every offset behind it
  // — so it goes through `joinParts` as well rather than being concatenated.
  const { text, links } = caption
    ? joinParts([{ text: caption, links: [] }, grid], '\n')
    : grid

  const block: ContentBlock = { kind: 'table', text }
  if (rows.length > 0) block.rows = rows
  if (caption) block.label = caption
  if (links.length > 0) block.links = links
  return block
}

/**
 * Find the image inside a `<figure>`, or the element itself if it is one.
 *
 * Handles both spellings: an ordinary `<img src>`, and the `<svg><image
 * xlink:href></svg>` wrapper that epub producers use for full-page artwork —
 * covers and plates in real books are almost always the second form.
 */
function readImage(element: Element): FigureImage | undefined {
  const img = element.tagName === 'IMG' ? element : element.getElementsByTagName('img')[0]
  if (img) {
    const src = img.getAttribute('src') ?? ''
    if (src) {
      const alt = normalise(img.getAttribute('alt'))
      return alt ? { src, alt } : { src }
    }
  }

  const svgImage = element.getElementsByTagName('image')[0]
  const href =
    svgImage?.getAttribute('href') ?? svgImage?.getAttribute('xlink:href') ?? ''
  if (!href) return undefined

  // SVG has no alt attribute; `<title>` is its accessible-name equivalent.
  const title = normalise(element.getElementsByTagName('title')[0]?.textContent ?? '')
  return title ? { src: href, alt: title } : { src: href }
}

/**
 * A figure becomes one block. Its `text` is the caption, or the alt text, or a
 * placeholder — so a reader always sees *something* where the image is, rather
 * than a silent hole, even before the renderer can display images.
 */
function readFigure(element: Element): ContentBlock {
  const image = readImage(element)
  const caption = normalise(
    element.getElementsByTagName('figcaption')[0]?.textContent ?? '',
  )

  const description = caption || image?.alt || ''
  const text = description ? `[Figure: ${description}]` : '[Figure]'

  const block: ContentBlock = { kind: 'figure', text }
  if (image) block.image = image
  if (caption) block.label = caption
  return block
}

/**
 * A list becomes one block, one item per line.
 *
 * Links matter more here than anywhere else in the parser: a book's own
 * contents page is a list of links, and so is most of a notes section.
 */
function readList(element: Element): ContentBlock {
  const ordered = element.tagName === 'OL'
  const parts = Array.from(element.children)
    .filter((child) => ['LI', 'DT', 'DD'].includes(child.tagName))
    .map((child) => textAndLinks(child))
    .filter((part) => part.text !== '')
    .map((part, index) => ({ ...part, prefix: ordered ? `${index + 1}. ` : '• ' }))

  const { text, links } = joinParts(parts, '\n')
  const label = element.tagName === 'DL' ? 'definition' : ordered ? 'ordered' : 'unordered'

  const block: ContentBlock = { kind: 'list', text, label }
  if (links.length > 0) block.links = links
  return block
}

/** A block of the given kind, carrying its links only when it has any. */
function contentBlockOf(
  kind: ContentBlock['kind'],
  content: { text: string; links: RawLink[] },
): ContentBlock {
  const block: ContentBlock = { kind, text: content.text }
  if (content.links.length > 0) block.links = content.links
  return block
}

// --- The walk ----------------------------------------------------------------

/**
 * Convert an HTML fragment or document into blocks, in reading order.
 *
 * Runs in the browser (and in jsdom under test) — it needs a DOM. Callers on a
 * non-DOM runtime should convert to markdown first instead.
 */
/**
 * The longest a bold line can be and still be read as a heading. A heading
 * names a thing; past this it is a sentence the author wanted stressed.
 */
const BOLD_HEADING_MAX = 70

/** A heading is a label, so anything finishing like a statement is not one. */
const ENDS_LIKE_A_SENTENCE = /[.!?,;:]$/

/**
 * "An Example of Growing Toward Self-Leadership 130" — a contents entry, not a
 * heading. A contents page sets its lines in the same bold as the headings they
 * point at, and the page number trailing the title is what tells them apart.
 *
 * The number must follow a title of *more than one word*, and that qualifier is
 * the whole difficulty. "Chapter 1" and "Part 1" end in a space and a number
 * too, and they are the commonest chapter titles in print. Without the qualifier
 * this rule threw out every numbered chapter in a book before any other rule
 * saw it — which is what emptied the contents of a reported book down to the one
 * chapter its own navigation happened to list.
 *
 * A contents line names something, so it has a name to give: two words at least
 * before the page number. A numbered title is a label and a figure, and nothing
 * else. That is the difference, and it needs no list of label words.
 */
const ENDS_WITH_A_PAGE_NUMBER = /\S+(\s+\S+)+\s+\d{1,4}$/

/**
 * Whether this paragraph is a section heading wearing a paragraph's clothes.
 *
 * Plenty of books — especially anything converted from print — never use
 * `<h1>`–`<h6>` below the chapter level. A subheading is simply a paragraph set
 * in bold, because in the print original it was just *heavier type*:
 *
 *     <p class="calibre1"><b class="calibre4">The Three Projects</b></p>
 *
 * The markup says "paragraph"; every reader can see it is a heading. Since the
 * parser flattens inline formatting to plain text, that difference was being
 * dropped on the floor and the line arrived indistinguishable from prose.
 *
 * Recognised by three things together, because bold alone is far too common:
 * the whole paragraph is bold (not a bolded phrase inside a sentence), it is
 * short, and it does not end like a sentence. Emphasis inside real prose fails
 * the first test; a bolded warning fails the other two.
 *
 * Deliberately *not* promoted to a real `heading` block. A heading is consumed
 * as a division title and disappears from the text, which would shift every
 * anchor after it — and an anchor is what a highlight is pinned to. Labelling
 * the paragraph leaves it exactly where it is and lets the reading screen set
 * it apart, which is all the reader actually asked for.
 */
function isBoldHeading(element: Element, text: string): boolean {
  if (!couldBeAHeading(text)) return false

  const bold = [...element.querySelectorAll('b, strong')]
  if (bold.length === 0) return false
  // The bold has to account for the whole line. A sentence with two words
  // emphasised in it is prose, and this is the test that says so.
  const bolded = normalise(bold.map((node) => node.textContent ?? '').join(' '))
  return bolded === text
}

/** The shape tests every heading rule shares, whatever the evidence for it. */
function couldBeAHeading(text: string): boolean {
  if (text.length === 0 || text.length > BOLD_HEADING_MAX) return false
  if (ENDS_LIKE_A_SENTENCE.test(text)) return false
  if (ENDS_WITH_A_PAGE_NUMBER.test(text)) return false
  return true
}

/**
 * How much larger than the book's body text a line must be set before size
 * alone marks it as a heading.
 *
 * 1.15 rather than something rounder because that is about where a difference
 * stops being a typographic nicety and becomes a signal. Converters routinely
 * set body text at 1em and a chapter title at 1.2em or more; a pull-quote or a
 * first-line flourish sits under this, and stays prose.
 */
const HEADING_SIZE_RATIO = 1.15

/**
 * Whether the book's own stylesheet says this paragraph is a heading.
 *
 * This is the half `isBoldHeading` could never reach. That rule needs a literal
 * `<b>` around the whole line, which only some converters emit. The rest put
 * the very same intent in CSS — `font-weight: bold`, a larger `font-size`, or a
 * centred line with no first-line indent — and the markup is left saying
 * nothing at all. The result was a chapter title, a dedication and a line of
 * prose arriving as three identical paragraphs.
 *
 * Judged against `baseline`, the size *this book* sets its body text in, never
 * against a fixed number. See the note in `styles.ts`: books disagree about
 * what 1em means, but no book disagrees with itself.
 *
 * Two signals are required, not one, and this is the load-bearing part of the
 * rule. Whole books are set bold, or centred, or in a larger face; any single
 * signal on its own would turn such a book entirely into headings. A line that
 * is *both* louder than its neighbours in size and set apart by weight or
 * position is one the author separated on purpose.
 */
function looksStyledAsHeading(style: Appearance, baseline: number, text: string): boolean {
  if (!couldBeAHeading(text)) return false
  // Running prose is indented on the first line; a title never is. When the
  // book says this line is indented, it is telling us it is a paragraph.
  if (style.indented) return false

  const larger = style.size >= baseline * HEADING_SIZE_RATIO
  const signals = [larger, style.bold, style.centred].filter(Boolean).length
  return larger ? signals >= 1 : signals >= 2
}

/**
 * The most of a document that may be headings before the finding is disbelieved.
 *
 * A safety rail, not a rule. If a third of a chapter is coming back as titles,
 * the stylesheet has been read wrongly — a rule matched far more widely than it
 * looked, most likely — and the honest response is to keep the text as prose.
 * Wrong emphasis is a blemish; a chapter chopped into fifty divisions is a book
 * the reader cannot navigate.
 *
 * Weighed only on a document long enough for the share to mean anything. An
 * epub gives a part its own file, holding one line — "PLANTING SWEETGRASS" —
 * and that file is 100% heading and entirely correct. Judging it by proportion
 * would throw out the very titles that divide the book into parts.
 */
const HEADING_SHARE_MAX = 0.34
const HEADING_SHARE_FLOOR = 8

/**
 * Turn style-detected headings into real headings, and give them levels.
 *
 * Detecting them was only half the job. A labelled paragraph *looks* like a
 * heading and is nothing else: the assembler builds the book's divisions from
 * `heading` blocks, and the contents screen is built from those divisions. So a
 * converted book — which has no `<h1>` anywhere — came out as one undivided
 * run of text with bold lines in it, and the contents screen had almost nothing
 * to list. That was the state the reader reported: every title visible on the
 * page, and none of them in Contents.
 *
 * ## Levels come from ranking, not from the sizes themselves
 *
 * A book has no absolute idea of "level 1". It has an order: its part titles
 * are set larger than its chapter titles, which are set larger than anything
 * below. Sorting the distinct sizes found in the document and using the
 * position gives exactly that, and gives it without knowing a single thing
 * about how this particular converter names or scales its type. Ranked
 * descending, so the largest is level 1.
 *
 * ## Only where the document has no headings of its own
 *
 * A file with real `<h1>`–`<h6>` has already said what its structure is, and
 * that statement always wins — a guess competing with it could split one
 * chapter in two. Asked per document rather than per book, for the reason
 * recorded at `PARSER_VERSION` 20: a book with headings in its endnotes and
 * nowhere else must not have the fallback switched off for every chapter.
 */
function promoteStyledHeadings(
  blocks: Block[],
  found: Map<Block, { size: number; ids: string[] }>,
): Block[] {
  if (found.size === 0) return blocks
  if (blocks.some((block) => block.kind === 'heading')) return blocks
  if (blocks.length >= HEADING_SHARE_FLOOR && found.size > blocks.length * HEADING_SHARE_MAX) {
    return blocks
  }

  const ranked = [...new Set([...found.values()].map((entry) => entry.size))].sort((a, b) => b - a)

  return blocks.map((block) => {
    const entry = found.get(block)
    if (!entry) return block

    const promoted: Block = {
      kind: 'heading',
      level: ranked.indexOf(entry.size) + 1,
      text: block.text,
      // Flagged as inference, so an epub's own navigation can overrule it.
      guessed: true,
    }
    // Carried over because a heading is what a contents page links to, and the
    // ids were the paragraph's before it became one.
    if (entry.ids.length > 0) promoted.ids = entry.ids
    return promoted
  })
}

/*
 * A printed contents page was briefly turned into furniture here, on the
 * reasoning that the app builds its own contents screen and the paper page
 * numbers mean nothing on a phone. Both halves of that are true and the rule
 * was still wrong twice over.
 *
 * It dropped a page the reader wanted. The app's contents screen is for
 * navigating; the printed one is part of the book, and belongs where the
 * publisher put it.
 *
 * And it could not tell where the contents ended. It ran forward from the word
 * "Contents" taking every short line as another entry, and "PREFACE" — short,
 * and not ending like a sentence — is exactly that shape. So the book's first
 * chapter title was dropped as furniture, and the Preface vanished from the
 * contents screen. That is the failure the rule existed to prevent.
 *
 * Kept as a note rather than deleted quietly, because the idea will look
 * reasonable again to whoever reads this next.
 */

/**
 * A section break: the pause an author puts between two scenes inside one
 * chapter. In a printed book it is a line of asterisks, a small ornament, or
 * simply extra white space; in a file it arrives as `<hr>` or as a short
 * paragraph containing nothing but punctuation.
 *
 * Recognised so the reader can *draw* it. Left alone, `***` prints as the
 * literal characters an author never meant to be read, and an `<hr>` — which
 * this parser has no leaf rule for — vanishes silently, running two scenes
 * together with no more than a paragraph gap between them.
 *
 * It stays `prose` with a label rather than becoming a `BlockKind` of its own:
 * a break is already a block that was already there, and anchors are permanent
 * — see `structure/types.ts`. Labelling changes how it draws and nothing else.
 *
 * Deliberately narrow. Three characters at most, and only characters that are
 * used as ornaments, so a one-word line, an ellipsis of dialogue, or a stray
 * "?" can never be mistaken for a division of the story.
 */
const ORNAMENT_ONLY = /^[*＊•·●○◆◇❖§~–—_]{1,3}$/

function isSectionBreak(text: string): boolean {
  // Spaces removed before counting, because "* * *" and "***" are the same
  // mark typed two ways and only the ornaments should be counted.
  return ORNAMENT_ONLY.test(text.replace(/\s+/g, ''))
}

export function htmlToBlocks(html: string, sheet: StyleSheet = NO_STYLES): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: Block[] = []
  let inline: Node[] = []
  /** Printed page numbers, against the index of the block each one opens. */
  const pageAt = new Map<number, string>()

  // Resolving a style walks every rule, and the walk below asks about the same
  // element the baseline pass already asked about. Memoised so each element is
  // costed once whatever the size of the book's stylesheet.
  const styles = new Map<Element, Appearance>()
  const styledHeadings = new Map<Block, { size: number; ids: string[] }>()
  function styleOf(element: Element): Appearance {
    let style = styles.get(element)
    if (!style) {
      style = appearanceOf(element, sheet)
      styles.set(element, style)
    }
    return style
  }

  /*
   * The size this document sets its body text in, measured before anything is
   * classified. It has to come first: "is this line bigger than the others" is
   * not a question a single pass over the document can answer, because the
   * others have not been seen yet.
   */
  // Only the innermost ones. A `<div>` wrapping the whole chapter holds every
  // paragraph's text as well as its own, and counting it would let one wrapper
  // outweigh the book it contains.
  const paragraphs = [...doc.body.querySelectorAll('p, div')].filter(
    (element) => element.querySelector('p, div') === null,
  )
  const baseline = baselineOf(
    paragraphs.map((element) => ({
      size: styleOf(element).size,
      length: normalise(element.textContent).length,
    })),
  )

  /**
   * Emit whatever inline content has accumulated. Runs of text and inline
   * elements between two block-level tags form one paragraph, which is what lets
   * loose prose inside a bare `<div>` survive intact.
   *
   * The nodes themselves are kept, not their `textContent`, and the same
   * extractor a `<p>` gets is run over them. Flattening here was a second, much
   * poorer reader of the same content: a contents page built as
   * `<div><a>Chapter One</a><br/><a>Chapter Two</a></div>` — which is how a
   * great many converted epubs set one out — lost the `<br>` that put each entry
   * on its own line, lost every link, and lost every italic, purely because the
   * entries sat in a `<div>` instead of a `<p>`.
   */
  function flushInline(): void {
    const nodes = inline
    inline = []
    if (nodes.length === 0) return

    const { text, links, marks } = textAndLinks(nodes, styleOf)
    if (!text) return

    const block: ContentBlock = { kind: 'prose', text }
    if (links.length > 0) block.links = links
    if (marks.length > 0) block.marks = marks
    // Link targets that sat on the loose elements themselves. Collected the same
    // way `withLinks` does it, but from several roots rather than one.
    const ids = nodes
      .filter((node): node is Element => node.nodeType === 1)
      .flatMap((element) => idsIn(element))
    if (ids.length > 0) block.ids = ids
    blocks.push(block)
  }

  /**
   * `inherited` is the `epub:type` of the enclosing section, carried down.
   *
   * A dedication page marks the *section* — `<section epub:type="dedication">`
   * — and hangs ordinary `<p>`s inside it. Reading the type off the paragraph
   * alone therefore finds nothing, and the one block that most obviously wants
   * setting apart from body text looks exactly like body text.
   */
  function walk(node: Node, inherited = ''): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 /* text */) {
        inline.push(child)
        continue
      }
      if (child.nodeType !== 1 /* element */) continue

      const element = child as Element
      const tag = element.tagName.toUpperCase()

      if (SKIP.has(tag)) continue

      // A page-break marker between two blocks belongs to the block that comes
      // after it: it says "the printed page turns here". Recorded against the
      // index the next block will take, and attached once the walk is over —
      // the block itself does not exist yet.
      const page = printedPageOf(element)
      if (page !== null) {
        // Pending inline content becomes a block of its own before the next one,
        // but only if it holds actual words — the whitespace between two tags is
        // in the buffer too and flushes to nothing.
        const pending = inline.some((node) => normalise(node.textContent) !== '')
        pageAt.set(blocks.length + (pending ? 1 : 0), page)
        // Only a marker that holds nothing is *replaced* by its number. One that
        // wraps real content is a container with the attribute on it, and is
        // walked into like any other — a page number is never worth a page.
        if (isBarePageMarker(element)) continue
      }

      if (INLINE.has(tag)) {
        inline.push(element)
        continue
      }

      flushInline()

      // Navigation and back matter are recognised only to be discarded — the
      // assembler drops furniture before any anchor is assigned.
      // Trimmed because `semanticType` joins two attributes with a space and so
      // never returns an empty string — untrimmed, "no type of its own" is
      // indistinguishable from " " and the inherited one could never win.
      const own = semanticType(element).trim()
      const semantics = own || inherited
      if (tag === 'NAV' || matchesAny(semantics, FURNITURE_TYPES)) {
        blocks.push({ kind: 'furniture', text: normalise(element.textContent) })
        continue
      }

      // A horizontal rule is a scene break, and the only tag in a book that
      // means something while containing nothing. Given text of its own so it
      // survives the `if (block.text)` guards downstream and so a reader that
      // knows nothing of the label still shows *something* in the gap.
      if (tag === 'HR') {
        blocks.push({ kind: 'prose', text: '***', label: 'break' })
        continue
      }

      const heading = HEADING.exec(tag)
      if (heading) {
        const text = normalise(element.textContent)
        if (!text) continue
        const block: Block = { kind: 'heading', level: Number(heading[1]), text }
        // Headings are the commonest link target in a book: every entry in an
        // epub's own contents points at one.
        const ids = idsIn(element)
        if (ids.length > 0) block.ids = ids
        pageInside(element, blocks.length)
        blocks.push(block)
        continue
      }

      const contained = SELF_CONTAINED[tag]
      if (contained) {
        const block =
          contained === 'table'
            ? readTable(element)
            : contained === 'figure'
              ? readFigure(element)
              : contained === 'list'
                ? readList(element)
                : contained === 'code'
                  ? // `<pre>` is the one place whitespace is the content.
                    { kind: 'code' as const, text: (element.textContent ?? '').replace(/\s+$/, '') }
                  : contentBlockOf(contained, containerContent(element))

        // A footnote marked up as a plain element still reads as a note.
        const noteType = matchesAny(semantics, NOTE_TYPES)
        if (noteType && block.kind !== 'figure' && block.kind !== 'table') {
          blocks.push(withLinks({ ...block, kind: 'note', label: noteType }, element))
        } else if (block.text) {
          blocks.push(withLinks(block, element))
        }
        continue
      }

      if (PARAGRAPH.has(tag)) {
        // `<p class="image"><img/></p>` is *the* way epub producers place
        // artwork — far more common than `<figure>`. Because a paragraph is a
        // leaf here, an image inside one would otherwise never be looked at,
        // and a paragraph holding nothing but an image would vanish entirely.
        const image = readImage(element)
        // An image *inside* a paragraph of prose is not a figure — it is a
        // drop-cap, an ornament or an inline glyph, and treating the paragraph
        // as a figure turned a whole page of text into a caption, printed a
        // second time under the prose it was copied from. Only a paragraph that
        // is essentially just the image is promoted; anything with real prose in
        // it stays prose.
        if (image && normalise(element.textContent).length <= FIGURE_CAPTION_MAX) {
          const caption = normalise(element.textContent)
          const description = caption || image.alt || ''
          const figure: ContentBlock = {
            kind: 'figure',
            text: description ? `[Figure: ${description}]` : '[Figure]',
            image,
          }
          if (caption) figure.label = caption
          blocks.push(figure)
          continue
        }

        const { text, links, marks } = textAndLinks(element, styleOf)
        if (!text) continue
        // "* * *" typed into the manuscript, which is how most breaks reach a
        // file. Checked before anything else can claim the paragraph.
        if (isSectionBreak(text)) {
          blocks.push({ kind: 'prose', text: '***', label: 'break' })
          continue
        }
        const noteType = matchesAny(semantics, NOTE_TYPES)
        const displayType = matchesAny(semantics, DISPLAY_TYPES)
        const block: ContentBlock = noteType
          ? { kind: 'note', text, label: noteType }
          : displayType
            ? { kind: 'prose', text, label: displayType }
            : isBoldHeading(element, text) || looksStyledAsHeading(styleOf(element), baseline, text)
              ? { kind: 'prose', text, label: 'subheading' }
              : { kind: 'prose', text }
        if (links.length > 0) block.links = links
        if (marks.length > 0) block.marks = marks
        const appearance = blockAppearance(styleOf(element), baseline)
        if (appearance) block.appearance = appearance
        // Remembered so `promoteStyledHeadings` can rank these by size later.
        // A level cannot be settled here: "is this bigger than the other
        // headings" needs all of them, and only two have been seen so far.
        if (block.label === 'subheading') {
          styledHeadings.set(block, { size: styleOf(element).size, ids: idsIn(element) })
        }
        pageInside(element, blocks.length)
        blocks.push(withLinks(block, element))
        continue
      }

      // A container: descend, passing on whatever it says it is so the
      // paragraphs inside a dedication or an epigraph know they are in one.
      walk(element, matchesAny(own, DISPLAY_TYPES) ? own : inherited)
    }
    flushInline()
  }

  /**
   * A page-break marker inside a block that has already been built. Converters
   * put one at the head of the paragraph the page opens with as often as they
   * put it between two, and a leaf block is never walked into.
   */
  function pageInside(element: Element, index: number): void {
    for (const node of Array.from(element.querySelectorAll('*'))) {
      const page = printedPageOf(node)
      if (page !== null) {
        if (!pageAt.has(index)) pageAt.set(index, page)
        return
      }
    }
  }

  walk(doc.body)

  for (const [index, page] of pageAt) {
    const block = blocks[index]
    if (block) block.printedPage = page
  }

  /*
   * The running heads a print edition left in the text — "Introduction | 7".
   * Re-kinded here, at the end of the walk, rather than dropped: `furniture` is
   * the parser's existing word for "in the file but not part of the book", and
   * `assembleBook` already removes it before a single anchor is assigned, so a
   * page number never consumes an id that a real paragraph should have had.
   *
   * It has to happen before this function returns, because `epub.ts` marks its
   * page breaks on the first block that will *survive* — mark a break on a
   * running head and dropping it later would take the break with it, running
   * two chapters together.
   *
   * Headings are examined as well as prose. That was not the first instinct —
   * a heading is the author speaking, and dropping one silently removes a
   * division of the book. But a converter reaching for `<h1>` is describing how
   * the line *looked* on the page, not what it was, and the running head at the
   * top of a printed page looks exactly like a heading. "6 | You Are the One
   * You've Been Waiting For" arrived as one. The shape test is the same, and it
   * is strict enough that a real heading has to be trying to match it.
   *
   * The cost is the block's `ids`: furniture is dropped whole, so a link
   * pointing at one of these resolves to nothing and becomes plain text. That
   * is accepted here because the only thing that routinely links to headings is
   * the contents page, and a contents page points at chapter openings — never
   * at the page furniture repeated above them.
   */
  return promoteStyledHeadings(blocks, styledHeadings).map((block) =>
    (block.kind === 'prose' || block.kind === 'heading') && isRunningHead(block.text)
      ? { kind: 'furniture' as const, text: block.text }
      : block,
  )
}

/**
 * Parse a single self-contained HTML document into the shared structure. Used
 * by docx (WP-37), where mammoth hands back the whole book as one document.
 * Epub goes the other way — many files, one book — so it calls `htmlToBlocks`
 * per chapter and assembles the concatenation itself.
 */
export function parseHtml(html: string, meta: BookMeta): ParsedBook {
  return assembleBook(htmlToBlocks(html), meta)
}
