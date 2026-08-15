// @vitest-environment jsdom
// WP-38 — the non-prose block kinds, across every front end that can produce
// them. These are the cases that used to be destroyed: a table shattered into
// one anchored paragraph per cell, a formula into one per symbol, an image into
// nothing at all.

import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { assembleBook, htmlToBlocks, markdownToBlocks, type Block } from './index.ts'

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

/** The block kinds produced, in order — the shape of the document. */
function kinds(blocks: Block[]): string[] {
  return blocks.map((block) => block.kind)
}

describe('html — tables', () => {
  const table =
    '<table><caption>Results</caption>' +
    '<tr><th>Model</th><th>Score</th></tr>' +
    '<tr><td>A</td><td>0.91</td></tr>' +
    '<tr><td>B</td><td>0.87</td></tr></table>'

  it('is one block, not one per cell', () => {
    const blocks = htmlToBlocks(table)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('table')
  })

  it('preserves the grid so a cell keeps its row and column', () => {
    expect(htmlToBlocks(table)[0].rows).toEqual([
      ['Model', 'Score'],
      ['A', '0.91'],
      ['B', '0.87'],
    ])
  })

  it('carries a readable flattened form for the tutor', () => {
    expect(htmlToBlocks(table)[0].text).toBe('Results\nModel | Score\nA | 0.91\nB | 0.87')
  })

  // A book's contents page is very often a two-column table, and cells built
  // from `textContent` threw every entry's link away — the reason the app showed
  // dead text where other readers show a tappable list of chapters.
  it('keeps the links inside its cells, offset to the flattened text', () => {
    const contents =
      '<table>' +
      '<tr><td><a href="c1.xhtml">I</a></td><td><a href="c1.xhtml">Conditions</a></td></tr>' +
      '<tr><td><a href="c2.xhtml">II</a></td><td><a href="c2.xhtml">Motion</a></td></tr>' +
      '</table>'

    const [block] = htmlToBlocks(contents)
    expect(block.text).toBe('I | Conditions\nII | Motion')
    expect(block.links).toEqual([
      { start: 0, end: 1, href: 'c1.xhtml' },
      { start: 4, end: 14, href: 'c1.xhtml' },
      { start: 15, end: 17, href: 'c2.xhtml' },
      { start: 20, end: 26, href: 'c2.xhtml' },
    ])
  })

  it('shifts cell links past a caption, which takes the first line', () => {
    const [block] = htmlToBlocks(
      '<table><caption>Contents</caption><tr><td><a href="c1.xhtml">I</a></td></tr></table>',
    )
    expect(block.text).toBe('Contents\nI')
    expect(block.links).toEqual([{ start: 9, end: 10, href: 'c1.xhtml' }])
  })

  it('never gives a bare cell value its own anchor', () => {
    const book = assembleBook(htmlToBlocks(table), meta())
    const anchored = book.sections.flatMap((s) => s.paragraphs)
    expect(anchored).toHaveLength(1)
    expect(anchored.map((p) => p.text)).not.toContain('0.91')
  })
})

describe('html — figures', () => {
  it('keeps the image and its caption together', () => {
    const [block] = htmlToBlocks(
      '<figure><img src="d.png" alt="A diagram"/><figcaption>Fig 1. The process.</figcaption></figure>',
    )
    expect(block.kind).toBe('figure')
    expect(block.image).toEqual({ src: 'd.png', alt: 'A diagram' })
    expect(block.label).toBe('Fig 1. The process.')
  })

  it('leaves a visible placeholder rather than a silent hole', () => {
    expect(htmlToBlocks('<img src="d.png" alt="A diagram of the process"/>')[0].text).toBe(
      '[Figure: A diagram of the process]',
    )
  })

  it('still records an image that has no caption or alt text', () => {
    const [block] = htmlToBlocks('<img src="plate.jpg"/>')
    expect(block.text).toBe('[Figure]')
    expect(block.image).toEqual({ src: 'plate.jpg' })
  })

  // The single most common way artwork appears in a real epub — far more
  // common than <figure>. A paragraph is otherwise a leaf, so without this the
  // image is invisible and an image-only paragraph disappears completely.
  it('finds an image wrapped in a paragraph', () => {
    const [block] = htmlToBlocks('<p class="image"><img src="plate12.jpg" alt="A mandala"/></p>')
    expect(block.kind).toBe('figure')
    expect(block.image).toEqual({ src: 'plate12.jpg', alt: 'A mandala' })
  })

  it('treats the text beside a wrapped image as its caption', () => {
    const [block] = htmlToBlocks('<p><img src="f.jpg"/>Fig 4. A dream sequence.</p>')
    expect(block.text).toBe('[Figure: Fig 4. A dream sequence.]')
    expect(block.label).toBe('Fig 4. A dream sequence.')
  })

  // An ornament or drop-cap inside a paragraph of prose used to turn the whole
  // paragraph into a figure, which printed a page of text a second time as a
  // caption underneath itself.
  it('leaves a paragraph of prose as prose, image inside it or not', () => {
    const prose = 'x'.repeat(400)
    const [block] = htmlToBlocks(`<p><img src="ornament.png"/>${prose}</p>`)
    expect(block.kind).toBe('prose')
    expect(block.text).toBe(prose)
  })

  it('finds the image inside an svg wrapper, as epub full-page plates use', () => {
    const [block] = htmlToBlocks(
      '<svg viewBox="0 0 10 10"><title>The cover</title><image xlink:href="cover.jpg"/></svg>',
    )
    expect(block.kind).toBe('figure')
    expect(block.image).toEqual({ src: 'cover.jpg', alt: 'The cover' })
  })
})

