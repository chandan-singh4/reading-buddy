/**
 * EPUB → `ParsedBook`.
 *
 * An epub is a ZIP with a table of contents. Reading one is four steps:
 *
 *   1. `META-INF/container.xml` names the package file (the `.opf`).
 *   2. The `.opf` holds the metadata, a manifest of every file, and — the part
 *      that matters — a **spine**: the reading order.
 *   3. Walk the spine, read each XHTML document, and turn it into blocks with
 *      the shared `html.ts` front end.
 *   4. Hand the concatenated stream to the shared assembler.
 *
 * We deliberately do *not* use epub.js. That library is a renderer: it wants to
 * paginate a book into an iframe and own the screen. We already have our own
 * renderer and our own anchor grammar, so all we want from an epub is its text
 * in the right order — which is the ~200 lines below, with no library
 * disagreeing with us about layout.
 *
 * Namespaces are matched by *local* name throughout. Real epubs are wildly
 * inconsistent about prefixes (`opf:item`, `item`, `dc:title`, `metadata`), and
 * strict namespace lookups fail on files that every other reader opens fine.
 */

import { unzipSync, strFromU8 } from 'fflate'

import { cleanTitle } from './cleanTitle.ts'

import { COVER_ASSET_PATH, type BookAsset, type ParsedBook } from '../storage/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { assembleBook, type Block } from './assemble.ts'
import { htmlToBlocks } from './html.ts'

export class EpubError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EpubError'
  }
}

type Archive = Record<string, Uint8Array>

// --- Archive helpers ---------------------------------------------------------

/**
 * ZIP entries are byte-exact, but hrefs inside an epub are URL-encoded and
 * occasionally differ in case from the stored name. Look up leniently rather
 * than dropping a chapter over a `%20`.
 */
function readFile(archive: Archive, path: string): Uint8Array | null {
  const direct = archive[path]
  if (direct) return direct

  const decoded = safeDecode(path)
  if (archive[decoded]) return archive[decoded]

  const wanted = decoded.toLowerCase()
  for (const name of Object.keys(archive)) {
    if (name.toLowerCase() === wanted) return archive[name]
  }
  return null
}

function readText(archive: Archive, path: string): string | null {
  const bytes = readFile(archive, path)
  return bytes ? strFromU8(bytes) : null
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    // A stray `%` that isn't an escape sequence — use the path as written.
    return path
  }
}

/**
 * Resolve an href against the directory of the file that referenced it, the way
 * a browser would. Epub hrefs are relative and routinely reach upward
 * (`../Text/ch01.xhtml`), so `..` and `.` have to be honoured.
 */
function resolvePath(base: string, href: string): string {
  const target = safeDecode(href.split('#')[0].trim())
  if (!target) return ''

  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
  const segments = target.startsWith('/')
    ? target.slice(1).split('/')
    : [...(baseDir ? baseDir.split('/') : []), ...target.split('/')]

  const stack: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') stack.pop()
    else stack.push(segment)
  }
  return stack.join('/')
}

/**
 * A link's destination in the same form the ids are qualified into:
 * `OEBPS/text/chapter3.xhtml#note12`.
 *
 * Three shapes arrive here and all three matter. `#note12` is a link within the
 * same file — much the commonest, since that is what a footnote marker is.
 * `chapter3.xhtml#note12` crosses files. `chapter4.xhtml` names a whole
 * document, meaning its beginning.
 *
 * Anything with a scheme is left exactly as written: it leaves the book, and
 * mangling `https://…` into an archive path would turn a working web link into
 * a broken internal one.
 */
function absoluteHref(base: string, href: string): string {
  const trimmed = href.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed

  const hash = trimmed.indexOf('#')
  const fragment = hash === -1 ? '' : trimmed.slice(hash + 1)
  const file = hash === -1 ? trimmed : trimmed.slice(0, hash)

  // A bare `#id` points inside the file it was written in.
  const path = file === '' ? base : resolvePath(base, file)
  if (!path) return trimmed
  return fragment ? `${path}#${fragment}` : path
}

