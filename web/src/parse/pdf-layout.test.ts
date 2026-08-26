import { describe, expect, it } from 'vitest'

import { pdfPagesToBlocks, type PdfPage, type PdfTextItem } from './pdf-layout.ts'
import { assembleBook } from './assemble.ts'

const PAGE_WIDTH = 600
const PAGE_HEIGHT = 800
const BODY = 10
const LEFT = 50
const COLUMN_RIGHT = 550

/**
 * Place a line of text. `y` counts from the page top for readability here; PDF
 * coordinates run the other way, which is exactly what the parser has to cope
 * with, so we convert on the way in.
 */
function line(
  text: string,
  fromTop: number,
  options: { x?: number; size?: number; width?: number } = {},
): PdfTextItem {
  const size = options.size ?? BODY
  const x = options.x ?? LEFT
  return {
    str: text,
    x,
    y: PAGE_HEIGHT - fromTop,
    width: options.width ?? COLUMN_RIGHT - x,
    height: size,
  }
}

function page(items: PdfTextItem[]): PdfPage {
  return { width: PAGE_WIDTH, height: PAGE_HEIGHT, items }
}

function textsOf(pages: PdfPage[]): string[] {
  return pdfPagesToBlocks(pages).map((block) => block.text)
}

describe('pdfPagesToBlocks — lines', () => {
  it('reads down the page, not up, despite PDF coordinates', () => {
    expect(
      textsOf([page([line('Second.', 200, { width: 60 }), line('First.', 100, { width: 60 })])]),
    ).toEqual(['First.', 'Second.'])
  })

  it('joins fragments on the same baseline into one line', () => {
    const items: PdfTextItem[] = [
      { str: 'How', x: 50, y: 700, width: 30, height: BODY },
      { str: 'ever', x: 80, y: 700, width: 25, height: BODY },
      { str: 'so', x: 130, y: 700, width: 15, height: BODY },
    ]
    expect(textsOf([page(items)])).toEqual(['However so'])
  })

  it('ignores empty fragments', () => {
    const items: PdfTextItem[] = [
      { str: '   ', x: 50, y: 700, width: 5, height: BODY },
      { str: 'Real.', x: 60, y: 700, width: 30, height: BODY },
    ]
    expect(textsOf([page(items)])).toEqual(['Real.'])
  })

  it('returns nothing for a page with no text (a scanned image)', () => {
    expect(pdfPagesToBlocks([page([])])).toEqual([])
  })
})

describe('pdfPagesToBlocks — paragraphs', () => {
  it('reflows wrapped lines into one paragraph', () => {
    const blocks = pdfPagesToBlocks([
      page([line('The first line runs the full width', 100), line('and the second ends it.', 112)]),
    ])
    expect(blocks).toEqual([
      { kind: 'prose', text: 'The first line runs the full width and the second ends it.' },
    ])
  })

  it('splits on a wider vertical gap', () => {
    expect(
      textsOf([page([line('First paragraph.', 100), line('Second paragraph.', 140)])]),
    ).toEqual(['First paragraph.', 'Second paragraph.'])
  })

  it('splits on a first-line indent', () => {
    expect(
      textsOf([
        page([line('The opening paragraph wraps', 100), line('Indented start.', 112, { x: 70 })]),
      ]),
    ).toEqual(['The opening paragraph wraps', 'Indented start.'])
  })

  it('splits when the previous line stops short of the column edge', () => {
    expect(
      textsOf([
        page([
          line('A full-width line of running text', 100),
          line('short end.', 112, { width: 60 }),
          line('A new paragraph begins here now', 124),
        ]),
      ]),
    ).toEqual(['A full-width line of running text short end.', 'A new paragraph begins here now'])
  })

  it('heals a word hyphenated across a line break', () => {
    expect(
      textsOf([page([line('the story was uninter-', 100), line('rupted by anything at all', 112)])]),
    ).toEqual(['the story was uninterrupted by anything at all'])
  })

  it('starts a new paragraph on a new page', () => {
    expect(
      textsOf([
        page([line('End of page one runs wide', 700)]),
        page([line('Start of page two runs wide', 100)]),
      ]),
    ).toEqual(['End of page one runs wide', 'Start of page two runs wide'])
  })
})

