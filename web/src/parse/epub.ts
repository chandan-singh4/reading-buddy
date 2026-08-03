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

// --- The package file --------------------------------------------------------

interface Spine {
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
  for (const itemref of byLocalName(doc, 'itemref')) {
    const idref = itemref.getAttribute('idref')
    if (!idref) continue

    // `linear="no"` marks incidental content (ads, colophons) that readers are
    // free to skip. Skipping it keeps cover pages out of chapter one.
    if (itemref.getAttribute('linear') === 'no') continue

    const path = hrefById.get(idref)
    if (!path) continue

    const type = typeById.get(idref) ?? ''
    if (type && !type.includes('html')) continue

    documents.push(path)
  }

  if (documents.length === 0) {
    throw new EpubError('Malformed epub: the spine lists no readable documents')
  }

  const metadata = firstByLocalName(doc, 'metadata') ?? doc
  const author = firstByLocalName(metadata, 'creator')?.textContent?.trim() || undefined
  return {
    documents,
    title: cleanTitle(firstByLocalName(metadata, 'title')?.textContent, author),
    author,
    coverPath: findCoverPath(doc, metadata, packagePath, hrefById, typeById),
  }
}

/**
 * Some epubs — especially ones that passed through a download/conversion
 * pipeline such as Anna's Archive — carry a `<dc:title>` that isn't a title at
 * all: the real title run straight into the author, the publisher, an ISBN, a
 * content hash and a trailing "Anna's Archive" credit, with no punctuation
 * marking where one field ends and the next begins (`The Book Author,
 * Firstname Place of publication not identified, 2009 9780307566126
 * 60cda61f8cf1d1443efe944bb205a3a2 Anna's Archive`). None of that was ever
 * something a reader chose to see, so once any of it is spotted, the title is
 * cut right there — everything from the earliest match onward is dropped.
 *
 * This is a best effort, not a guarantee: a subtitle mashed into the same
 * run-on string with no marker of its own (no author, no ISBN, nothing this
 * function recognises) can't be told apart from the real title
 * algorithmically. The book's own detail page offers a manual rename for
 * exactly that gap.
 */
function cleanTitle(raw: string | null | undefined, author: string | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined

  // A stray hash is removed in place, not treated as a cut point: what comes
  // after it can be real title text (an edition marker like "Annotated"), and
  // a hash alone doesn't mean everything past it is a citation dump.
  const dehashed = trimmed
    .replace(/\b[0-9a-f]{16,40}\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // These markers are different: once one is spotted, everything from there
  // to the end really is a citation dump — an ISBN, a publisher credit, an
  // author's name never lead back into more title — so it's cut wholesale.
  const markers: RegExp[] = [
    /\b\d{9,13}\b/g, // an ISBN
    /anna['’]s archive/gi,
    /place of publication not identified/gi,
    ...authorMarkers(author),
  ]

  let cut = dehashed.length
  for (const marker of markers) {
    marker.lastIndex = 0
    const match = marker.exec(dehashed)
    if (match && match.index < cut) cut = match.index
  }

  const stripped = dehashed.slice(0, cut).replace(/[\s,;:.\-–—]+$/, '').trim()
  return stripped || undefined
}

/**
 * A known author's name, turned into patterns that catch it reappearing
 * citation-style inside a polluted title (`Ricard, Matthieu` for an author of
 * `Matthieu Ricard`) — the "Lastname, Firstname" shape these pipelines write
 * names in, wherever it shows up in the string.
 */
function authorMarkers(author: string | undefined): RegExp[] {
  if (!author) return []
  const names = author
    .split(/[,;]/)
    .flatMap((part) => part.trim().split(/\s+/))
    .filter((name) => name.length > 1)
  return names.map((name) => new RegExp(`\\b${escapeRegExp(name)}\\s*,`, 'gi'))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The cover image's archive path, if the package names one.
 *
 * Two ways an epub says "this is the cover", and both are still common: EPUB
 * 3 marks the manifest item itself (`properties="cover-image"`); EPUB 2 says
 * so indirectly, with a `<meta name="cover" content="ID">` pointing at a
 * manifest item id. Tried in that order; whichever resolves to an actual
 * image item wins.
 */
function findCoverPath(
  doc: Document,
  metadata: Document | Element,
  packagePath: string,
  hrefById: Map<string, string>,
  typeById: Map<string, string>,
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

  return undefined
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
    if (!hasHeadings) {
      const title = tocTitles.get(doc.path)
      if (title) blocks.push({ kind: 'heading', level: 1, text: title })
    }
    blocks.push(...doc.blocks)
  }

  const book = assembleBook(blocks, {
    ...meta,
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