// --- XML helpers -------------------------------------------------------------

function parseXml(xml: string, what: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new EpubError(`${what} is not valid XML`)
  }
  return doc
}

/** Find elements by local name, ignoring whatever namespace prefix is in use. */
function byLocalName(root: Document | Element, name: string): Element[] {
  const wanted = name.toLowerCase()
  return Array.from(root.getElementsByTagName('*')).filter(
    (element) => (element.localName || element.tagName).toLowerCase() === wanted,
  )
}

function firstByLocalName(root: Document | Element, name: string): Element | null {
  return byLocalName(root, name)[0] ?? null
}

// --- The Dublin Core record ---------------------------------------------------

/**
 * What the package file says about the book, beyond its title and author.
 *
 * All of this has been sitting in every epub the reader has ever imported. It
 * is read here rather than fetched from a catalogue because it is free, offline
 * and *authoritative* — this is the publisher's own record of their own
 * edition, where a title search against a catalogue is a guess that can land on
 * an audiobook or a study guide.
 */
interface FileMetadata {
  isbn?: string
  publisher?: string
  published?: string
  language?: string
  description?: string
  subjects?: string[]
}

/** An attribute that may or may not carry its namespace prefix in the source. */
function attr(element: Element, name: string): string | null {
  return element.getAttribute(name) ?? element.getAttribute(`opf:${name}`)
}

function textOf(element: Element | null | undefined): string | undefined {
  const text = element?.textContent?.trim()
  return text || undefined
}

/**
 * ISBN-13 first, ISBN-10 second, and nothing else at all.
 *
 * `dc:identifier` is the one metadata element an epub is *required* to have, so
 * every book has at least one — and a large share of them are a UUID, a Calibre
 * id, or a publisher's internal reference. Storing one of those as an ISBN
 * would mean the lookup that follows returns a confident answer about a
 * different book, which is the one failure mode worth spending code to avoid.
 *
 * So the test is the actual ISBN checksum rather than a shape match. A UUID
 * fails on shape anyway; a 13-digit internal reference is exactly the case that
 * shape alone would wave through.
 */
function readIsbn(metadata: Document | Element): string | undefined {
  let ten: string | undefined

  for (const element of byLocalName(metadata, 'identifier')) {
    const raw = element.textContent?.trim()
    if (!raw) continue

    // `urn:isbn:978-0-…`, `ISBN:978…`, `978-0-…` — and hyphens and spaces
    // anywhere, because the grouping is presentational and publishers differ.
    const digits = raw.replace(/^\s*(urn:)?isbn:?/i, '').replace(/[\s-]/g, '')

    // 13 wins outright: it names the edition unambiguously, and an ISBN-10 is
    // just an older, shorter spelling of one of them.
    if (isIsbn13(digits)) return digits
    if (ten === undefined && isIsbn10(digits)) ten = digits.toUpperCase()
  }

  return ten
}

/** Modulo-10 with alternating weights 1 and 3, over a 978/979 EAN. */
function isIsbn13(value: string): boolean {
  if (!/^97[89]\d{10}$/.test(value)) return false

  let sum = 0
  for (let i = 0; i < 13; i += 1) sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3)
  return sum % 10 === 0
}

/** Modulo-11 with descending weights, where a remainder of 10 is written `X`. */
function isIsbn10(value: string): boolean {
  if (!/^\d{9}[\dXx]$/.test(value)) return false

  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(value[i]) * (10 - i)
  const last = value[9].toUpperCase()
  sum += last === 'X' ? 10 : Number(last)
  return sum % 11 === 0
}

/**
 * The publication date, to whatever precision the file gives — and only the
 * publication one.
 *
 * EPUB 2 puts several dates in `dc:date` and tells them apart with
 * `opf:event`: `publication`, `creation`, `modification`. EPUB 3 dropped the
 * attribute, keeps `dc:date` for publication alone, and moved "last modified"
 * to a `dcterms:modified` meta. So a bare `dc:date` is a publication date in
 * EPUB 3 and *might* be a modification date in EPUB 2 — which is why an
 * explicitly labelled one is preferred and an explicitly non-publication one is
 * skipped rather than used as a fallback. A file's last save date on the shelf
 * as "published 2024" would be wrong about a book from 1954.
 */
