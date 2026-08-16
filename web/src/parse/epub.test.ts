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
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
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
    // The run-together subtitle goes too, on the reader's own instruction: the
    // shelf should read as a column of titles. `parse/cleanTitle.ts` carries
    // the rule and the cases where it must not fire.
    expect(book.meta.title).toBe('The Quantum and the Lotus')
    expect(book.meta.author).toBe('Matthieu Ricard')
  })
})

/**
 * The front matter case, which is what this was reported as: a cover plate
 * running straight into the title page beneath it, and a dedication running into
 * the preface. Each of those is its own document in the file — the publisher's
 * own page division — and until the seam was kept they were concatenated into
 * one unbroken run of text.
 */
describe('parseEpub — the source book’s own page divisions', () => {
  const frontMatter = makeEpub({
    manifest: [
      '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="ded" href="dedication.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="pre" href="preface.xhtml" media-type="application/xhtml+xml"/>',
    ].join(''),
    spine: '<itemref idref="cover"/><itemref idref="ded"/><itemref idref="pre"/>',
    files: {
      'OEBPS/cover.xhtml': chapterDoc('<p><img src="cover.jpg" alt="Cover"/></p>'),
      'OEBPS/dedication.xhtml': chapterDoc('<p>I dedicate this work.</p>'),
      'OEBPS/preface.xhtml': chapterDoc('<p>This is a translation.</p>'),
    },
  })

  it('marks each spine document after the first as starting a page', async () => {
    const book = await parseEpub(frontMatter, meta())
    const blocks = book.sections.flatMap((s) => s.paragraphs)

    expect(blocks.map((p) => [p.text, p.startsPage === true])).toEqual([
      ['[Figure: Cover]', false],
      ['I dedicate this work.', true],
      ['This is a translation.', true],
    ])
  })

  it('never marks the opening block, which would be a blank page one', async () => {
    const book = await parseEpub(frontMatter, meta())
    expect(book.sections[0].paragraphs[0].startsPage).toBeUndefined()
  })

  it('leaves the flag off entirely inside a single document', async () => {
    const epub = makeEpub({
      manifest: '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: {
        'OEBPS/c1.xhtml': chapterDoc('<h1>One</h1><p>First.</p><p>Second.</p><p>Third.</p>'),
      },
    })

    const book = await parseEpub(epub, meta())
    const flagged = book.sections.flatMap((s) => s.paragraphs).filter((p) => p.startsPage)
    expect(flagged).toEqual([])
  })

  it('puts the break on the first block that survives assembly, not on furniture', async () => {
    // A running header is dropped before anchors are assigned, so a flag left on
    // one would be a page break that silently disappears.
    const epub = makeEpub({
      manifest: [
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="c1"/><itemref idref="c2"/>',
      files: {
        'OEBPS/c1.xhtml': chapterDoc('<h1>One</h1><p>First.</p>'),
        'OEBPS/c2.xhtml': chapterDoc(
          '<nav epub:type="toc"><ol><li>x</li></ol></nav><p>Second.</p>',
        ),
      },
    })

    const book = await parseEpub(epub, meta())
    const second = book.sections.flatMap((s) => s.paragraphs).find((p) => p.text === 'Second.')
    // The nav is gone by the time anchors are assigned; the break has to have
    // moved onto the prose behind it rather than gone with it.
    expect(second?.startsPage).toBe(true)
  })
})

/**
 * The footnote case across two files, which is the shape every real book uses:
 * a marker in the chapter, the note in a notes document.
 */
