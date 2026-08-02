// @vitest-environment jsdom
//
// Links, end to end through the parser: found in markup, carried through
// assembly, and resolved into permanent anchors. jsdom because the HTML front
// end needs a real DOM.

import { describe, expect, it } from 'vitest'

import type { BookMeta, Paragraph } from '../structure/index.ts'
import { htmlToBlocks, parseHtml } from './html.ts'

const meta: BookMeta = {
  id: 'b1' as BookMeta['id'],
  title: 'A Book',
  source: 'epub',
  type: 'dense-technical',
  importedAt: '2026-08-02T00:00:00.000Z',
}

function paragraphsOf(html: string): Paragraph[] {
  return parseHtml(html, meta).sections.flatMap((section) => section.paragraphs)
}

describe('finding links in markup', () => {
  it('records where the link sits, not a copy of its words', () => {
    const [block] = htmlToBlocks('<p>See <a href="#n1">the note</a> for more.</p>')

    expect(block.text).toBe('See the note for more.')
    expect(block.links).toEqual([{ start: 4, end: 12, href: '#n1' }])
    // The offsets have to name the right slice, or a link underlines the wrong
    // words — and a paragraph can easily contain the same word twice.
    expect(block.text.slice(4, 12)).toBe('the note')
  })

  it('keeps the sentence whole around the link', () => {
    // Splitting a paragraph at its links would shatter one thought into three
    // and anchor each piece separately.
    expect(htmlToBlocks('<p>a <a href="#x">b</a> c</p>')).toHaveLength(1)
  })

  it('collapses whitespace without moving the offsets', () => {
    const [block] = htmlToBlocks('<p>\n  See\n  <a href="#n1">the\n  note</a>.\n</p>')

    expect(block.text).toBe('See the note.')
    expect(block.text.slice(block.links![0].start, block.links![0].end)).toBe('the note')
  })

  it('ignores a link with no text to tap', () => {
    // `<a id="here"/>` is a bookmark target, not a link.
    expect(htmlToBlocks('<p>Text<a href="#x"></a></p>')[0].links).toBeUndefined()
  })

  it('records the ids that links point at', () => {
    expect(htmlToBlocks('<p id="n1">The note.</p>')[0].ids).toEqual(['n1'])
    expect(htmlToBlocks('<h2 id="ch3">Chapter Three</h2>')[0].ids).toEqual(['ch3'])
  })
})

describe('resolving a link to an anchor', () => {
  it('points at the paragraph that holds the id', () => {
    const paragraphs = paragraphsOf(
      '<p>See <a href="#n1">the note</a>.</p><p id="n1">The note itself.</p>',
    )

    expect(paragraphs[0].links?.[0].anchor).toBe(paragraphs[1].anchor)
    // Resolved links carry an anchor and nothing else — two answers to "where
    // does this go?" would invite a renderer to pick the wrong one.
    expect(paragraphs[0].links?.[0].url).toBeUndefined()
  })

  it('resolves a link that points forwards', () => {
    // The case that forces resolution to be a second pass: a footnote marker
    // points at a paragraph that does not exist yet when its own is assembled.
    const paragraphs = paragraphsOf(
      '<p><a href="#late">Marker</a></p>' +
        '<p>Filler.</p>'.repeat(30) +
        '<p id="late">The target.</p>',
    )

    const target = paragraphs.find((p) => p.text === 'The target.')
    expect(paragraphs[0].links?.[0].anchor).toBe(target?.anchor)
  })

  it('leaves a web address alone', () => {
    const paragraphs = paragraphsOf('<p><a href="https://example.com">Out</a></p>')

    expect(paragraphs[0].links?.[0].url).toBe('https://example.com')
    expect(paragraphs[0].links?.[0].anchor).toBeUndefined()
  })

  it('drops a link that points nowhere', () => {
    // Inert rather than rendered: a link that silently goes to the wrong place
    // is worse than one that was never offered.
    expect(paragraphsOf('<p><a href="#missing">Broken</a></p>')[0].links).toBeUndefined()
  })

  it('never lets ids reach storage', () => {
    // Thousands of rows of dead weight once the links are resolved.
    const paragraphs = paragraphsOf('<p id="n1">A note.</p>')
    expect(paragraphs[0].ids).toBeUndefined()
  })
})