describe('html — formulas', () => {
  it('keeps block-level MathML as one block, not one per symbol', () => {
    const blocks = htmlToBlocks('<p>Before.</p><math><mi>x</mi><mo>+</mo><mi>y</mi></math><p>After.</p>')
    expect(kinds(blocks)).toEqual(['prose', 'formula', 'prose'])
    expect(blocks[1].text).toBe('x+y')
  })

  it('leaves inline math inside its sentence', () => {
    expect(htmlToBlocks('<p>Given <math><mi>E</mi></math> we see.</p>')).toEqual([
      { kind: 'prose', text: 'Given E we see.' },
    ])
  })
})

describe('html — quotes, code and notes', () => {
  it('marks a block quote as a quote, whole', () => {
    const blocks = htmlToBlocks('<blockquote><p>One.</p><p>Two.</p></blockquote>')
    expect(blocks).toEqual([{ kind: 'quote', text: 'One.\nTwo.' }])
  })

  it('separates the paragraphs of a quote instead of fusing the words', () => {
    // `textContent` would give "the endStart again" — a fused word.
    expect(htmlToBlocks('<blockquote><p>the end</p><p>Start again</p></blockquote>')[0].text).toBe(
      'the end\nStart again',
    )
  })

  it('marks preformatted text as code and keeps its whitespace', () => {
    expect(htmlToBlocks('<pre>def f():\n    return 1\n</pre>')).toEqual([
      { kind: 'code', text: 'def f():\n    return 1' },
    ])
  })

  it('marks an epub footnote as a note', () => {
    const [block] = htmlToBlocks('<aside epub:type="footnote"><p>See Jung, 1964.</p></aside>')
    expect(block.kind).toBe('note')
    expect(block.label).toBe('footnote')
  })

  it('marks a footnote paragraph by its ARIA role', () => {
    expect(htmlToBlocks('<p role="doc-endnote">Ibid.</p>')[0].kind).toBe('note')
  })
})

describe('html — furniture', () => {
  it('recognises a nav table of contents', () => {
    expect(htmlToBlocks('<nav epub:type="toc"><ol><li>Chapter One</li></ol></nav>')[0].kind).toBe(
      'furniture',
    )
  })

  it('drops furniture before any anchor is assigned', () => {
    const book = assembleBook(
      htmlToBlocks('<nav epub:type="toc"><p>Contents</p></nav><p>Real prose.</p>'),
      meta(),
    )
    const paragraphs = book.sections.flatMap((s) => s.paragraphs)
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text).toBe('Real prose.')
    // The furniture must not have consumed p001 — anchors are permanent.
    expect(paragraphs[0].anchor).toBe('[ch01-s01-p001]')
  })
})