function readPublished(metadata: Document | Element): string | undefined {
  let unlabelled: string | undefined

  for (const element of byLocalName(metadata, 'date')) {
    const event = attr(element, 'event')?.toLowerCase()
    if (event && event !== 'publication') continue

    const date = datePartOf(element.textContent)
    if (!date) continue
    if (event === 'publication') return date
    unlabelled ??= date
  }

  return unlabelled
}

/**
 * `2019`, `2019-03` or `2019-03-14` — the leading date of whatever was written.
 *
 * Kept at the file's own precision rather than widened to a full timestamp: a
 * publisher who said "2019" did not say January, and inventing the month and
 * the day would make the record say something the book never claimed.
 */
function datePartOf(value: string | null | undefined): string | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec((value ?? '').trim())
  if (!match) return undefined

  const [, year, month, day] = match
  if (month === undefined) return year
  if (Number(month) < 1 || Number(month) > 12) return year
  if (day === undefined) return `${year}-${month}`
  if (Number(day) < 1 || Number(day) > 31) return `${year}-${month}`
  return `${year}-${month}-${day}`
}

/** How much blurb is worth keeping. Long enough for a jacket, short of an essay. */
const MAX_DESCRIPTION = 2000

/**
 * The blurb as plain text.
 *
 * `dc:description` is specified as text but is very often escaped HTML — a
 * publisher pasting their marketing copy in, `<p>` tags and all. Those are
 * stripped rather than rendered: this string goes on the detail page as a
 * sentence or two, and it arrived from a file, so treating it as markup would
 * be both wrong-looking and the one place in the app where a book's own bytes
 * could reach the DOM as elements.
 */
