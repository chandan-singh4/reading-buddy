// @vitest-environment jsdom
// `htmlToBlocks` uses the browser's own DOMParser, so these need a DOM. The
// suite default is 'node' (see vite.config.ts) — this docblock opts just this
// file in rather than slowing every other test file down.

import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { isAnchor } from '../structure/index.ts'
import { htmlToBlocks, parseHtml } from './index.ts'

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

function texts(html: string): string[] {
  return htmlToBlocks(html).map((block) => block.text)
}

describe('htmlToBlocks', () => {
  it('reads headings with their level', () => {
    expect(htmlToBlocks('<h2>Alpha</h2><p>Prose.</p>')).toEqual([
      { kind: 'heading', level: 2, text: 'Alpha' },
      { kind: 'prose', text: 'Prose.' },
    ])
  })

  it('keeps an inline-marked sentence as one paragraph', () => {
    expect(texts('<p>The <em>real</em> question is <strong>why</strong>.</p>')).toEqual([
      'The real question is why.',
    ])
  })

  it('keeps inline markup intact when there is no paragraph tag to hold it', () => {
    expect(texts('<div>The <em>real</em> question.</div>')).toEqual(['The real question.'])
  })

  it('collapses source-markup whitespace and newlines', () => {
    expect(texts('<p>\n  wrapped\n  across   lines\n</p>')).toEqual(['wrapped across lines'])
  })

  it('recurses through structural wrappers', () => {
    expect(texts('<div><section><p>Deep.</p></section></div>')).toEqual(['Deep.'])
  })

  it('keeps loose prose that has no paragraph tag around it', () => {
    expect(texts('<div>Bare text in a div.</div>')).toEqual(['Bare text in a div.'])
  })

  /*
   * A scene break is the one mark a file states two completely different ways,
   * and got wrong both times: `<hr>` disappeared, and typed asterisks were
   * printed as characters.
   */
  describe('section breaks', () => {
    it('keeps a horizontal rule as a break instead of dropping it', () => {
      expect(htmlToBlocks('<p>Before.</p><hr/><p>After.</p>')).toEqual([
        { kind: 'prose', text: 'Before.' },
        { kind: 'prose', text: '***', label: 'break' },
        { kind: 'prose', text: 'After.' },
      ])
    })

    it('recognises the asterisks an author typed', () => {
      expect(htmlToBlocks('<p>* * *</p>')).toEqual([
        { kind: 'prose', text: '***', label: 'break' },
      ])
    })

    it('leaves short prose that merely looks like one alone', () => {
      // The dangerous false positive: a real line of the book, dropped to an
      // ornament, would be a sentence the reader never sees.
      expect(texts('<p>No.</p><p>“Why?”</p><p>…</p>')).toEqual(['No.', '“Why?”', '…'])
    })
  })

  it('keeps a list as one block rather than one anchor per item', () => {
    expect(htmlToBlocks('<ul><li>One</li><li>Two</li></ul>')).toEqual([
      { kind: 'list', text: '• One\n• Two', label: 'unordered' },
    ])
  })

  it('keeps the links inside list items, offset for the bullet and the joins', () => {
    // A book's own contents page is a list of links. Building the block from
    // `textContent` dropped every one of them, which is why contents entries
    // were unclickable while a footnote inside a paragraph worked.
    const [block] = htmlToBlocks(
      '<ul><li><a href="#c1">One</a></li><li>see <a href="#c2">Two</a></li></ul>',
    )

    expect(block.text).toBe('• One\n• see Two')
    const links = (block as { links?: { start: number; end: number; href: string }[] }).links
    expect(links).toEqual([
      { start: 2, end: 5, href: '#c1' },
      { start: 12, end: 15, href: '#c2' },
    ])
    // The offsets are only meaningful if they still point at the right words.
    expect(block.text.slice(2, 5)).toBe('One')
    expect(block.text.slice(12, 15)).toBe('Two')
  })

  it('numbers an ordered list and shifts its links past the number', () => {
    const [block] = htmlToBlocks('<ol><li>a</li><li><a href="#x">b</a></li></ol>')

    expect(block.text).toBe('1. a\n2. b')
    const links = (block as { links?: { start: number; end: number }[] }).links ?? []
    expect(block.text.slice(links[0].start, links[0].end)).toBe('b')
  })

  it('keeps the links inside a multi-paragraph quote', () => {
    const [block] = htmlToBlocks(
      '<blockquote><p>One.</p><p>See <a href="#n1">this</a>.</p></blockquote>',
    )

    expect(block.text).toBe('One.\nSee this.')
    const links = (block as { links?: { start: number; end: number }[] }).links ?? []
    expect(block.text.slice(links[0].start, links[0].end)).toBe('this')
  })

  it('preserves whitespace inside <pre>', () => {
    expect(texts('<pre>def f():\n    return 1\n</pre>')).toEqual(['def f():\n    return 1'])
  })

  it('drops scripts, styles and other non-prose', () => {
    expect(texts('<style>p{color:red}</style><script>x=1</script><p>Only this.</p>')).toEqual([
      'Only this.',
    ])
  })

  it('ignores empty and whitespace-only elements', () => {
    expect(texts('<p></p><p>   </p><p>Real.</p>')).toEqual(['Real.'])
  })

  it('recovers from malformed markup rather than throwing', () => {
    expect(texts('<p>Unclosed<p>Second')).toEqual(['Unclosed', 'Second'])
  })

  it('returns nothing for an empty document', () => {
    expect(htmlToBlocks('')).toEqual([])
  })
})