describe('pdfPagesToBlocks — headings', () => {
  it('infers headings from font size and ranks them', () => {
    const blocks = pdfPagesToBlocks([
      page([
        line('Big Title', 100, { size: 20, width: 100 }),
        line('Smaller Heading', 140, { size: 14, width: 120 }),
        line('Body text at the usual size here', 180),
      ]),
    ])
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Big Title' },
      { kind: 'heading', level: 2, text: 'Smaller Heading' },
      { kind: 'prose', text: 'Body text at the usual size here' },
    ])
  })

  it('detects a title that wraps onto a second line', () => {
    const blocks = pdfPagesToBlocks([
      page([
        line('Introduction to the Special Issue on', 100, { size: 16 }),
        line('Non-duality and Cross-Cultural Philosophy', 120, { size: 16 }),
        // Enough body text that the body size wins on character count, as it
        // always does in a real document.
        line('Ordinary body text follows here below', 200),
        line('and continues for several more lines yet', 212),
        line('so that it dominates the page by volume', 224),
        line('the way running text always does in print', 236),
      ]),
    ])
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      text: 'Introduction to the Special Issue on Non-duality and Cross-Cultural Philosophy',
    })
  })

  it('does not promote a long large-set block, such as a pull quote', () => {
    const blocks = pdfPagesToBlocks([
      page([
        line('A pull quote set large across the page that runs on', 100, { size: 16 }),
        line('and keeps going well past the length any real title', 120, { size: 16 }),
        line('would ever reach before it finally stops here', 140, { size: 16 }),
        line('Ordinary body text follows here below', 220),
      ]),
    ])
    expect(blocks.every((block) => block.kind === 'prose')).toBe(true)
  })

  it('treats the dominant size as body text even when headings outnumber it', () => {
    const blocks = pdfPagesToBlocks([
      page([
        line('Heading One', 100, { size: 18, width: 90 }),
        line(
          'A long stretch of ordinary prose that clearly dominates the page by character count',
          140,
        ),
      ]),
    ])
    expect(blocks[0].kind).toBe('heading')
    expect(blocks[1].kind).toBe('prose')
  })
})

describe('pdfPagesToBlocks — running headers and footers', () => {
  function bookPage(index: number): PdfPage {
    return page([
      line('The Journal of Examples', 20, { width: 150 }),
      line(`Body prose on page ${index} running the full width`, 300),
      line(`Page ${index}`, 770, { width: 40 }),
    ])
  }

  it('drops a header and footer that repeat across pages', () => {
    const texts = textsOf([bookPage(1), bookPage(2), bookPage(3), bookPage(4)])
    expect(texts.some((text) => text.includes('Journal of Examples'))).toBe(false)
    expect(texts.some((text) => text.startsWith('Page '))).toBe(false)
    expect(texts).toHaveLength(4)
  })

  it('keeps margin text that does not repeat', () => {
    const texts = textsOf([
      page([line('A one-off note in the margin', 20), line('Body one runs the full width', 300)]),
      page([line('The Journal of Examples', 20), line('Body two runs the full width', 300)]),
      page([line('The Journal of Examples', 20), line('Body three runs full width', 300)]),
    ])
    expect(texts.some((text) => text.includes('one-off note'))).toBe(true)
  })

  it('never strips furniture from a document too short to be sure', () => {
    const texts = textsOf([bookPage(1), bookPage(2)])
    expect(texts.some((text) => text.includes('Journal of Examples'))).toBe(true)
  })

  it('leaves body text alone even when it repeats', () => {
    const repeated = [1, 2, 3, 4].map(() =>
      page([line('An identical sentence in the middle of the page', 400)]),
    )
    expect(textsOf(repeated)).toHaveLength(4)
  })
})

