/**
 * DOCX → `ParsedBook`.
 *
 * A `.docx` is a ZIP of XML, and mammoth already knows how to read it. The
 * reason it's the right dependency here is narrow but decisive: Word documents
 * carry *semantic* styles, and mammoth maps them. A line styled "Heading 1"
 * becomes `<h1>` — not a `<p>` that merely happens to be 18pt and bold.
 *
 * That matters because our whole chaptering rule keys off heading level. Text
 * that only *looks* like a heading is invisible to us; text marked as one is
 * structure we can trust. So the pipeline is: mammoth → HTML → the shared
 * `html.ts` front end → the shared assembler.
 *
 * mammoth is loaded on demand. It is the largest thing in this folder by some
 * margin, and a reader who never opens a Word file should never pay to download
 * it — which on a phone is the difference that matters.
 */

import type { ParsedBook } from '../storage/index.ts'
import type { BookMeta } from '../structure/index.ts'
import { assembleBook } from './assemble.ts'
import { htmlToBlocks } from './html.ts'

export class DocxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxError'
  }
}

/**
 * Word's title styles have no HTML equivalent, so mammoth leaves them as plain
 * paragraphs by default. Promoting them keeps a document whose divisions are
 * marked "Title" / "Subtitle" from collapsing into one untitled slab.
 * `:fresh` stops consecutive titles being merged into a single element.
 */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
]

/** Convert a `.docx` to HTML. Exported so the conversion can be tested alone. */
export async function docxToHtml(data: ArrayBuffer | Uint8Array): Promise<string> {
  const arrayBuffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data

  const mammoth = await import('mammoth')
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: STYLE_MAP })
    return result.value
  } catch (cause) {
    throw new DocxError(
      `Could not read the Word document: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/** Parse a `.docx` into the shared structure. */
export async function parseDocx(
  data: ArrayBuffer | Uint8Array,
  meta: BookMeta,
): Promise<ParsedBook> {
  const html = await docxToHtml(data)
  return assembleBook(htmlToBlocks(html), { ...meta, source: 'docx' })
}