/**
 * A `<br>` carries no text of its own, so walking it used to contribute
 * nothing and the words either side were pasted together. Reported off a real
 * title page: "Published byDell Publishinga division ofRandom House, Inc."
 */
describe('htmlToBlocks — line breaks', () => {
  it('keeps the words either side of a <br> apart', () => {
    expect(
      texts(
        '<p>Published by<br/>Dell Publishing<br/>a division of<br/>Random House, Inc.</p>',
      ),
    ).toEqual(['Published by\nDell Publishing\na division of\nRandom House, Inc.'])
  })

  it('handles the unclosed form real books are full of', () => {
    expect(texts('<p>Editor, Carl G. Jung<br>and after his death M.-L. von Franz</p>')).toEqual([
      'Editor, Carl G. Jung\nand after his death M.-L. von Franz',
    ])
  })

  it('does not start a line with the space that followed the break', () => {
    expect(texts('<p>One<br/>   Two</p>')).toEqual(['One\nTwo'])
  })

  it('collapses whitespace around a break rather than stacking it', () => {
    expect(texts('<p>One <br/> Two</p>')).toEqual(['One\nTwo'])
  })

  it('never opens or closes a block with a stray break', () => {
    expect(texts('<p><br/>One<br/></p>')).toEqual(['One'])
  })

  it('leaves a paragraph with no breaks exactly as it was', () => {
    expect(texts('<p>An ordinary sentence, unbroken.</p>')).toEqual([
      'An ordinary sentence, unbroken.',
    ])
  })

  it('keeps a link’s offsets correct across a break', () => {
    // The newline is a character like any other, so a link after one shifts by
    // it. Getting this wrong underlines the wrong words.
    const [block] = htmlToBlocks('<p>Before<br/>see <a href="#n1">note</a> here</p>')
    expect(block.text).toBe('Before\nsee note here')
    expect(block.links).toEqual([{ start: 11, end: 15, href: '#n1' }])
    expect(block.text.slice(11, 15)).toBe('note')
  })
})

