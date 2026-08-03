// @vitest-environment jsdom
// Needs a DOM for DOMParser, same as html.test.ts.

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { isAnchor } from '../structure/index.ts'
import { COVER_ASSET_PATH } from '../storage/index.ts'
import { EpubError, parseEpub } from './epub.ts'

function meta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1' as BookId,
    title: 'Test Book',
    source: 'epub',
    type: 'dense-technical',
    importedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

interface EpubSpec {
  manifest: string
  spine: string
  metadata?: string
  files?: Record<string, string>
  /** Files that aren't text — pictures, for the WP-39 tests. */
  binary?: Record<string, Uint8Array>
}

/** Build a minimal but structurally real epub in memory. */
function makeEpub(spec: EpubSpec): Uint8Array {
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${spec.metadata ?? '<dc:title>Package Title</dc:title><dc:creator>A. Writer</dc:creator>'}
  </metadata>
  <manifest>${spec.manifest}</manifest>
  <spine>${spec.spine}</spine>
</package>`

  const entries: Record<string, Uint8Array> = {
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(opf),
  }
  for (const [path, body] of Object.entries(spec.files ?? {})) {
    entries[path] = strToU8(body)
  }
  for (const [path, bytes] of Object.entries(spec.binary ?? {})) {
    entries[path] = bytes
  }
  return zipSync(entries)
}

function chapterDoc(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${body}</body></html>`
}

describe('parseEpub — a normal book', () => {
  const epub = makeEpub({
    manifest: [
      '<item id="c1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="c2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>',
    ].join(''),
    spine: '<itemref idref="c1"/><itemref idref="c2"/>',
    files: {
      'OEBPS/Text/ch1.xhtml': chapterDoc(
        '<h1>Chapter One</h1><p>Opening prose.</p><h2>A Section</h2><p>Section prose.</p>',
      ),
      'OEBPS/Text/ch2.xhtml': chapterDoc('<h1>Chapter Two</h1><p>Final prose.</p>'),
    },
  })

  it('resolves chapters and sections across separate spine documents', async () => {
    const book = await parseEpub(epub, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two'])
    expect(book.chapters[0].sections.map((s) => s.title)).toEqual([undefined, 'A Section'])
  })

  it('resolves hrefs relative to the package file directory', async () => {
    const book = await parseEpub(epub, meta())
    const text = book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))
    expect(text).toEqual(['Opening prose.', 'Section prose.', 'Final prose.'])
  })

  it('produces canonical, unique, stable anchors', async () => {
    const first = await parseEpub(epub, meta())
    const second = await parseEpub(epub, meta())
    const anchors = first.sections.flatMap((s) => s.paragraphs.map((p) => p.anchor))

    expect(anchors.every((a) => isAnchor(a))).toBe(true)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(second.sections).toEqual(first.sections)
  })

  it('takes title and author from the package file when none were supplied', async () => {
    const book = await parseEpub(epub, meta({ title: '' }))
    expect(book.meta.title).toBe('Package Title')
    expect(book.meta.author).toBe('A. Writer')
  })

  it('prefers the package title even when the caller supplied a guess', async () => {
    // `meta.title` here stands in for a filename-derived guess, which is
    // never something a reader chose — the book's own metadata is the more
    // trustworthy source whenever it has one.
    const book = await parseEpub(epub, meta({ title: 'ugly-filename-guess' }))
    expect(book.meta.title).toBe('Package Title')
  })

  it('falls back to the caller-supplied title only when the package has none', async () => {
    const untitled = makeEpub({
      manifest: '<item id="c1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      metadata: '<dc:creator>A. Writer</dc:creator>',
      files: { 'OEBPS/Text/ch1.xhtml': chapterDoc('<h1>Chapter One</h1><p>Opening prose.</p>') },
    })
    const book = await parseEpub(untitled, meta({ title: 'My Fallback Title' }))
    expect(book.meta.title).toBe('My Fallback Title')
  })

  it('strips a stray hash a conversion tool left inside the package title', async () => {
    const hashed = makeEpub({
      manifest: '<item id="c1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      metadata:
        '<dc:title>The Fundamental Wisdom 60cda61f8cf1d1443efe944bb205a3a2 Annotated</dc:title>',
      files: { 'OEBPS/Text/ch1.xhtml': chapterDoc('<h1>Chapter One</h1><p>Opening prose.</p>') },
    })
    const book = await parseEpub(hashed, meta())
    expect(book.meta.title).toBe('The Fundamental Wisdom Annotated')
  })

  it('cuts a title polluted with a citation dump — author, publisher, ISBN, hash, source credit', async () => {
    const polluted = makeEpub({
      manifest: '<item id="c1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      metadata: [
        '<dc:title>The Quantum and the Lotus A Journey to the Frontiers Where',
        'Ricard, Matthieu;Trinh, Xuan Thuan Place of publication not identified, 2009',
        '9780307566126 6402e7348bc497afb643fc7dd1a75c5b Anna’s Archive</dc:title>',
        '<dc:creator>Matthieu Ricard</dc:creator>',
      ].join(' '),
      files: { 'OEBPS/Text/ch1.xhtml': chapterDoc('<h1>Chapter One</h1><p>Opening prose.</p>') },
    })
    const book = await parseEpub(polluted, meta())
    expect(book.meta.title).toBe('The Quantum and the Lotus A Journey to the Frontiers Where')
    expect(book.meta.author).toBe('Matthieu Ricard')
  })
})