describe('parseEpub — footnote markers', () => {
  function bookWith(noteBody: string) {
    return makeEpub({
      manifest: [
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="nt" href="notes.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="c1"/><itemref idref="nt"/>',
      files: {
        'OEBPS/ch1.xhtml': chapterDoc(
          '<h1>One</h1><p>Nothing comes from nothing.<a href="notes.xhtml#fn1">[*]</a></p>',
        ),
        'OEBPS/notes.xhtml': chapterDoc(noteBody),
      },
    })
  }

  it('resolves a marker onto the note it points at', async () => {
    const book = await parseEpub(bookWith('<h1>Notes</h1><p id="fn1">The note itself.</p>'), meta())
    const blocks = book.sections.flatMap((s) => s.paragraphs)
    const marker = blocks.find((p) => p.text.includes('Nothing comes from nothing'))
    const note = blocks.find((p) => p.text === 'The note itself.')

    expect(marker?.links?.[0].anchor).toBe(note?.anchor)
  })

  it('falls back to the notes document when the note’s own id did not survive', async () => {
    // No `id="fn1"` anywhere — the commonest reason a marker goes dead. The
    // link used to be dropped, leaving text that looks tappable and isn’t.
    const book = await parseEpub(bookWith('<h1>Notes</h1><p>The note itself.</p>'), meta())
    const blocks = book.sections.flatMap((s) => s.paragraphs)
    const marker = blocks.find((p) => p.text.includes('Nothing comes from nothing'))

    expect(marker?.links).toHaveLength(1)
    expect(marker?.links?.[0].anchor).toBeDefined()
  })

  it('keeps the marker’s words whether or not the link survives', async () => {
    const book = await parseEpub(bookWith('<h1>Notes</h1><p>The note itself.</p>'), meta())
    const marker = book.sections
      .flatMap((s) => s.paragraphs)
      .find((p) => p.text.includes('Nothing comes from nothing'))
    expect(marker?.text).toBe('Nothing comes from nothing.[*]')
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

  it('titles a headless chapter even when other documents have headings', async () => {
    // The shape of a real book: chapter titles set as artwork, so the chapter
    // documents hold no heading, while the back matter carries ordinary ones.
    const ncx = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
  <navPoint id="n1"><navLabel><text>Chapter One</text></navLabel><content src="ch1.xhtml"/></navPoint>
  <navPoint id="n2"><navLabel><text>Chapter Two</text></navLabel><content src="ch2.xhtml"/></navPoint>
  <navPoint id="n3"><navLabel><text>Notes</text></navLabel><content src="notes.xhtml"/></navPoint>
</navMap></ncx>`

    const epub = makeEpub({
      manifest: [
        '<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="n" href="notes.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="c1"/><itemref idref="c2"/><itemref idref="n"/>',
      files: {
        'OEBPS/toc.ncx': ncx,
        'OEBPS/ch1.xhtml': chapterDoc('<p>Once upon a time.</p>'),
        'OEBPS/ch2.xhtml': chapterDoc('<p>Happily ever after.</p>'),
        'OEBPS/notes.xhtml': chapterDoc('<h1>NOTES</h1><p>See page one.</p>'),
      },
    })

    const book = await parseEpub(epub, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two', 'NOTES'])
  })

  it('leaves a document that has its own heading alone', async () => {
    const ncx = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
  <navPoint id="n1"><navLabel><text>Contents Entry</text></navLabel><content src="ch1.xhtml"/></navPoint>
</navMap></ncx>`

    const epub = makeEpub({
      manifest: [
        '<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      ].join(''),
      spine: '<itemref idref="c1"/>',
      files: {
        'OEBPS/toc.ncx': ncx,
        'OEBPS/ch1.xhtml': chapterDoc('<h1>The Real Title</h1><p>Body.</p>'),
      },
    })

    // One chapter, not two: the ToC title is not added beside the real heading.
    const book = await parseEpub(epub, meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['The Real Title'])
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

  // The two rules below are guesses rather than declarations, and they exist
  // because the two declarations above are the first thing a conversion tool
  // drops: the book imports fine and simply shows a coloured placeholder on the
  // shelf forever, with nothing anywhere to say why.

  it('falls back to a manifest image that is plainly called the cover', async () => {
    const epub = makeEpub({
      manifest:
        '<item id="img7" href="images/cover.jpeg" media-type="image/jpeg"/>' +
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>') },
      binary: { 'OEBPS/images/cover.jpeg': JPEG },
    })

    const book = await parseEpub(epub, meta())
    const cover = (book.assets ?? []).find((asset) => asset.path === COVER_ASSET_PATH)

    expect(cover?.data.size).toBe(JPEG.length)
  })

  it('falls back to the lone picture on the book’s own cover page', async () => {
    const epub = makeEpub({
      manifest:
        '<item id="p0" href="cover-page.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="img7" href="images/plate.jpeg" media-type="image/jpeg"/>' +
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      // `linear="no"`, as a cover page very often is — so it never reaches a
      // figure block and the picture is reachable no other way.
      spine: '<itemref idref="p0" linear="no"/><itemref idref="c1"/>',
      files: {
        // Wrapped in an SVG viewBox, which is how most cover pages scale a
        // plate to the screen.
        'OEBPS/cover-page.xhtml': chapterDoc(
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
            'viewBox="0 0 600 900">' +
            '<image width="600" height="900" xlink:href="images/plate.jpeg"/></svg>',
        ),
        'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>'),
      },
      binary: { 'OEBPS/images/plate.jpeg': JPEG },
    })

    const book = await parseEpub(epub, meta())
    const cover = (book.assets ?? []).find((asset) => asset.path === COVER_ASSET_PATH)

    expect(cover?.data.size).toBe(JPEG.length)
  })

  it('does not mistake a figure in the text for a cover', async () => {
    const epub = makeEpub({
      manifest:
        '<item id="img7" href="images/fig1.jpeg" media-type="image/jpeg"/>' +
        '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/><itemref idref="c2"/>',
      files: {
        // One picture, but a page of prose around it — a chapter, not a cover.
        'OEBPS/ch1.xhtml': chapterDoc(
          '<h1>One</h1><p>A good deal of opening prose, enough that no one could ' +
            'mistake this page for a picture of a book jacket.</p>' +
            '<figure><img src="images/fig1.jpeg"/><figcaption>Figure 1.</figcaption></figure>',
        ),
        'OEBPS/ch2.xhtml': chapterDoc('<h1>Two</h1><p>More prose.</p>'),
      },
      binary: { 'OEBPS/images/fig1.jpeg': JPEG },
    })

    const book = await parseEpub(epub, meta())
    expect((book.assets ?? []).some((asset) => asset.path === COVER_ASSET_PATH)).toBe(false)
  })
})

describe('parseEpub — the Dublin Core record', () => {
  /** A one-chapter book whose only interesting part is its metadata block. */
  async function withMetadata(metadata: string) {
    const epub = makeEpub({
      metadata: `<dc:title>A Book</dc:title><dc:creator>A. Writer</dc:creator>${metadata}`,
      manifest: '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>') },
    })
    return parseEpub(epub, meta())
  }

  it('reads a subtitle the file labels as one', async () => {
    const book = await withMetadata(
      '<dc:title id="sub">The New Science of a Lost Art</dc:title>' +
        '<meta refines="#sub" property="title-type">subtitle</meta>',
    )

    expect(book.meta.subtitle).toBe('The New Science of a Lost Art')
    // The main title is untouched — the subtitle is a second column, not a
    // replacement, and "A Book: The New Science…" is assembled at display time.
    expect(book.meta.title).toBe('A Book')
  })

  it('reads the EPUB 2 spelling of the same label', async () => {
    const book = await withMetadata('<dc:title opf:title-type="subtitle">A Lost Art</dc:title>')

    expect(book.meta.subtitle).toBe('A Lost Art')
  })

  // Guessing is how a book ends up subtitled "Copyright Page". A missing
  // subtitle is a gap the catalogue can fill; a wrong one is never corrected.
  it('never guesses a subtitle from an unlabelled second title', async () => {
    const book = await withMetadata('<dc:title>Copyright Page</dc:title>')

    expect('subtitle' in book.meta).toBe(false)
  })

  it('ignores a title labelled as something other than a subtitle', async () => {
    const book = await withMetadata(
      '<dc:title id="t">A BOOK</dc:title>' +
        '<meta refines="#t" property="title-type">collection</meta>',
    )

    expect('subtitle' in book.meta).toBe(false)
  })

  it('reads the publisher, the language and the date', async () => {
    const book = await withMetadata(
      '<dc:publisher>Penguin</dc:publisher>' +
        '<dc:language>en-GB</dc:language>' +
        '<dc:date>2019-03-14</dc:date>',
    )

    expect(book.meta.publisher).toBe('Penguin')
    expect(book.meta.language).toBe('en-gb')
    expect(book.meta.published).toBe('2019-03-14')
  })

  it('keeps a date at the precision the file gave it', async () => {
    // A publisher who said "2019" did not say January. Widening it would make
    // the record claim something the book never did.
    expect((await withMetadata('<dc:date>2019</dc:date>')).meta.published).toBe('2019')
    expect((await withMetadata('<dc:date>2019-03</dc:date>')).meta.published).toBe('2019-03')
  })

  it('prefers the date labelled as the publication', async () => {
    const book = await withMetadata(
      '<dc:date opf:event="modification">2024-01-01</dc:date>' +
        '<dc:date opf:event="publication">1954-07-29</dc:date>',
    )

    expect(book.meta.published).toBe('1954-07-29')
  })

  it('never mistakes a last-saved date for a publication date', async () => {
    // The EPUB 2 trap: a conversion tool's save date, on the shelf as
    // "published 2024", for a book from 1954.
    const book = await withMetadata('<dc:date opf:event="modification">2024-01-01</dc:date>')

    expect('published' in book.meta).toBe(false)
  })

  it('collects the publisher subject headings, in order and without repeats', async () => {
    const book = await withMetadata(
      '<dc:subject>Science / Life Sciences</dc:subject>' +
        '<dc:subject>Nature</dc:subject>' +
        '<dc:subject>nature</dc:subject>',
    )

    expect(book.meta.subjects).toEqual(['Science / Life Sciences', 'Nature'])
  })

  it('takes the blurb as text, never as markup', async () => {
    const book = await withMetadata(
      '<dc:description>&lt;p&gt;A voyage into&lt;/p&gt; &lt;b&gt;the future&lt;/b&gt;.</dc:description>',
    )

    expect(book.meta.description).toBe('A voyage into the future .')
  })

  it('leaves out what the file does not say', async () => {
    // Absent, not empty — the rule the whole of `BookMeta` follows.
    const book = await withMetadata('')

    for (const key of ['isbn', 'publisher', 'published', 'language', 'description', 'subjects']) {
      expect(key in book.meta).toBe(false)
    }
  })
})

describe('parseEpub — the ISBN', () => {
  async function isbnOf(identifiers: string) {
    const epub = makeEpub({
      metadata: `<dc:title>A Book</dc:title>${identifiers}`,
      manifest: '<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
      files: { 'OEBPS/ch1.xhtml': chapterDoc('<h1>One</h1><p>Prose.</p>') },
    })
    const book = await parseEpub(epub, meta())
    return book.meta.isbn
  }

  it('reads a plain ISBN-13', async () => {
    expect(await isbnOf('<dc:identifier>9780241988770</dc:identifier>')).toBe('9780241988770')
  })

  it('strips the urn prefix and the hyphens', async () => {
    // The grouping is presentational and every publisher does it differently.
    expect(await isbnOf('<dc:identifier>urn:isbn:978-0-241-98877-0</dc:identifier>')).toBe(
      '9780241988770',
    )
    expect(await isbnOf('<dc:identifier>ISBN:978 0 241 98877 0</dc:identifier>')).toBe(
      '9780241988770',
    )
  })

  it('takes an ISBN-10 when that is all there is, X and all', async () => {
    expect(await isbnOf('<dc:identifier>0-306-40615-2</dc:identifier>')).toBe('0306406152')
    expect(await isbnOf('<dc:identifier>043942089X</dc:identifier>')).toBe('043942089X')
  })

  it('prefers the 13 when the file offers both', async () => {
    const isbn = await isbnOf(
      '<dc:identifier>0306406152</dc:identifier>' +
        '<dc:identifier>urn:isbn:9780241988770</dc:identifier>',
    )

    expect(isbn).toBe('9780241988770')
  })

  it('ignores a UUID, which is what most epubs actually carry', async () => {
    expect(
      await isbnOf('<dc:identifier>urn:uuid:2b1c8d3e-0d3a-4f2a-9c1f-0d5f7a1b2c3d</dc:identifier>'),
    ).toBeUndefined()
  })

  it('ignores a publisher id that merely looks the right length', async () => {
    // The case a shape match waves straight through, and the reason the real
    // checksum is worth the ten lines: a wrong ISBN means the lookup returns a
    // confident answer about a different book.
    expect(await isbnOf('<dc:identifier>9780241988771</dc:identifier>')).toBeUndefined()
    expect(await isbnOf('<dc:identifier>1234567890123</dc:identifier>')).toBeUndefined()
    expect(await isbnOf('<dc:identifier>0306406153</dc:identifier>')).toBeUndefined()
  })

  it('finds the ISBN among a pile of other identifiers', async () => {
    const isbn = await isbnOf(
      '<dc:identifier id="uuid">urn:uuid:2b1c8d3e-0d3a-4f2a-9c1f-0d5f7a1b2c3d</dc:identifier>' +
        '<dc:identifier>calibre:1428</dc:identifier>' +
        '<dc:identifier opf:scheme="ISBN">9780241988770</dc:identifier>',
    )

    expect(isbn).toBe('9780241988770')
  })
})

describe('the book states its own structure', () => {
  // The reported shape: a converted book with no <h1> anywhere, whose titles
  // exist only as styled paragraphs, and which carries a proper nav document.
  const CSS = `
    p { font-size: 1em; text-indent: 1.2em; }
    p.part { font-size: 2em; font-weight: bold; text-align: center; text-indent: 0; }
    p.chap { font-size: 1.4em; font-weight: bold; text-indent: 0; }
    p.ded { font-size: 1.2em; text-align: center; text-indent: 0; }
  `

  const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="front.xhtml#ded">Dedication</a></li>
        <li><a href="front.xhtml#pre">Preface</a></li>
        <li><a href="body.xhtml#part1">Planting Sweetgrass</a>
          <ol>
            <li><a href="body.xhtml#sky">Skywoman Falling</a></li>
            <li><a href="body.xhtml#pecans">The Council of Pecans</a></li>
          </ol>
        </li>
      </ol>
    </nav>
  </body>
</html>`

  const epub = makeEpub({
    manifest: [
      '<item id="css" href="style.css" media-type="text/css"/>',
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="f" href="front.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="b" href="body.xhtml" media-type="application/xhtml+xml"/>',
    ].join(''),
    spine: '<itemref idref="f"/><itemref idref="b"/>',
    files: {
      'OEBPS/style.css': CSS,
      'OEBPS/nav.xhtml': NAV,
      'OEBPS/front.xhtml': chapterDoc(
        `<link rel="stylesheet" href="style.css"/>
         <p class="ded" id="ded">my daughters</p>
         <p class="ded">and my grandchildren</p>
         <p class="ded">yet to join us in this beautiful place</p>
         <p class="chap" id="pre">Preface</p>
         <p>Hold out your hands and let me lay upon them a sheaf of sweetgrass, loose and flowing.</p>`,
      ),
      'OEBPS/body.xhtml': chapterDoc(
        `<link rel="stylesheet" href="style.css"/>
         <p class="part" id="part1">Planting Sweetgrass</p>
         <p>Sweetgrass is best planted not by seed, but by putting roots in the ground.</p>
         <p class="chap" id="sky">Skywoman Falling</p>
         <p>In winter, when the green earth lies resting beneath a blanket of snow.</p>
         <p class="chap" id="pecans">The Council of Pecans</p>
         <p>Nuts fell that year in numbers nobody in the valley could remember.</p>`,
      ),
    },
  })

  it('lists the Preface as a division of the book', async () => {
    const book = await parseEpub(epub, meta())
    const titles = book.chapters.flatMap((chapter) => [
      chapter.title,
      ...chapter.sections.map((section) => section.title),
    ])
    expect(titles).toContain('Preface')
  })

  it('names every division the navigation names', async () => {
    const book = await parseEpub(epub, meta())
    const titles = book.chapters.flatMap((chapter) => [
      chapter.title,
      ...chapter.sections.map((section) => section.title),
    ])
    for (const wanted of ['Dedication', 'Preface', 'Planting Sweetgrass', 'Skywoman Falling']) {
      expect(titles).toContain(wanted)
    }
  })

  it('does not turn the dedication’s three lines into three chapters', async () => {
    const book = await parseEpub(epub, meta())
    const titles = book.chapters.map((chapter) => chapter.title)
    expect(titles).not.toContain('and my grandchildren')
    expect(titles).not.toContain('yet to join us in this beautiful place')
  })

  // The second reported book. Its contents lists the front matter and then one
  // chapter — number twenty-six — and says nothing about the twenty-five before
  // it. Silence is not denial: the fallback has to take over there by itself.
  const PARTIAL_NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="front.xhtml#note">Author’s Note</a></li>
        <li><a href="front.xhtml#pre">Preface</a></li>
        <li><a href="late.xhtml#c26">Chapter 26</a></li>
      </ol>
    </nav>
  </body>
</html>`

  const partial = makeEpub({
    manifest: [
      '<item id="css" href="style.css" media-type="text/css"/>',
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="f" href="front.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="e" href="early.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="l" href="late.xhtml" media-type="application/xhtml+xml"/>',
    ].join(''),
    spine: '<itemref idref="f"/><itemref idref="e"/><itemref idref="l"/>',
    files: {
      'OEBPS/style.css': CSS,
      'OEBPS/nav.xhtml': PARTIAL_NAV,
      'OEBPS/front.xhtml': chapterDoc(
        `<link rel="stylesheet" href="style.css"/>
         <p class="ded" id="ded">for my mother</p>
         <p class="ded">who let me go to the mountains</p>
         <p class="chap" id="note">Author’s Note</p>
         <p>A few words on the names of the peaks, and on the years they were climbed.</p>
         <p class="chap" id="pre">Preface</p>
         <p>The mountains gave me everything I have, and asked a great deal in return.</p>`,
      ),
      // Not mentioned by the navigation at all.
      'OEBPS/early.xhtml': chapterDoc(
        `<link rel="stylesheet" href="style.css"/>
         <p class="part" id="part1">Part 1</p>
         <p class="chap" id="c1">Chapter 1</p>
         <p>When I was a child I used to get away from home on one pretext or another.</p>
         <p class="chap" id="c2">Chapter 2</p>
         <p>The eagles did fly in the skies of the Prealps in those days, and I watched them.</p>`,
      ),
      'OEBPS/late.xhtml': chapterDoc(
        `<link rel="stylesheet" href="style.css"/>
         <p class="chap" id="c26">Chapter 26</p>
         <p>The last of the great walls, and the longest winter I ever spent under one.</p>`,
      ),
    },
  })

  it('keeps the chapters a partial navigation never mentions', async () => {
    const book = await parseEpub(partial, meta())
    const titles = book.chapters.flatMap((chapter) => [
      chapter.title,
      ...chapter.sections.map((section) => section.title),
    ])
    for (const wanted of ['Chapter 1', 'Chapter 2', 'Chapter 26']) {
      expect(titles).toContain(wanted)
    }
  })

  it('still refuses the dedication in the document the navigation did reach', async () => {
    const book = await parseEpub(partial, meta())
    const titles = book.chapters.flatMap((chapter) => [
      chapter.title,
      ...chapter.sections.map((section) => section.title),
    ])
    expect(titles).not.toContain('who let me go to the mountains')
  })

  it('keeps those lines in the text, still set apart', async () => {
    const book = await parseEpub(epub, meta())
    const text = book.sections
      .flatMap((section) => section.paragraphs)
      .map((paragraph) => paragraph.text)
    expect(text).toContain('and my grandchildren')
  })
})

describe('a book that nests its chapters under parts', () => {
  // The reported shape, reduced. Both books this was found on state their
  // structure perfectly and were flattened *because* of it: the chapters sit at
  // navigation depth 3, and only the two shallowest levels survive.
  const PROSE = 'Sweetgrass is best planted not by seed but by putting roots directly in the ground. '.repeat(40)

  function navList(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="body.xhtml">The Whole Book</a>
          <ol>
            <li><a href="body.xhtml#part1">Part One</a>
              <ol>
                <li><a href="body.xhtml#c1">Chapter One</a></li>
                <li><a href="body.xhtml#c2">Chapter Two</a></li>
              </ol>
            </li>
            <li><a href="body.xhtml#part2">Part Two</a>
              <ol>
                <li><a href="body.xhtml#c3">Chapter Three</a>
                  <ol><li><a href="body.xhtml#c3a">A Digression</a></li></ol>
                </li>
              </ol>
            </li>
          </ol>
        </li>
      </ol>
    </nav>
  </body>
</html>`
  }

  const epub = makeEpub({
    manifest: [
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="b" href="body.xhtml" media-type="application/xhtml+xml"/>',
    ].join(''),
    spine: '<itemref idref="b"/>',
    files: {
      'OEBPS/nav.xhtml': navList(),
      'OEBPS/body.xhtml': chapterDoc(
        `<h1 id="part1">Part One</h1>
         <h2 id="c1">Chapter One</h2><p>${PROSE}</p>
         <h2 id="c2">Chapter Two</h2><p>${PROSE}</p>
         <h1 id="part2">Part Two</h1>
         <h2 id="c3">Chapter Three</h2><p>${PROSE}</p>
         <h3 id="c3a">A Digression</h3><p>${PROSE}</p>`,
      ),
    },
  })

  it('keeps every chapter as a chapter', async () => {
    const book = await parseEpub(epub, meta())
    const titles = book.chapters.map((chapter) => chapter.title)
    expect(titles).toContain('Chapter One')
    expect(titles).toContain('Chapter Two')
    expect(titles).toContain('Chapter Three')
  })

  it('keeps the parts, standing beside the chapters they name', async () => {
    const book = await parseEpub(epub, meta())
    const titles = book.chapters.map((chapter) => chapter.title)
    expect(titles).toContain('Part One')
    expect(titles).toContain('Part Two')
  })

  it('still puts a real subdivision under its chapter, not beside it', async () => {
    const book = await parseEpub(epub, meta())
    const chapter = book.chapters.find((c) => c.title === 'Chapter Three')
    expect(chapter?.sections.map((section) => section.title)).toContain('A Digression')
    expect(book.chapters.map((c) => c.title)).not.toContain('A Digression')
  })

  it('does not read a chapter as a part just because it opens with a subheading', async () => {
    // Chapter Three holds no text before "A Digression", exactly as a part page
    // holds none before its first chapter. Judged alone it is indistinguishable
    // from one; judged as a level it is not, because its level holds the book.
    const book = await parseEpub(epub, meta())
    const chapter = book.chapters.find((c) => c.title === 'Chapter Three')
    expect(chapter?.sections.length).toBeGreaterThan(0)
  })
})

describe('what the book’s own stylesheet says about a line', () => {
  const CSS = `
    p { font-size: 1em; }
    p.title { font-size: 1.8em; text-align: center; }
    span.italic { font-style: italic; }
    span.smallcaps { font-size: 0.8em; }
    p.epi { font-size: 1em; font-style: italic; text-align: center; }
  `

  const epub = makeEpub({
    manifest: [
      '<item id="css" href="style.css" media-type="text/css"/>',
      '<item id="b" href="body.xhtml" media-type="application/xhtml+xml"/>',
    ].join(''),
    spine: '<itemref idref="b"/>',
    files: {
      'OEBPS/style.css': CSS,
      'OEBPS/body.xhtml': chapterDoc(
        `<link rel="stylesheet" href="style.css"/>
         <p class="title">PART ONE</p>
         <p class="epi">for my father, who never once turned back on a mountain</p>
         <p>He called it <span class="italic">the silent partner</span> and left.</p>
         <p>Then <em>she</em> answered him.</p>`,
      ),
    },
  })

  async function paragraphs() {
    const book = await parseEpub(epub, meta())
    return book.sections.flatMap((section) => section.paragraphs)
  }

  it('keeps an italic phrase marked up with a class and a CSS rule', async () => {
    // One of the two reported books carries no <em> at all — 413 italic phrases,
    // every one of them a span with a class. Matching on tags finds none.
    const block = (await paragraphs()).find((p) => p.text.includes('silent partner'))
    const mark = block?.marks?.find((m) => m.italic)
    expect(mark).toBeDefined()
    expect(block!.text.slice(mark!.start, mark!.end)).toBe('the silent partner')
  })

  it('keeps an italic phrase marked up with a tag', async () => {
    const block = (await paragraphs()).find((p) => p.text.includes('answered him'))
    const mark = block?.marks?.find((m) => m.italic)
    expect(block!.text.slice(mark!.start, mark!.end)).toBe('she')
  })

  it('keeps the centring and the slant the book gave a display line', async () => {
    const block = (await paragraphs()).find((p) => p.text.startsWith('for my father'))
    expect(block?.appearance?.centred).toBe(true)
    expect(block?.appearance?.italic).toBe(true)
  })

  it('leaves ordinary body text with nothing to draw', async () => {
    const block = (await paragraphs()).find((p) => p.text.includes('and left'))
    expect(block?.appearance).toBeUndefined()
  })
})