describe('parseHtml — shares the assembler with markdown', () => {
  const source = [
    '<h1>Chapter One</h1>',
    '<p>Opening prose.</p>',
    '<h2>First Section</h2>',
    '<p>Section prose.</p>',
    '<h2>Second Section</h2>',
    '<p>More.</p>',
    '<h1>Chapter Two</h1>',
    '<p>Final.</p>',
  ].join('')

  const book = parseHtml(source, meta())

  it('resolves h1 as chapters and h2 as sections', () => {
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two'])
    expect(book.chapters[0].sections.map((s) => s.title)).toEqual([
      undefined,
      'First Section',
      'Second Section',
    ])
  })

  it('resolves levels from what is present, not from a fixed h1/h2', () => {
    const shifted = parseHtml('<h2>Alpha</h2><p>A.</p><h3>Sub</h3><p>B.</p><h2>Beta</h2>', meta())
    expect(shifted.chapters.map((c) => c.title)).toEqual(['Alpha', 'Beta'])
    expect(shifted.chapters[0].sections.map((s) => s.title)).toEqual([undefined, 'Sub'])
  })

  it('produces canonical, unique anchors', () => {
    const anchors = book.sections.flatMap((s) => s.paragraphs.map((p) => p.anchor))
    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every((a) => isAnchor(a))).toBe(true)
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it('is stable across two runs of identical input', () => {
    const again = parseHtml(source, meta())
    expect(again.sections).toEqual(book.sections)
  })

  it('falls back to bucketing when there are no headings', () => {
    const paragraphs = Array.from({ length: 25 }, (_, i) => `<p>Para ${i + 1}.</p>`).join('')
    const flat = parseHtml(paragraphs, meta())
    expect(flat.chapters).toHaveLength(1)
    expect(flat.sections[0].paragraphs).toHaveLength(20)
    expect(flat.sections[1].paragraphs).toHaveLength(5)
  })
})

/**
 * A dedication marks the enclosing *section*, not the paragraph inside it, so
 * reading the type off the paragraph alone found nothing and the book's opening
 * page was set as ordinary body text.
 */
describe('htmlToBlocks — parts of a book that are displayed, not read through', () => {
  it('labels a paragraph inside a dedication section', () => {
    const [block] = htmlToBlocks(
      '<section epub:type="dedication"><p>To L, and to B &amp; R.</p></section>',
    )
    expect(block.kind).toBe('prose')
    expect(block.label).toBe('dedication')
  })

  it('labels an epigraph the same way', () => {
    const [block] = htmlToBlocks('<div epub:type="epigraph"><p>Nothing comes from nothing.</p></div>')
    expect(block.label).toBe('epigraph')
  })

  it('does not leak the label out to the paragraphs that follow the section', () => {
    // The context has to end where the section ends, or the whole chapter after
    // a dedication would be centred and italic.
    const blocks = htmlToBlocks(
      '<section epub:type="dedication"><p>To L.</p></section><p>Chapter one begins.</p>',
    )
    expect(blocks.map((b) => b.label)).toEqual(['dedication', undefined])
  })

  it('leaves ordinary prose unlabelled', () => {
    const [block] = htmlToBlocks('<section><p>Ordinary prose.</p></section>')
    expect(block.label).toBeUndefined()
  })
})

describe('running heads the print edition left behind', () => {
  it('drops one that arrived as a paragraph', () => {
    const blocks = htmlToBlocks('<p>Introduction | 7</p><p>The real first line.</p>')
    expect(blocks.map((b) => b.kind)).toEqual(['furniture', 'prose'])
  })

  it('drops one that arrived as a heading', () => {
    // What a converter does with the line at the top of a printed page: it
    // looked like a heading, so it was marked up as one.
    const blocks = htmlToBlocks(
      '<h1>6 | You Are the One You’ve Been Waiting For</h1><p>The real first line.</p>',
    )
    expect(blocks.map((b) => b.kind)).toEqual(['furniture', 'prose'])
  })

  it('keeps a heading that is a real heading', () => {
    const blocks = htmlToBlocks('<h1>Chapter One</h1><h2>The Burdened Self</h2>')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'heading'])
  })
})

describe('a heading the book only set in bold', () => {
  it('reads a wholly bold paragraph as a heading', () => {
    // The real markup from a calibre conversion of print.
    const [block] = htmlToBlocks('<p class="calibre1"><b class="calibre4">The Three Projects</b></p>')
    expect(block.kind).toBe('heading')
    expect(block.text).toBe('The Three Projects')
  })

  it('takes <strong> as readily as <b>', () => {
    const [block] = htmlToBlocks('<p><strong>Cultural Constraints to Intimacy</strong></p>')
    expect(block.kind).toBe('heading')
  })

  it('keeps it a labelled paragraph where the document states its own structure', () => {
    // A real heading is the author speaking, and it always wins. The bold line
    // beneath it is a section of that chapter, not a rival division.
    const blocks = htmlToBlocks('<h1>Chapter One</h1><p><b>The Three Projects</b></p>')
    expect(blocks[1]).toMatchObject({ kind: 'prose', label: 'subheading' })
  })

  it('leaves a sentence with a bolded phrase in it', () => {
    const [block] = htmlToBlocks('<p>There is <b>another way</b>, and we will explore it.</p>')
    expect(block.label).toBeUndefined()
  })

  it('leaves a bold line that ends like a sentence', () => {
    const [block] = htmlToBlocks('<p><b>Do not skip this chapter.</b></p>')
    expect(block.label).toBeUndefined()
  })

  it('leaves a whole bold paragraph, which is emphasis and not a heading', () => {
    const long = `<p><b>${'This is a long stretch of text the author wanted stressed rather than a heading naming a section'}</b></p>`
    expect(htmlToBlocks(long)[0]!.label).toBeUndefined()
  })

  it('leaves ordinary prose', () => {
    expect(htmlToBlocks('<p>For reasons that will be discussed at length</p>')[0]!.label).toBeUndefined()
  })
})