describe('pdfPagesToBlocks — two-column layouts', () => {
  it('reads each column in full rather than interleaving them', () => {
    const left = [
      line('Left column line one here', 100, { x: 40, width: 220 }),
      line('Left column line two here', 120, { x: 40, width: 220 }),
    ]
    const right = [
      line('Right column line one here', 100, { x: 330, width: 220 }),
      line('Right column line two here', 120, { x: 330, width: 220 }),
    ]
    const extra = [
      line('Left column line three', 140, { x: 40, width: 220 }),
      line('Right column line three', 140, { x: 330, width: 220 }),
    ]

    const texts = textsOf([page([...left, ...right, ...extra])])
    const joined = texts.join(' ')
    expect(joined.indexOf('Left column line three')).toBeLessThan(
      joined.indexOf('Right column line one'),
    )
  })

  it('leaves a single-column page with a centred heading untouched', () => {
    const texts = textsOf([
      page([
        line('A Centred Heading', 100, { x: 200, size: 16, width: 200 }),
        line('Body text running the full page width here', 140),
        line('and continuing across a second line too', 152),
      ]),
    ])
    expect(texts[0]).toBe('A Centred Heading')
  })
})

describe('figures put back between the paragraphs', () => {
  /** One line, as pdf.js hands it over. */
  const at = (y: number, str: string) => ({ str, x: 72, y, width: 400, height: 12 })

  const pageOf = (items: ReturnType<typeof at>[]) => ({ width: 600, height: 800, items })

  it('puts a figure between the paragraph above it and the one below', () => {
    const pages = [pageOf([at(700, 'Above the plate.'), at(300, 'Below the plate.')])]
    const blocks = pdfPagesToBlocks(pages, [{ page: 1, bottom: 320, path: 'pdf/one.png' }])

    expect(blocks.map((block) => block.kind)).toEqual(['prose', 'figure', 'prose'])
    expect(blocks[1]).toEqual({ kind: 'figure', text: '[Figure]', image: { src: 'pdf/one.png' } })
  })

  it('puts a plate on an earlier page before the text that follows it', () => {
    const pages = [pageOf([]), pageOf([at(700, 'The text after the plate.')])]
    const blocks = pdfPagesToBlocks(pages, [{ page: 1, bottom: 0, path: 'pdf/plate.png' }])
    expect(blocks.map((block) => block.kind)).toEqual(['figure', 'prose'])
  })

  it('keeps a figure below the last paragraph in the book', () => {
    const pages = [pageOf([at(700, 'The last words.')])]
    const blocks = pdfPagesToBlocks(pages, [{ page: 1, bottom: 100, path: 'pdf/last.png' }])
    expect(blocks.map((block) => block.kind)).toEqual(['prose', 'figure'])
  })

  it('reads two plates on one page down the page, not up it', () => {
    const pages = [pageOf([at(780, 'First.'), at(60, 'Last.')])]
    const blocks = pdfPagesToBlocks(pages, [
      { page: 1, bottom: 150, path: 'pdf/lower.png' },
      { page: 1, bottom: 600, path: 'pdf/upper.png' },
    ])
    const paths = blocks
      .filter((block) => block.kind === 'figure')
      .map((block) => (block as { image?: { src: string } }).image?.src)
    expect(paths).toEqual(['pdf/upper.png', 'pdf/lower.png'])
  })

  it('changes nothing about a PDF with no figures', () => {
    const pages = [pageOf([at(700, 'Just words.')])]
    expect(pdfPagesToBlocks(pages, [])).toEqual(pdfPagesToBlocks(pages))
  })
})

describe('pdfPagesToBlocks — a column of short lines', () => {
  /*
   * The regression: the column measure used to be seeded from the first line of
   * each paragraph, so a paragraph that *began* short compared that line with
   * itself. The short-line test could never fire and every following entry was
   * welded on. A real contents page — the Delphi Classics *Collected Works of
   * Hegel* — came out as four run-on paragraphs instead of fifteen entries.
   */
  it('keeps a contents list as one paragraph per entry', () => {
    const entries = [
      'The Books',
      'The Phenomenology of Spirit',
      'The Logic of Hegel',
      'The Criticism',
    ]
    expect(
      textsOf([
        page([
          // A long line somewhere on the page, so the column has a real measure.
          line('A full line of ordinary prose that reaches the right edge.', 40),
          ...entries.map((text, index) =>
            line(text, 120 + index * 14, { width: 60 + index * 20 }),
          ),
        ]),
      ]),
    ).toEqual(['A full line of ordinary prose that reaches the right edge.', ...entries])
  })

  it('still joins prose that wraps to the column edge', () => {
    expect(
      textsOf([
        page([
          line('A sentence that runs the whole width of the column and', 100),
          line('then wraps once before it ends here.', 114, { width: 180 }),
        ]),
      ]),
    ).toEqual(['A sentence that runs the whole width of the column and then wraps once before it ends here.'])
  })
})