describe('parseEpub — spine handling', () => {
  it('follows spine order, not archive or filename order', async () => {
    const epub = makeEpub({
      manifest: [
        '<item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="z" href="z.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="z"/><itemref idref="a"/>',
      files: {
        'OEBPS/a.xhtml': chapterDoc('<h1>Alphabetically First</h1><p>A.</p>'),
        'OEBPS/z.xhtml': chapterDoc('<h1>Read First</h1><p>Z.</p>'),
      },
    })

    const book = await parseEpub(epub, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['Read First', 'Alphabetically First'])
  })

  it('skips non-linear items such as cover pages', async () => {
    const epub = makeEpub({
      manifest: [
        '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="cover" linear="no"/><itemref idref="c1"/>',
      files: {
        'OEBPS/cover.xhtml': chapterDoc('<p>Cover image caption.</p>'),
        'OEBPS/ch1.xhtml': chapterDoc('<h1>Chapter One</h1><p>Real prose.</p>'),
      },
    })

    const book = await parseEpub(epub, meta())
    expect(book.chapters).toHaveLength(1)
    expect(book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))).toEqual(['Real prose.'])
  })

  it('skips non-document manifest items', async () => {
    const epub = makeEpub({
      manifest: [
        '<item id="css" href="style.css" media-type="text/css"/>',
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="css"/><itemref idref="c1"/>',
      files: {
        'OEBPS/style.css': 'p { color: red }',
        'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>'),
      },
    })

    const book = await parseEpub(epub, meta())
    expect(book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))).toEqual(['Prose.'])
  })

  it('reads a chapter whose href is URL-encoded', async () => {
    const epub = makeEpub({
      manifest: '<item id="c1" href="Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/Text/chapter 1.xhtml': chapterDoc('<h1>One</h1><p>Encoded.</p>') },
    })

    const book = await parseEpub(epub, meta())
    expect(book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))).toEqual(['Encoded.'])
  })

  it('survives a spine entry pointing at a missing file', async () => {
    const epub = makeEpub({
      manifest: [
        '<item id="gone" href="missing.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="gone"/><itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Still here.</p>') },
    })

    const book = await parseEpub(epub, meta())
    expect(book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))).toEqual(['Still here.'])
  })
})

