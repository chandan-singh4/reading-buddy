// @vitest-environment jsdom
// Needs a DOM: the docx HTML goes through the same DOMParser front end.

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { isAnchor } from '../structure/index.ts'
import { DocxError, parseDocx } from './docx.ts'

function meta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1' as BookId,
    title: 'Test Book',
    source: 'docx',
    type: 'dense-technical',
    importedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

/** Word declares style names separately from the ids paragraphs reference. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
</w:styles>`

/** A paragraph, optionally carrying a named Word style. */
function para(text: string, style?: string): string {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function makeDocx(body: string): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}</w:body></w:document>`

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(STYLES),
  })
}

describe('parseDocx', () => {
  const docx = makeDocx(
    [
      para('Chapter One', 'Heading1'),
      para('Opening prose.'),
      para('First Section', 'Heading2'),
      para('Section prose.'),
      para('Chapter Two', 'Heading1'),
      para('Final prose.'),
    ].join(''),
  )

  it('maps Word heading styles to chapters and sections', async () => {
    const book = await parseDocx(docx, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two'])
    expect(book.chapters[0].sections.map((s) => s.title)).toEqual([undefined, 'First Section'])
  })

  it('keeps the prose in document order', async () => {
    const book = await parseDocx(docx, meta())
    expect(book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))).toEqual([
      'Opening prose.',
      'Section prose.',
      'Final prose.',
    ])
  })

  it('records the source format', async () => {
    const book = await parseDocx(docx, meta({ source: 'md' }))
    expect(book.meta.source).toBe('docx')
  })

  it('produces canonical, unique, stable anchors', async () => {
    const first = await parseDocx(docx, meta())
    const second = await parseDocx(docx, meta())
    const anchors = first.sections.flatMap((s) => s.paragraphs.map((p) => p.anchor))

    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every((a) => isAnchor(a))).toBe(true)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(second.sections).toEqual(first.sections)
  })

  it('promotes the Title style, which Word gives no HTML equivalent', async () => {
    const titled = makeDocx(
      [para('The Book Title', 'Title'), para('Prose.'), para('Chapter One', 'Heading1'), para('More.')].join(''),
    )
    const book = await parseDocx(titled, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['The Book Title', 'Chapter One'])
  })

  it('falls back to bucketing for a document with no styled headings', async () => {
    const flat = makeDocx(
      Array.from({ length: 25 }, (_, i) => para(`Paragraph ${i + 1}.`)).join(''),
    )
    const book = await parseDocx(flat, meta())
    expect(book.chapters).toHaveLength(1)
    expect(book.sections[0].paragraphs).toHaveLength(20)
    expect(book.sections[1].paragraphs).toHaveLength(5)
  })

  it('rejects a file that is not a Word document', async () => {
    await expect(parseDocx(strToU8('not a docx at all'), meta())).rejects.toThrow(DocxError)
  })
})