describe('markdown — non-prose blocks', () => {
  it('keeps a pipe table as one block with its grid', () => {
    const [block] = markdownToBlocks('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')
    expect(block.kind).toBe('table')
    expect(block.rows).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('does not mistake stacked prose for a table without a divider row', () => {
    expect(markdownToBlocks('| not | really |\n| a | table |')[0].kind).toBe('prose')
  })

  it('captures a standalone image as a figure', () => {
    const [block] = markdownToBlocks('![A diagram](d.png)')
    expect(block.kind).toBe('figure')
    expect(block.image).toEqual({ src: 'd.png', alt: 'A diagram' })
  })

  it('keeps display math as one block', () => {
    expect(markdownToBlocks('$$\nE = mc^2\n$$')).toEqual([{ kind: 'formula', text: 'E = mc^2' }])
  })

  it('handles single-line display math', () => {
    expect(markdownToBlocks('$$ E = mc^2 $$')).toEqual([{ kind: 'formula', text: 'E = mc^2' }])
  })

  it('keeps a block quote whole', () => {
    expect(markdownToBlocks('> One line\n> and the next')).toEqual([
      { kind: 'quote', text: 'One line and the next' },
    ])
  })

  it('keeps a list as one block', () => {
    const [block] = markdownToBlocks('- One\n- Two\n- Three')
    expect(block.kind).toBe('list')
    expect(block.text).toBe('• One\n• Two\n• Three')
    expect(block.label).toBe('unordered')
  })

  it('numbers an ordered list', () => {
    expect(markdownToBlocks('1. First\n2. Second')[0]).toEqual({
      kind: 'list',
      text: '1. First\n2. Second',
      label: 'ordered',
    })
  })

  it('records a fenced block as code with its language', () => {
    expect(markdownToBlocks('```py\nx = 1\n```')).toEqual([
      { kind: 'code', text: 'x = 1', label: 'py' },
    ])
  })

  it('captures a footnote definition as a note', () => {
    const [block] = markdownToBlocks('[^1]: Jung, *Man and His Symbols*, 1964.')
    expect(block.kind).toBe('note')
    expect(block.label).toBe('footnote 1')
  })

  it('reads a mixed document in order', () => {
    const source = [
      '# Chapter',
      '',
      'Opening prose.',
      '',
      '> A quotation.',
      '',
      '- one',
      '- two',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '![Figure](f.png)',
      '',
      '$$ x = 1 $$',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      'Closing prose.',
    ].join('\n')

    expect(kinds(markdownToBlocks(source))).toEqual([
      'heading',
      'prose',
      'quote',
      'list',
      'table',
      'figure',
      'formula',
      'code',
      'prose',
    ])
  })
})

describe('anchoring is unaffected in kind', () => {
  it('gives every block exactly one anchor, whatever its kind', () => {
    const blocks = markdownToBlocks(
      'Prose.\n\n> Quote.\n\n- a\n- b\n\n```\ncode\n```\n\n$$ x $$',
    )
    const book = assembleBook(blocks, meta())
    const paragraphs = book.sections.flatMap((s) => s.paragraphs)

    expect(paragraphs).toHaveLength(5)
    expect(paragraphs.map((p) => p.kind)).toEqual(['prose', 'quote', 'list', 'code', 'formula'])
    expect(new Set(paragraphs.map((p) => p.anchor)).size).toBe(5)
  })

  it('leaves a plain prose paragraph free of empty optional fields', () => {
    const book = assembleBook(markdownToBlocks('Just prose.'), meta())
    expect(book.sections[0].paragraphs[0]).toEqual({
      anchor: '[ch01-s01-p001]',
      text: 'Just prose.',
      kind: 'prose',
    })
  })
})

/*
 * This rule deletes a line of the book, so what it must *not* delete matters as
 * much as what it must.
 */
describe('a chapter title the book prints twice', () => {
  const textOf = (book: ReturnType<typeof assembleBook>) =>
    book.sections.flatMap((section) => section.paragraphs).map((p) => p.text)

  it('drops the echo, since the heading is already the chapter title', () => {
    const book = assembleBook(
      htmlToBlocks('<h1>Introduction</h1><p>Introduction</p><p>Lucid dreaming is old.</p>'),
      meta(),
    )
    expect(book.chapters[0].title).toBe('Introduction')
    expect(textOf(book)).toEqual(['Lucid dreaming is old.'])
  })

  it('does not care about case or stray punctuation', () => {
    const book = assembleBook(
      htmlToBlocks('<h1>Introduction</h1><p>INTRODUCTION.</p><p>Real prose.</p>'),
      meta(),
    )
    expect(textOf(book)).toEqual(['Real prose.'])
  })

  it('keeps a sentence that merely begins with the chapter name', () => {
    const book = assembleBook(
      htmlToBlocks('<h1>Introduction</h1><p>Introduction to a long subject.</p>'),
      meta(),
    )
    expect(textOf(book)).toEqual(['Introduction to a long subject.'])
  })

  it('leaves a repeat that is not the first thing in the chapter', () => {
    const book = assembleBook(
      htmlToBlocks('<h1>Introduction</h1><p>Real prose.</p><p>Introduction</p>'),
      meta(),
    )
    expect(textOf(book)).toEqual(['Real prose.', 'Introduction'])
  })

  it('still starts the surviving text at the first anchor', () => {
    const book = assembleBook(
      htmlToBlocks('<h1>Introduction</h1><p>Introduction</p><p>Real prose.</p>'),
      meta(),
    )
    expect(book.sections[0].paragraphs[0].anchor).toBe('[ch01-s01-p001]')
  })
})