describe('parseEpub — books with no headings in the markup', () => {
  it('titles chapters from an ncx table of contents', async () => {
    const ncx = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
  <navPoint id="n1"><navLabel><text>The Beginning</text></navLabel><content src="ch1.xhtml"/></navPoint>
  <navPoint id="n2"><navLabel><text>The End</text></navLabel><content src="ch2.xhtml"/></navPoint>
</navMap></ncx>`

    const epub = makeEpub({
      manifest: [
        '<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="c1"/><itemref idref="c2"/>',
      files: {
        'OEBPS/toc.ncx': ncx,
        'OEBPS/ch1.xhtml': chapterDoc('<p>Once upon a time.</p>'),
        'OEBPS/ch2.xhtml': chapterDoc('<p>Happily ever after.</p>'),
      },
    })

    const book = await parseEpub(epub, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['The Beginning', 'The End'])
  })

  it('falls back to bucketing when there is no ToC either', async () => {
    const epub = makeEpub({
      manifest: '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<p>One.</p><p>Two.</p>') },
    })

    const book = await parseEpub(epub, meta())
    expect(book.chapters).toHaveLength(1)
    expect(book.sections[0].paragraphs).toHaveLength(2)
  })
})

describe('parseEpub — malformed input', () => {
  it('rejects a file that is not a ZIP', async () => {
    await expect(parseEpub(strToU8('just some text'), meta())).rejects.toThrow(EpubError)
  })

  it('rejects an archive with no container.xml', async () => {
    const notAnEpub = zipSync({ 'readme.txt': strToU8('hello') })
    await expect(parseEpub(notAnEpub, meta())).rejects.toThrow(/container\.xml/)
  })

  it('rejects a spine with no readable documents', async () => {
    const epub = makeEpub({ manifest: '', spine: '' })
    await expect(parseEpub(epub, meta())).rejects.toThrow(/no readable documents/)
  })
})

describe('parseEpub — pictures', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

  function bookWithFigures(body: string, binary: Record<string, Uint8Array>) {
    return makeEpub({
      manifest:
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="i1" href="images/fig1.png" media-type="image/png"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc(body) },
      binary,
    })
  }

  it('carries the bytes of a picture a figure points at', async () => {
    const epub = bookWithFigures(
      '<h1>One</h1><figure><img src="images/fig1.png" alt="A mandala"/>' +
        '<figcaption>Figure 1.</figcaption></figure>',
      { 'OEBPS/images/fig1.png': PNG },
    )

    const book = await parseEpub(epub, meta())
    const assets = book.assets ?? []

    // Keyed by the same resolved archive path the figure carries, so the
    // reading screen needs nothing resolved at read time.
    expect(assets.map((asset) => asset.path)).toEqual(['OEBPS/images/fig1.png'])
    expect(assets[0].data.type).toBe('image/png')
    expect(assets[0].data.size).toBe(PNG.length)

    const figure = book.sections
      .flatMap((section) => section.paragraphs)
      .find((paragraph) => paragraph.image)
    expect(figure?.image?.src).toBe('OEBPS/images/fig1.png')
  })

  it('carries a picture once however often the book shows it', async () => {
    const twice =
      '<h1>One</h1>' +
      '<figure><img src="images/fig1.png"/><figcaption>Figure 1.</figcaption></figure>' +
      '<figure><img src="images/fig1.png"/><figcaption>Figure 1, again.</figcaption></figure>'
    const book = await parseEpub(bookWithFigures(twice, { 'OEBPS/images/fig1.png': PNG }), meta())

    expect(book.assets).toHaveLength(1)
  })

  it('leaves a figure whose file is missing as a caption rather than failing', async () => {
    // A real hazard: epubs routinely reference images they don't contain. The
    // book is still worth reading.
    const book = await parseEpub(
      bookWithFigures(
        '<h1>One</h1><figure><img src="images/gone.png"/><figcaption>Figure 1.</figcaption></figure>',
        {},
      ),
      meta(),
    )

    expect(book.assets).toEqual([])
    expect(book.sections.flatMap((s) => s.paragraphs).some((p) => p.text.includes('Figure 1.'))).toBe(
      true,
    )
  })
})

describe('parseEpub — cover image', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])

  it('finds an EPUB 3 cover via the manifest item’s properties', async () => {
    const epub = makeEpub({
      manifest:
        '<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>' +
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>') },
      binary: { 'OEBPS/images/cover.jpg': JPEG },
    })

    const book = await parseEpub(epub, meta())
    const cover = (book.assets ?? []).find((asset) => asset.path === COVER_ASSET_PATH)

    expect(cover?.data.type).toBe('image/jpeg')
    expect(cover?.data.size).toBe(JPEG.length)
  })

  it('finds an EPUB 2 cover via the <meta name="cover"> indirection', async () => {
    const epub = makeEpub({
      manifest:
        '<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg"/>' +
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      metadata:
        '<dc:title>Package Title</dc:title><meta name="cover" content="cover-img"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>') },
      binary: { 'OEBPS/images/cover.jpg': JPEG },
    })

    const book = await parseEpub(epub, meta())
    const cover = (book.assets ?? []).find((asset) => asset.path === COVER_ASSET_PATH)

    expect(cover?.data.size).toBe(JPEG.length)
  })

  it('has no cover asset when the package names none', async () => {
    const epub = makeEpub({
      manifest: '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>') },
    })

    const book = await parseEpub(epub, meta())
    expect((book.assets ?? []).some((asset) => asset.path === COVER_ASSET_PATH)).toBe(false)
  })
})