describe('pdfPagesToBlocks — the PDF outline', () => {
  const two = (): PdfPage[] => [
    page([line('The Phenomenology of Spirit', 60, { size: 20, width: 300 })]),
    page([line('Preface', 60, { size: 14, width: 90 }), line('Ordinary prose.', 90, { width: 120 })]),
  ]

  it('promotes the page’s own title rather than printing it twice', () => {
    const blocks = pdfPagesToBlocks(two(), [], [
      { title: 'The Phenomenology of Spirit', page: 1, depth: 0 },
    ])
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      text: 'The Phenomenology of Spirit',
    })
    expect(blocks.filter((b) => b.text === 'The Phenomenology of Spirit')).toHaveLength(1)
  })

  it('nests a child under its volume', () => {
    const blocks = pdfPagesToBlocks(two(), [], [
      { title: 'The Phenomenology of Spirit', page: 1, depth: 0 },
      { title: 'Preface', page: 2, depth: 1 },
    ])
    expect(blocks.map((b) => [b.kind, 'level' in b ? b.level : null, b.text])).toEqual([
      ['heading', 1, 'The Phenomenology of Spirit'],
      ['heading', 2, 'Preface'],
      ['prose', null, 'Ordinary prose.'],
    ])
  })

  it('inserts a heading where the page does not say its own name', () => {
    const blocks = pdfPagesToBlocks(
      [page([line('Straight into the prose.', 60, { width: 200 })])],
      [],
      [{ title: 'Volume One', page: 1, depth: 0 }],
    )
    expect(blocks.map((b) => b.text)).toEqual(['Volume One', 'Straight into the prose.'])
    expect(blocks[0].kind).toBe('heading')
  })

  /*
   * The outline is a fact recorded in the file; a font size is a guess about
   * one. Blending them would let a large-set pull quote outrank a real chapter.
   */
  it('switches the font-size guess off entirely', () => {
    const blocks = pdfPagesToBlocks(
      [
        page([
          line('Volume One', 40, { size: 10, width: 80 }),
          line('A HUGE PULL QUOTE', 80, { size: 30, width: 300 }),
        ]),
      ],
      [],
      [{ title: 'Volume One', page: 1, depth: 0 }],
    )
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'Volume One'],
      ['prose', 'A HUGE PULL QUOTE'],
    ])
  })

  it('adds nothing when the file carries no outline', () => {
    // The guess still runs and nothing synthetic is spliced in: the same words,
    // in the same order, as before an outline was ever read.
    expect(pdfPagesToBlocks(two()).map((b) => b.text)).toEqual([
      'The Phenomenology of Spirit',
      'Preface',
      'Ordinary prose.',
    ])
  })
})

describe('pdfPagesToBlocks — headings the outline does not name', () => {
  /* The column has a real measure, so the centred test has margins to read. */
  const withProse = (extra: PdfTextItem[]): PdfPage[] => [
    page([
      line('A full line of prose that runs to the right edge of the column.', 40),
      ...extra,
      line('More prose, also running the whole width of the column here.', 200),
    ]),
  ]

  it('marks a centred line as a subheading, not as a division', () => {
    const centred = line('The Truth which Conscious Certainty Realizes', 120, {
      x: 200,
      width: 200,
    })
    const blocks = pdfPagesToBlocks(withProse([centred]), [], [
      { title: 'Somewhere else', page: 1, depth: 0 },
    ])
    const row = blocks.find((b) => b.text.startsWith('The Truth'))
    // Prose with a label: it is drawn as a heading and divides nothing, so it
    // can never become a chapter or move an anchor.
    expect(row).toEqual({
      kind: 'prose',
      label: 'subheading',
      text: 'The Truth which Conscious Certainty Realizes',
    })
  })

  it('leaves a block quote alone, indented but running to the measure', () => {
    const quote = line('An indented quotation that still reaches the right edge.', 120, {
      x: 90,
    })
    const blocks = pdfPagesToBlocks(withProse([quote]), [], [
      { title: 'Somewhere else', page: 1, depth: 0 },
    ])
    expect(blocks.find((b) => b.text.startsWith('An indented'))?.kind).toBe('prose')
    expect(blocks.find((b) => b.text.startsWith('An indented'))).not.toHaveProperty('label')
  })

  it('promotes a title the page sets over two lines, and prints it once', () => {
    const blocks = pdfPagesToBlocks(
      [
        page([
          line('IV. THE TRUTH WHICH CONSCIOUS CERTAINTY OF', 40, { x: 120, width: 300 }),
          line('SELF REALIZES', 60, { x: 220, width: 100 }),
          line('IN the kinds of certainty hitherto considered, the truth is.', 100),
        ]),
      ],
      [],
      [
        {
          title: 'IV. THE TRUTH WHICH CONSCIOUS CERTAINTY OF SELF REALIZES',
          page: 1,
          depth: 1,
        },
      ],
    )
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'IV. THE TRUTH WHICH CONSCIOUS CERTAINTY OF SELF REALIZES'],
      ['prose', 'IN the kinds of certainty hitherto considered, the truth is.'],
    ])
  })
})

