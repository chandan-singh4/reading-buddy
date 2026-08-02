/**
 * The single public entry point for parsing. Import from `@/parse` — never from
 * the per-format modules directly, so they stay free to move as epub, txt, docx
 * and pdf land alongside markdown.
 *
 * The shape is the same for every format: a front end turns bytes into a
 * `Block` stream, and `assembleBook` turns that stream into a `ParsedBook`.
 */

export { assembleBook, prose } from './assemble.ts'
export type { Block, ContentBlock, HeadingBlock } from './assemble.ts'

export { DocxError, docxToHtml, parseDocx } from './docx.ts'
export { EpubError, parseEpub } from './epub.ts'
export { htmlToBlocks, parseHtml } from './html.ts'
export { markdownToBlocks, parseMarkdown } from './markdown.ts'
export { parseTxt, txtToBlocks } from './txt.ts'

export { PdfError, parsePdf, pdfToPages } from './pdf.ts'
export { pdfPagesToBlocks } from './pdf-layout.ts'
export type { PdfPage, PdfTextItem } from './pdf-layout.ts'
