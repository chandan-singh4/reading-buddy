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
import { assembleBook, type Block, type ContentBlock, type RawLink } from './assemble.ts'
import { isRunningHead } from './runningHead.ts'

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
function textAndLinks(element: Element): { text: string; links: RawLink[] } {
  let text = ''
  const links: RawLink[] = []

  function push(raw: string): void {
    const collapsed = raw.replace(/\s+/g, ' ')
    if (collapsed === '') return
    // No leading space, and never two in a row — the same result `normalise`
    // reaches by collapsing the finished string. A newline just written by a
    // `<br>` counts as a space here: the next line must start at its own
    // beginning, not one character in.
    if ((text === '' || text.endsWith(' ') || text.endsWith('\n')) && collapsed.startsWith(' ')) {
      text += collapsed.slice(1)
      return
    }
    text += collapsed
  }

  function walk(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 /* text */) {
        push(child.textContent ?? '')
        continue
      }
      if (child.nodeType !== 1 /* element */) continue

      const el = child as Element
      if (SKIP.has(el.tagName.toUpperCase())) continue

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
        walk(el)
        // A link with no text is a bookmark target, not something to tap.
        if (href && text.length > start) links.push({ start, end: text.length, href })
        continue
      }

      walk(el)
    }
  }

  walk(element)

  const trimmed = text.trimEnd()
  return {
    text: trimmed,
    // Trailing whitespace was just removed, so a link that ended on it has to
    // be pulled back inside the string it now points into.
    links: links
      .filter((link) => link.start < trimmed.length)
      .map((link) => ({ ...link, end: Math.min(link.end, trimmed.length) })),
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
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: Block[] = []
  let inline: string[] = []

  /**
   * Emit whatever inline text has accumulated. Runs of text and inline elements
   * between two block-level tags form one paragraph, which is what lets loose
   * prose inside a bare `<div>` survive intact.
   */
  function flushInline(): void {
    const text = normalise(inline.join(' '))
    if (text) blocks.push({ kind: 'prose', text })
    inline = []
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
        inline.push(child.textContent ?? '')
        continue
      }
      if (child.nodeType !== 1 /* element */) continue

      const element = child as Element
      const tag = element.tagName.toUpperCase()

      if (SKIP.has(tag)) continue
      if (INLINE.has(tag)) {
        inline.push(element.textContent ?? '')
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

      const heading = HEADING.exec(tag)
      if (heading) {
        const text = normalise(element.textContent)
        if (!text) continue
        const block: Block = { kind: 'heading', level: Number(heading[1]), text }
        // Headings are the commonest link target in a book: every entry in an
        // epub's own contents points at one.
        const ids = idsIn(element)
        if (ids.length > 0) block.ids = ids
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

        const { text, links } = textAndLinks(element)
        if (!text) continue
        const noteType = matchesAny(semantics, NOTE_TYPES)
        const displayType = matchesAny(semantics, DISPLAY_TYPES)
        const block: ContentBlock = noteType
          ? { kind: 'note', text, label: noteType }
          : displayType
            ? { kind: 'prose', text, label: displayType }
            : { kind: 'prose', text }
        if (links.length > 0) block.links = links
        blocks.push(withLinks(block, element))
        continue
      }

      // A container: descend, passing on whatever it says it is so the
      // paragraphs inside a dedication or an epigraph know they are in one.
      walk(element, matchesAny(own, DISPLAY_TYPES) ? own : inherited)
    }
    flushInline()
  }

  walk(doc.body)

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
  return blocks.map((block) =>
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
