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