function readDescription(metadata: Document | Element): string | undefined {
  const raw = textOf(firstByLocalName(metadata, 'description'))
  if (!raw) return undefined

  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined

  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION).trimEnd()}…` : text
}

/** Enough for a BISAC set and a few strays; past this it is a keyword dump. */
const MAX_SUBJECTS = 16

/** Every `dc:subject`, in file order, without the duplicates that casing hides. */
function readSubjects(metadata: Document | Element): string[] | undefined {
  const seen = new Set<string>()
  const subjects: string[] = []

  for (const element of byLocalName(metadata, 'subject')) {
    const text = textOf(element)
    if (!text) continue

    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    subjects.push(text)
    if (subjects.length === MAX_SUBJECTS) break
  }

  return subjects.length > 0 ? subjects : undefined
}

/** The fields the file actually supplied, with the empty ones left out entirely. */
function defined(source: FileMetadata): FileMetadata {
  const found: Record<string, unknown> = {}
  for (const key of ['isbn', 'publisher', 'published', 'language', 'description', 'subjects'] as const) {
    const value = source[key]
    if (value !== undefined) found[key] = value
  }
  return found as FileMetadata
}

function readFileMetadata(metadata: Document | Element): FileMetadata {
  return {
    isbn: readIsbn(metadata),
    publisher: textOf(firstByLocalName(metadata, 'publisher')),
    published: readPublished(metadata),
    language: textOf(firstByLocalName(metadata, 'language'))?.toLowerCase(),
    description: readDescription(metadata),
    subjects: readSubjects(metadata),
  }
}

// --- The package file --------------------------------------------------------

interface Spine extends FileMetadata {
  /** Archive paths of the content documents, in reading order. */
  documents: string[]
  title?: string
  author?: string
  /** The cover image's archive path, when the package names one. */
  coverPath?: string
}

/** `META-INF/container.xml` → the path of the `.opf` package file. */
function findPackagePath(archive: Archive): string {
  const container = readText(archive, 'META-INF/container.xml')
  if (!container) throw new EpubError('Not an epub: META-INF/container.xml is missing')

  const rootfile = firstByLocalName(parseXml(container, 'container.xml'), 'rootfile')
  const path = rootfile?.getAttribute('full-path')
  if (!path) throw new EpubError('Malformed epub: container.xml names no package file')

  return safeDecode(path)
}

function readSpine(archive: Archive, packagePath: string): Spine {
  const source = readText(archive, packagePath)
  if (!source) throw new EpubError(`Malformed epub: package file ${packagePath} is missing`)

  const doc = parseXml(source, 'the package file')

  // id → resolved archive path, for every file the book declares.
  const hrefById = new Map<string, string>()
  const typeById = new Map<string, string>()
  for (const item of byLocalName(doc, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    hrefById.set(id, resolvePath(packagePath, href))
    typeById.set(id, item.getAttribute('media-type') ?? '')
  }

  const documents: string[] = []
  /**
   * The very first document the spine lists, `linear="no"` and all — which is
   * almost always the cover page. Kept for `findCoverPath`'s last resort: a book
   * that names no cover in its metadata usually still *has* one, sitting as the
   * only picture on that page.
   */
  let firstDocument: string | undefined
  for (const itemref of byLocalName(doc, 'itemref')) {
    const idref = itemref.getAttribute('idref')
    if (!idref) continue

    const path = hrefById.get(idref)
    if (!path) continue

    const type = typeById.get(idref) ?? ''
    if (type && !type.includes('html')) continue

    if (firstDocument === undefined) firstDocument = path

    // `linear="no"` marks incidental content (ads, colophons) that readers are
    // free to skip. Skipping it keeps cover pages out of chapter one.
    if (itemref.getAttribute('linear') === 'no') continue

    documents.push(path)
  }

  if (documents.length === 0) {
    throw new EpubError('Malformed epub: the spine lists no readable documents')
  }

  const metadata = firstByLocalName(doc, 'metadata') ?? doc
  const author = firstByLocalName(metadata, 'creator')?.textContent?.trim() || undefined
  return {
    ...readFileMetadata(metadata),
    documents,
    title: cleanTitle(firstByLocalName(metadata, 'title')?.textContent, author),
    author,
    coverPath: findCoverPath(
      archive,
      doc,
      metadata,
      packagePath,
      hrefById,
      typeById,
      coverPageOf(documents, firstDocument),
    ),
  }
}

/**
 * The spine's first document, but only when it can be a *cover page* rather
 * than the book itself.
 *
 * A cover page is always a document of its own — separate from chapter one,
 * whether it is skipped as `linear="no"` or read as the first page. So the one
 * case where "the first document" cannot mean "the cover" is a book that is a
 * single readable document *and* that document is the first thing in the spine:
 * there is no separate page for a cover to be on, and the picture on it is a
 * figure in the text.
 */
function coverPageOf(documents: readonly string[], firstDocument: string | undefined): string | undefined {
  if (documents.length === 1 && firstDocument === documents[0]) return undefined
  return firstDocument
}

/**
 * The cover image's archive path, if the book has one we can find.
 *
 * Four ways of asking, in descending order of how much the book is actually
 * *telling* us versus how much we are inferring — the first match wins.
 *
 * 1. EPUB 3 marks the manifest item itself: `properties="cover-image"`.
 * 2. EPUB 2 says so indirectly: `<meta name="cover" content="ID">` points at a
 *    manifest item id.
 * 3. A manifest image whose id or filename is literally "cover". Not
 *    standardised at all, but overwhelmingly the convention — and the two rules
 *    above are the ones conversion tools most often drop on the way through.
 * 4. The only picture on the spine's first document. A book's first page is its
 *    cover page in essentially every epub ever built, and if that page shows
 *    exactly one image, that image is the cover.
 *
 * Rules 3 and 4 exist because rules 1 and 2 miss quietly: the book imports
 * fine, reads fine, and simply shows a coloured placeholder on the shelf
 * forever, with nothing anywhere to say why.
 */
function findCoverPath(
  archive: Archive,
  doc: Document,
  metadata: Document | Element,
  packagePath: string,
  hrefById: Map<string, string>,
  typeById: Map<string, string>,
  firstDocument: string | undefined,
): string | undefined {
  for (const item of byLocalName(doc, 'item')) {
    const properties = item.getAttribute('properties') ?? ''
    if (properties.split(/\s+/).includes('cover-image')) {
      const href = item.getAttribute('href')
      if (href) return resolvePath(packagePath, href)
    }
  }

  for (const meta of byLocalName(metadata, 'meta')) {
    if (meta.getAttribute('name') !== 'cover') continue
    const id = meta.getAttribute('content')
    if (!id) continue
    const type = typeById.get(id) ?? ''
    if (type && !type.startsWith('image/')) continue
    const href = hrefById.get(id)
    if (href) return href
  }

  for (const [id, path] of hrefById) {
    const type = typeById.get(id) ?? ''
    const isImage = type ? type.startsWith('image/') : mediaTypeOf(path) !== undefined
    if (!isImage) continue

    const filename = path.slice(path.lastIndexOf('/') + 1)
    if (/cover/i.test(id) || /cover/i.test(filename)) return path
  }

  return coverFromFirstPage(archive, firstDocument)
}

/**
 * The lone picture on the book's first page, if that is what the first page is.
 *
 * Deliberately strict, in two ways, because the cost of guessing wrong is a
 * publisher's colophon sitting on the shelf where the cover belongs:
 *
 * - **One image, or none of them.** A page carrying several is a title page
 *   with a logo and an ornament, and there is no way to say which is the cover.
 * - **Almost no words.** A cover page is a picture; a page with prose on it is
 *   a page of the book that happens to have a picture on it.
 */
const COVER_PAGE_MAX_WORDS = 12

function coverFromFirstPage(archive: Archive, firstDocument: string | undefined): string | undefined {
  if (!firstDocument) return undefined

  const source = readText(archive, firstDocument)
  if (!source) return undefined

  let page: Document
  try {
    page = parseXml(source, 'the first page')
  } catch {
    return undefined
  }

  const words = (page.documentElement?.textContent ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length > COVER_PAGE_MAX_WORDS) return undefined

  // `<img src>` and SVG's `<image xlink:href>` — an epub cover page is very
  // often the second, wrapped in an SVG viewBox so it scales to the screen.
  const sources = [
    ...byLocalName(page, 'img').map((node) => node.getAttribute('src')),
    ...byLocalName(page, 'image').map(
      (node) => node.getAttribute('href') ?? node.getAttribute('xlink:href'),
    ),
  ].filter((href): href is string => !!href)

  const paths = new Set(sources.map((href) => resolvePath(firstDocument, href)))
  if (paths.size !== 1) return undefined

  const [path] = [...paths]
  if (!path || !mediaTypeOf(path)) return undefined
  // Through `readFile` rather than a direct lookup: an href is URL-encoded and
  // may differ in case from the stored ZIP entry, and `readCoverAsset` will read
  // it the same lenient way.
  return readFile(archive, path) ? path : undefined
}

// --- Table of contents (titles only) -----------------------------------------

/**
 * Map archive path → title, from either the EPUB 3 nav document or the EPUB 2
 * `.ncx`. Used only as a fallback: many books put chapter titles in the ToC and
 * in an image on the page, leaving no heading in the markup at all. Without
 * this those books would parse as one untitled slab.
 */
function readTocTitles(archive: Archive, packagePath: string): Map<string, string> {
  const titles = new Map<string, string>()

  for (const name of Object.keys(archive)) {
    const lower = name.toLowerCase()
    const isNcx = lower.endsWith('.ncx')
    const isNav = lower.endsWith('nav.xhtml') || lower.endsWith('toc.xhtml')
    if (!isNcx && !isNav) continue

    const source = readText(archive, name)
    if (!source) continue

    let doc: Document
    try {
      doc = parseXml(source, name)
    } catch {
      continue // A broken ToC is not worth failing an otherwise readable book.
    }

    if (isNcx) {
      for (const point of byLocalName(doc, 'navPoint')) {
        const label = firstByLocalName(point, 'text')?.textContent?.trim()
        const src = firstByLocalName(point, 'content')?.getAttribute('src')
        if (label && src) titles.set(resolvePath(name, src), label)
      }
    } else {
      for (const anchor of byLocalName(doc, 'a')) {
        const label = anchor.textContent?.trim()
        const href = anchor.getAttribute('href')
        if (label && href) titles.set(resolvePath(name, href), label)
      }
    }
  }

  // Never let the package file itself be mistaken for a chapter.
  titles.delete(packagePath)
  return titles
}

// --- Pictures ----------------------------------------------------------------

/**
 * Extension → media type, for the handful of formats an epub's figures are
 * actually in. The archive doesn't record a type, and a `Blob` with none is
 * shown by the browser as a broken image rather than guessed at.
 *
 * SVG is deliberately here and deliberately last-resort: it is markup, so it
 * only ever reaches an `<img>` — never inlined into the page — which keeps any
 * script inside a downloaded file inert.
 */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

function mediaTypeOf(path: string): string | undefined {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return undefined
  return MEDIA_TYPES[path.slice(dot + 1).toLowerCase()]
}

/**
 * Pull the bytes of every picture the book's figures point at.
 *
 * Only the ones referenced, and each one only once: an epub's manifest lists
 * plenty a spine document never shows (covers already used elsewhere, unused
 * alternates), and a plate reproduced in two chapters is one file.
 *
 * Anything missing, or in a format we can't name a media type for, is skipped
 * silently — the figure then renders as it did before WP-39, caption only,
 * which is the right failure. A picture is never worth refusing the book over.
 */
function readImages(
  archive: Archive,
  blocks: readonly { image?: { src: string } }[],
): BookAsset[] {
  const wanted = new Set<string>()
  for (const block of blocks) {
    if (block.image) wanted.add(block.image.src)
  }

  const assets: BookAsset[] = []
  for (const path of wanted) {
    const type = mediaTypeOf(path)
    if (!type) continue

    const bytes = readFile(archive, path)
    if (!bytes) continue

    // Copied into a plain `ArrayBuffer`: fflate hands back a view whose buffer
    // TypeScript can't promise isn't shared, and `Blob` won't take one.
    assets.push({ path, data: new Blob([bytes.slice().buffer as ArrayBuffer], { type }) })
  }
  return assets
}

/**
 * The cover, read separately from `readImages`: it is stored under the fixed
 * `COVER_ASSET_PATH` key rather than its own archive path, so the shelf can
 * ask for "this book's cover" without knowing the book's internal layout —
 * and so it is still found even when the cover's own page is `linear="no"`
 * and therefore never reaches a figure block at all.
 */
function readCoverAsset(archive: Archive, coverPath: string | undefined): BookAsset | undefined {
  if (!coverPath) return undefined

  const type = mediaTypeOf(coverPath)
  if (!type) return undefined

  const bytes = readFile(archive, coverPath)
  if (!bytes) return undefined

  return { path: COVER_ASSET_PATH, data: new Blob([bytes.slice().buffer as ArrayBuffer], { type }) }
}

// --- Public API --------------------------------------------------------------

/**
 * Parse an epub into the shared structure.
 *
 * Async by shape rather than by need: unzipping is synchronous here (fflate's
 * async path spins up a worker, which is more machinery than a few megabytes of
 * text warrants), but pdf and docx genuinely are async, and the importer in
 * WP-11 should be able to `await` every format the same way.
 */
export async function parseEpub(data: ArrayBuffer | Uint8Array, meta: BookMeta): Promise<ParsedBook> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

  let archive: Archive
  try {
    archive = unzipSync(bytes)
  } catch {
    throw new EpubError('Not an epub: the file is not a readable ZIP archive')
  }

  const packagePath = findPackagePath(archive)
  const spine = readSpine(archive, packagePath)
  const tocTitles = readTocTitles(archive, packagePath)

  const perDocument = spine.documents.map((path) => {
    const source = readText(archive, path)
    // A spine entry pointing at a missing file is corruption, but the rest of
    // the book is still worth reading — skip it rather than refuse the import.
    const blocks = source ? htmlToBlocks(source) : []

    // Figure sources are relative to the chapter that referenced them. Resolve
    // them to archive paths here, while we still know which file that was — by
    // the time the blocks are concatenated, that context is gone.
    for (const block of blocks) {
      if (block.image) {
        block.image = { ...block.image, src: resolvePath(path, block.image.src) }
      }

      // Ids and link targets get the same treatment, and for the same reason:
      // both are written relative to the file they appear in, and that context
      // is gone the moment these blocks join the rest of the book. Two chapters
      // can each define `#note1` — without qualifying them, every footnote in
      // the book would resolve to whichever chapter was parsed first.
      if (block.ids) block.ids = block.ids.map((id) => `${path}#${id}`)
      if (block.links) {
        block.links = block.links.map((link) => ({
          ...link,
          href: absoluteHref(path, link.href),
        }))
      }
    }

    // The document itself is a link target: `href="chapter4.xhtml"`, with no
    // fragment, means "the start of that chapter" and is how an epub's own
    // contents page usually points at one.
    const first = blocks.find((block) => block.kind !== 'furniture')
    if (first) first.ids = [path, ...(first.ids ?? [])]

    return { path, blocks }
  })

  const hasHeadings = perDocument.some((doc) =>
    doc.blocks.some((block) => block.kind === 'heading'),
  )

  const blocks: Block[] = []
  for (const doc of perDocument) {
    if (doc.blocks.length === 0) continue

    // Only synthesise titles for books that supply no headings of their own —
    // injecting them alongside real headings would compete with the level
    // resolution and split chapters in two.
    const synthesised: Block[] = []
    if (!hasHeadings) {
      const title = tocTitles.get(doc.path)
      if (title) synthesised.push({ kind: 'heading', level: 1, text: title })
    }

    // The spine boundary, kept. Concatenating the documents is right — one
    // stream is what the assembler wants — but until now the *seam* went with
    // it, and a spine document is the publisher's own page division: the cover
    // is one file, the copyright page another, the dedication another. Dropping
    // the seam is why a cover plate ran straight into the title beneath it and
    // the dedication ran into the preface, on a book that reads as separate
    // pages in every other reader.
    //
    // Marked on the first block that will survive assembly — `furniture` is
    // dropped before anchors are assigned, so a flag left on a running header
    // would be a page break that silently disappears. Not on the opening
    // document: a break before the first thing in the book is a blank page one.
    const opening = [...synthesised, ...doc.blocks]
    if (blocks.length > 0) {
      const first = opening.find((block) => block.kind !== 'furniture')
      if (first) first.startsPage = true
    }

    blocks.push(...opening)
  }

  const book = assembleBook(blocks, {
    ...meta,
    // Only the keys the file actually filled. Spreading `FileMetadata` whole
    // would write `isbn: undefined` onto the book for every epub without one,
    // and "the key is there, holding nothing" is precisely what the storage
    // layer works to avoid — see the note on absent-not-null in `rows.ts`.
    ...defined(spine),
    source: 'epub',
    title: spine.title || meta.title || 'Untitled',
    author: meta.author ?? spine.author,
  })

  // Read from the *assembled* paragraphs, not from the block stream above:
  // assembly drops furniture, so a cover plate that never reaches a page is
  // never carried into storage either.
  const shown = book.sections.flatMap((section) => section.paragraphs)
  const cover = readCoverAsset(archive, spine.coverPath)
  const assets = cover ? [...readImages(archive, shown), cover] : readImages(archive, shown)
  return { ...book, assets }
}