describe('a contents entry is not a subheading', () => {
  it('leaves a bold line that ends in its page number', () => {
    const [block] = htmlToBlocks('<p><b>An Example of Growing Toward Self-Leadership 130</b></p>')
    expect(block.label).toBeUndefined()
  })

  it('reads a numbered chapter title as a heading, not as a contents line', () => {
    // A contents entry names something and then gives a page. A numbered title
    // is a label and a figure. Both end in a space and a number.
    for (const title of ['Chapter 1', 'Part 1', 'CHAPTER 26', 'Book 2']) {
      const [block] = htmlToBlocks(`<p><b>${title}</b></p>`)
      expect(block.kind, title).toBe('heading')
    }
  })
})

describe('loose inline content between block tags', () => {
  // A contents page built out of `<div>`s rather than `<p>`s is how a great many
  // converted epubs set one out. The text of such a run used to be flattened
  // with `textContent`, which is a second and much poorer reader of the same
  // markup: it kept the words and threw away everything that told them apart.
  const TOC =
    '<div class="toc_part"><a href="p01.htm"><strong>PART 1 APPROACHING THE UNCONSCIOUS</strong>' +
    '<br/>Carl G. Jung</a></div>'

  it('keeps the line break a `<br>` asks for', () => {
    const [block] = htmlToBlocks(TOC)
    expect(block!.text).toBe('PART 1 APPROACHING THE UNCONSCIOUS\nCarl G. Jung')
  })

  it('keeps the links', () => {
    const [block] = htmlToBlocks(TOC)
    expect(block!.links).toEqual([{ start: 0, end: 47, href: 'p01.htm' }])
  })

  it('keeps the emphasis', () => {
    const [block] = htmlToBlocks('<div>Plain and <em>emphatic</em>.</div>')
    expect(block!.text).toBe('Plain and emphatic.')
    expect(block!.marks).toEqual([{ start: 10, end: 18, italic: true }])
  })

  it('keeps the ids links point at', () => {
    const [block] = htmlToBlocks('<div><a id="note12">Loose text.</a></div>')
    expect(block!.ids).toEqual(['note12'])
  })
})

describe('the printed pages a book states', () => {
  it('gives a marker’s page to the block that follows it', () => {
    const blocks = htmlToBlocks(
      '<span epub:type="pagebreak" id="page7" title="7"></span><p>Page seven opens here.</p>',
    )
    expect(blocks[0]!.printedPage).toBe('7')
  })

  it('gives it to the paragraph it sits inside', () => {
    const blocks = htmlToBlocks('<p><span epub:type="pagebreak" title="8"></span>Page eight.</p>')
    expect(blocks[0]!.printedPage).toBe('8')
  })

  it('keeps roman front matter as the book wrote it', () => {
    const blocks = htmlToBlocks('<p><a id="page_xxvii" epub:type="pagebreak"></a>Contents</p>')
    expect(blocks[0]!.printedPage).toBe('xxvii')
  })

  it('reads the ARIA spelling too', () => {
    const blocks = htmlToBlocks('<span role="doc-pagebreak" title="41"></span><p>Text.</p>')
    expect(blocks[0]!.printedPage).toBe('41')
  })

  it('does not let a marker’s number into the prose', () => {
    const blocks = htmlToBlocks('<p>Half a<span epub:type="pagebreak" id="page9">9</span> sentence.</p>')
    expect(blocks[0]!.text).toBe('Half a sentence.')
  })

  it('says nothing about a book that carries no page numbers', () => {
    expect(htmlToBlocks('<p>Ordinary prose.</p>')[0]!.printedPage).toBeUndefined()
  })
})

describe('a page-break attribute on something that is not a marker', () => {
  it('keeps the content and still reads the number', () => {
    // A marker is empty, or holds its own page number. An element that wraps a
    // page of the book and happens to carry the attribute is a container, and
    // skipping it would delete that page to record a number about it.
    const blocks = htmlToBlocks(
      '<div epub:type="pagebreak" id="page12"><p>A whole page of real prose that must survive.</p></div>',
    )
    expect(blocks.map((block) => block.text)).toEqual(['A whole page of real prose that must survive.'])
    expect(blocks[0]!.printedPage).toBe('12')
  })
})
