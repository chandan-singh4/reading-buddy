import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { isAnchor } from '../structure/index.ts'
import { parseMarkdown } from './index.ts'

function meta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1' as BookId,
    title: 'Test Book',
    source: 'md',
    type: 'dense-technical',
    importedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Every paragraph in the book, in document order. */
function allText(book: ReturnType<typeof parseMarkdown>): string[] {
  return book.sections.flatMap((section) => section.paragraphs.map((p) => p.text))
}

describe('parseMarkdown — a normal # / ## document', () => {
  const source = [
    '# Chapter One',
    '',
    'Opening prose before any section.',
    '',
    '## First Section',
    '',
    'A paragraph that is',
    'wrapped across lines.',
    '',
    'A second paragraph.',
    '',
    '## Second Section',
    '',
    'More prose.',
    '',
    '# Chapter Two',
    '',
    '## Only Section',
    '',
    'Final prose.',
  ].join('\n')

  const book = parseMarkdown(source, meta())

  it('treats # as chapters and ## as sections', () => {
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0].title).toBe('Chapter One')
    expect(book.chapters[1].title).toBe('Chapter Two')
    expect(book.chapters[0].sections.map((s) => s.title)).toEqual([
      undefined,
      'First Section',
      'Second Section',
    ])
  })

  it('keeps prose that appears before the first section heading', () => {
    const opening = book.sections[0]
    expect(opening.title).toBeUndefined()
    expect(opening.paragraphs[0].text).toBe('Opening prose before any section.')
  })

  it('joins wrapped lines into a single paragraph', () => {
    expect(allText(book)).toContain('A paragraph that is wrapped across lines.')
  })

  it('addresses sections by path and numbers them within their chapter', () => {
    const paths = book.sections.map((s) => s.path)
    expect(paths).toEqual(['ch01/s01', 'ch01/s02', 'ch01/s03', 'ch02/s01'])
  })

  it('emits a manifest line per chapter, with summaries left for WP-09', () => {
    expect(book.manifest.chapters).toHaveLength(2)
    expect(book.manifest.chapters.every((c) => c.summary === '')).toBe(true)
  })
})

describe('parseMarkdown — a ## / ### document', () => {
  const source = [
    '## Alpha',
    '',
    'Alpha prose.',
    '',
    '### Alpha One',
    '',
    'Nested prose.',
    '',
    '## Beta',
    '',
    'Beta prose.',
  ].join('\n')

  const book = parseMarkdown(source, meta())

  it('resolves levels from what is present, not from a fixed # / ##', () => {
    expect(book.chapters.map((c) => c.title)).toEqual(['Alpha', 'Beta'])
    expect(book.chapters[0].sections.map((s) => s.title)).toEqual([undefined, 'Alpha One'])
  })

  it('anchors the first paragraph of the book at chapter 1, section 1', () => {
    expect(book.sections[0].paragraphs[0].anchor).toBe('[ch01-s01-p001]')
  })
})

describe('parseMarkdown — a heading-free document (fallback)', () => {
  const paragraphCount = 25
  const source = Array.from(
    { length: paragraphCount },
    (_, i) => `Paragraph number ${i + 1}.`,
  ).join('\n\n')

  const book = parseMarkdown(source, meta())

  it('still produces an addressable book', () => {
    expect(book.chapters).toHaveLength(1)
    expect(book.sections.length).toBeGreaterThan(1)
    expect(allText(book)).toHaveLength(paragraphCount)
  })

  it('buckets paragraphs into fixed-size sections', () => {
    expect(book.sections[0].paragraphs).toHaveLength(20)
    expect(book.sections[1].paragraphs).toHaveLength(5)
  })

  it('restarts paragraph numbering in each section', () => {
    expect(book.sections[1].paragraphs[0].anchor).toBe('[ch01-s02-p001]')
  })
})

describe('parseMarkdown — anchors', () => {
  const source = [
    '# One',
    '',
    'First.',
    '',
    '## Sub',
    '',
    'Second.',
    '',
    '# Two',
    '',
    'Third.',
  ].join('\n')

  it('is stable across two runs of identical input', () => {
    const first = parseMarkdown(source, meta())
    const second = parseMarkdown(source, meta())
    expect(allAnchors(second)).toEqual(allAnchors(first))
  })

  it('produces only canonical anchors', () => {
    const book = parseMarkdown(source, meta())
    const anchors = allAnchors(book)
    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every((anchor) => isAnchor(anchor))).toBe(true)
  })

  it('never repeats an anchor within a book', () => {
    const anchors = allAnchors(parseMarkdown(source, meta()))
    expect(new Set(anchors).size).toBe(anchors.length)
  })
})

function allAnchors(book: ReturnType<typeof parseMarkdown>): string[] {
  return book.sections.flatMap((section) => section.paragraphs.map((p) => p.anchor))
}

describe('parseMarkdown — code fences', () => {
  it('does not mistake a # comment inside a fence for a chapter break', () => {
    const source = [
      '# Real Chapter',
      '',
      'Prose.',
      '',
      '```py',
      '# not a heading',
      'x = 1',
      '```',
      '',
      'More prose.',
    ].join('\n')

    const book = parseMarkdown(source, meta())
    expect(book.chapters).toHaveLength(1)

    const code = book.sections
      .flatMap((section) => section.paragraphs)
      .find((paragraph) => paragraph.kind === 'code')
    expect(code?.text).toBe('# not a heading\nx = 1')
    expect(code?.label).toBe('py')
  })
})

describe('parseMarkdown — edge cases', () => {
  it('handles an empty document without throwing', () => {
    const book = parseMarkdown('', meta())
    expect(book.chapters).toEqual([])
    expect(book.sections).toEqual([])
    expect(book.manifest.chapters).toEqual([])
  })

  it('files prose that precedes any heading under an opening chapter', () => {
    const book = parseMarkdown('Loose prose.\n\n# Later\n\nMore.', meta())
    expect(book.chapters[0].title).toBe('Test Book')
    expect(book.sections[0].paragraphs[0].text).toBe('Loose prose.')
  })

  it('normalises CRLF line endings', () => {
    const book = parseMarkdown('# One\r\n\r\nProse.\r\n', meta())
    expect(book.chapters[0].title).toBe('One')
    expect(allText(book)).toEqual(['Prose.'])
  })
})
