/**
 * PDF → `ParsedBook`.
 *
 * This file is deliberately thin. All it does is get glyph positions out of
 * pdf.js and hand them to `pdf-layout.ts`, where the actual reconstruction
 * happens. Splitting it that way keeps the heuristics testable without a binary
 * fixture, and keeps pdf.js — much the largest dependency in the project —
 * behind a single dynamic import.
 *
 * That laziness is the point on a mobile-first app: pdf.js and its worker are
 * over a megabyte, and a reader who only ever opens epubs should never download
 * a byte of it.
 */

import type { BookAsset, ParsedBook } from '../storage/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { assembleBook } from './assemble.ts'
import {
  pdfPagesToBlocks,
  type PdfFigure,
  type PdfOutlineEntry,
  type PdfPage,
  type PdfTextItem,
} from './pdf-layout.ts'
import { bandPath, bandsOf } from './pdfFigures.ts'
import { renderBands } from './pdfRender.ts'

export class PdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfError'
  }
}

/** The subset of pdf.js's `TextItem` we depend on. */
interface TextItemLike {
  str?: string
  width?: number
  height?: number
  /** `[a, b, c, d, e, f]` — `e` and `f` are the x and y we want. */
  transform?: number[]
}

/**
 * pdf.js reports each fragment's position inside a 6-value transform matrix.
 * Only the translation components carry the coordinates; the rest is scale and
 * skew, which we don't need. Fragments with no geometry are dropped rather than
 * placed at the origin, where they would corrupt line grouping.
 */
function toTextItem(item: TextItemLike): PdfTextItem | null {
  const transform = item.transform
  if (!transform || transform.length < 6) return null

  const str = item.str ?? ''
  if (!str) return null

  // Fall back to the matrix's vertical scale when height is absent or zero —
  // font size drives every threshold in the layout pass, so it can't be 0.
  const height = item.height && item.height > 0 ? item.height : Math.abs(transform[3]) || 10

  return {
    str,
    x: transform[4],
    y: transform[5],
    width: item.width ?? 0,
    height,
  }
}

/** Everything one pass over a PDF produces: the text, and the pictures. */
export interface PdfRead {
  pages: PdfPage[]
  /** Where each picture sits, for the layout pass. */
  figures: PdfFigure[]
  /** The pictures themselves, for the assets table. */
  assets: BookAsset[]
  /** The file's own bookmark tree, flattened. Empty when it has none. */
  outline: PdfOutlineEntry[]
}

/** The shape of a pdf.js outline node, narrowed to what we read. */
interface OutlineNode {
  title?: string
  dest?: string | unknown[] | null
  items?: OutlineNode[]
}

/** What we need from the document to turn a destination into a page number. */
interface DestinationResolver {
  getOutline(): Promise<OutlineNode[] | null>
  getDestination(id: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
}

/**
 * Flatten the PDF's bookmark tree into entries with real page numbers.
 *
 * A destination is either an array whose first element is a page reference, or
 * the *name* of one, which has to be looked up. Either way the reference is
 * opaque and only the document can turn it into an index.
 *
 * Every lookup is guarded and a failure drops that one entry. A malformed
 * bookmark is common in the wild, and it must cost the reader one row of the
 * contents, never the import.
 */
export async function outlineOf(document: DestinationResolver): Promise<PdfOutlineEntry[]> {
  let tree: OutlineNode[] | null = null
  try {
    tree = await document.getOutline()
  } catch {
    return []
  }
  if (!tree || tree.length === 0) return []

  const entries: PdfOutlineEntry[] = []

  const walk = async (nodes: OutlineNode[], depth: number): Promise<void> => {
    for (const node of nodes) {
      const title = (node.title ?? '').replace(/\s+/g, ' ').trim()
      if (title) {
        try {
          const dest = typeof node.dest === 'string' ? await document.getDestination(node.dest) : node.dest
          const ref = Array.isArray(dest) ? dest[0] : null
          if (ref !== null && ref !== undefined) {
            entries.push({ title, page: (await document.getPageIndex(ref)) + 1, depth })
          }
        } catch {
          // One bad bookmark, one missing row. See the note above.
        }
      }
      if (node.items && node.items.length > 0) await walk(node.items, depth + 1)
    }
  }

  await walk(tree, 0)
  // Reading order, and a parent before its children where both land on one page.
  entries.sort((a, b) => a.page - b.page || a.depth - b.depth)
  return entries
}

/** Read every page's text geometry, and photograph its figures. */
export async function pdfToPages(data: ArrayBuffer | Uint8Array): Promise<PdfRead> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)

  const pdfjs = await import('pdfjs-dist')

  // In a browser the worker must be pointed at explicitly; under test there is
  // no Worker, and pdf.js falls back to running in-process on its own.
  if (typeof Worker !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }

  // The loading task, not the document, owns teardown in pdf.js 6 — holding on
  // to it is what lets the `finally` below release the worker.
  const task = pdfjs.getDocument({ data: bytes })

  let document: Awaited<typeof task.promise>
  try {
    document = await task.promise
  } catch (cause) {
    await task.destroy()
    throw new PdfError(
      `Could not read the PDF: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }

  try {
    const outline = await outlineOf(document as unknown as DestinationResolver)
    const pages: PdfPage[] = []
    const figures: PdfFigure[] = []
    const assets: BookAsset[] = []
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()

      const read: PdfPage = {
        width: viewport.width,
        height: viewport.height,
        items: (content.items as TextItemLike[])
          .map(toTextItem)
          .filter((item): item is PdfTextItem => item !== null),
      }
      pages.push(read)

      /*
       * The pictures are taken here, while this page is open.
       *
       * Not in a second pass. Opening every page twice doubles the slowest part
       * of importing a PDF, and the page object is the thing that can draw —
       * finding the bands afterwards would mean re-opening every page that had
       * one. Only pages with a band are drawn at all, so a book of plain prose
       * pays nothing for this beyond the arithmetic.
       */
      const bands = bandsOf(read, number)
      for (const [band, data] of await renderBands(page as never, bands, read.height)) {
        const path = bandPath(band)
        figures.push({ page: band.page, bottom: band.bottom, path })
        assets.push({ path, data })
      }

      // Without this, a few hundred pages of glyph data stay resident — enough
      // to end a large import on a phone.
      page.cleanup()
    }
    return { pages, figures, assets, outline }
  } finally {
    await task.destroy()
  }
}

/**
 * Parse a PDF into the shared structure.
 *
 * A PDF that is purely scanned images yields no text at all; that surfaces as a
 * book with no content rather than an error, because OCR is well outside what
 * this app takes on.
 */
export async function parsePdf(
  data: ArrayBuffer | Uint8Array,
  meta: BookMeta,
): Promise<ParsedBook> {
  const { pages, figures, assets, outline } = await pdfToPages(data)
  const book = assembleBook(pdfPagesToBlocks(pages, figures, outline), {
    ...meta,
    source: 'pdf',
  })
  return assets.length > 0 ? { ...book, assets } : book
}