describe('pdfPagesToBlocks — the links a PDF carries', () => {
  /*
   * A PDF link is a rectangle and a destination. It holds no text at all, so the
   * words under it have to be found from the page geometry — which is what
   * these check. `line()` places text at `x` with a given width, and the
   * rectangle is written in PDF space, where y counts up from the foot.
   */
  const y = (fromTop: number) => PAGE_HEIGHT - fromTop

  it('links exactly the words the rectangle covers', () => {
    // pdf.js reports a line in fragments, not whole. Two here, so the rectangle
    // has something to cover and something to leave alone.
    const blocks = pdfPagesToBlocks(
      [
        page([
          line('Read the', 100, { x: LEFT, width: 60 }),
          line('preface and then begin.', 100, { x: LEFT + 64, width: 200 }),
        ]),
      ],
      [],
      [],
      [{ page: 1, x0: LEFT, y0: y(100) - 4, x1: LEFT + 60, y1: y(100) + 10, url: 'https://x.test' }],
    )
    const [block] = blocks
    expect(block.links).toBeDefined()
    const link = block.links![0]
    // The range is a real slice of the text a reader sees, not the whole line.
    expect(block.text.slice(link.start, link.end)).toBe('Read the')
    expect(link.href).toBe('https://x.test')
  })

  it('turns a destination page into an anchor a reader can follow', () => {
    const book = assembleBook(
      pdfPagesToBlocks(
        [
          page([line('Go to the second volume.', 100, { width: 120 })]),
          page([line('The second volume begins here.', 100, { width: 150 })]),
        ],
        [],
        [],
        [{ page: 1, x0: LEFT, y0: y(100) - 4, x1: LEFT + 200, y1: y(100) + 10, targetPage: 2 }],
      ),
      { id: 'b', title: 'T', author: 'A', source: 'pdf', shelf: 'book', importedAt: '2026-08-26T00:00:00.000Z' } as never,
    )

    const all = book.sections.flatMap((section) => section.paragraphs)
    const from = all.find((paragraph) => paragraph.links)
    const to = all.find((paragraph) => paragraph.text.startsWith('The second volume'))
    expect(from?.links?.[0].anchor).toBe(to?.anchor)
    // Resolved links drop the raw destination, so nothing can follow both.
    expect(from?.links?.[0].url).toBeUndefined()
    // The ids used to resolve it never reach storage.
    expect(to?.ids).toBeUndefined()
  })

  it('drops a rectangle that covers no words', () => {
    const blocks = pdfPagesToBlocks(
      [page([line('Nothing is linked here.', 100)])],
      [],
      [],
      [{ page: 1, x0: 0, y0: y(400), x1: 20, y1: y(390), url: 'https://x.test' }],
    )
    expect(blocks[0].links).toBeUndefined()
  })

  it('adds nothing to a file with no links', () => {
    const blocks = pdfPagesToBlocks([page([line('Plain prose.', 100, { width: 80 })])])
    expect(blocks[0].links).toBeUndefined()
    expect(blocks[0].ids).toBeUndefined()
  })
})
