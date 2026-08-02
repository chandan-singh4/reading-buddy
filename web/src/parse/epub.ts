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

import type { ParsedBook } from '../storage/index.ts'
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
  return {
    documents,
    title: firstByLocalName(metadata, 'title')?.textContent?.trim() || undefined,
    author: firstByLocalName(metadata, 'creator')?.textContent?.trim() || undefined,
  }
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
    }
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

  return assembleBook(blocks, {
    ...meta,
    source: 'epub',
    title: meta.title || spine.title || 'Untitled',
    author: meta.author ?? spine.author,
  })
}
