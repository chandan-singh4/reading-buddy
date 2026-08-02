import { describe, expect, it } from 'vitest'

import type { BookId, BookMeta } from '../structure/index.ts'
import { isAnchor } from '../structure/index.ts'
import { parseTxt, txtToBlocks } from './index.ts'

function meta(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1' as BookId,
    title: 'Test Book',
    source: 'txt',
    type: 'light-fiction',
    importedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('txtToBlocks — paragraphs', () => {
  it('splits on blank lines and rejoins soft-wrapped lines', () => {
    const source = 'A paragraph that is\nwrapped across lines.\n\nA second paragraph.'
    expect(txtToBlocks(source)).toEqual([
      { kind: 'prose', text: 'A paragraph that is wrapped across lines.' },
      { kind: 'prose', text: 'A second paragraph.' },
    ])
  })

  it('tolerates CRLF endings and runs of blank lines', () => {
    expect(txtToBlocks('One.\r\n\r\n\r\n   \r\n\r\nTwo.')).toEqual([
      { kind: 'prose', text: 'One.' },
      { kind: 'prose', text: 'Two.' },
    ])
  })

  it('returns nothing for empty or whitespace-only input', () => {
    expect(txtToBlocks('')).toEqual([])
    expect(txtToBlocks('   \n\n  \n')).toEqual([])
  })
})

describe('txtToBlocks — heading detection', () => {
  it('recognises CHAPTER lines', () => {
    expect(txtToBlocks('CHAPTER I\n\nProse.')[0]).toEqual({
      kind: 'heading',
      level: 2,
      text: 'CHAPTER I',
    })
  })

  it('ranks PART above CHAPTER so both levels survive', () => {
    const blocks = txtToBlocks('PART ONE\n\nCHAPTER I\n\nProse.')
    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : 'text'))).toEqual([1, 2, 'text'])
  })

  it('recognises a shouted title', () => {
    expect(txtToBlocks('THE BEGINNING\n\nProse.')[0]).toEqual({
      kind: 'heading',
      level: 2,
      text: 'THE BEGINNING',
    })
  })

  it('strips a single trailing period from a heading', () => {
    const [block] = txtToBlocks('CHAPTER I.\n\nProse.')
    expect(block).toEqual({ kind: 'heading', level: 2, text: 'CHAPTER I' })
  })

  // The asymmetric-risk cases: a false positive permanently mis-anchors prose.
  it('does not promote a sentence that merely starts with "Chapter"', () => {
    const source = 'Chapter four was the one he remembered most vividly of all.'
    expect(txtToBlocks(source)).toEqual([{ kind: 'prose', text: source }])
  })

  it('does not promote a long line', () => {
    const source = `PART ${'X'.repeat(80)}`
    expect(txtToBlocks(source)[0].kind).toBe('prose')
  })

  it('does not promote a wrapped two-line paragraph', () => {
    expect(txtToBlocks('CHAPTER ONE\nand then some prose followed')[0].kind).toBe('prose')
  })

  it('does not promote a scene-break rule', () => {
    expect(txtToBlocks('* * *')[0].kind).toBe('prose')
    expect(txtToBlocks('---')[0].kind).toBe('prose')
  })

  it('does not promote a line ending in a comma or colon', () => {
    expect(txtToBlocks('AND THEN, ')[0].kind).toBe('prose')
    expect(txtToBlocks('IN SUMMARY:')[0].kind).toBe('prose')
  })
})

describe('parseTxt', () => {
  it('builds chapters from detected headings', () => {
    const book = parseTxt('CHAPTER I\n\nFirst.\n\nCHAPTER II\n\nSecond.', meta())
    expect(book.chapters.map((c) => c.title)).toEqual(['CHAPTER I', 'CHAPTER II'])
    expect(book.sections.flatMap((s) => s.paragraphs.map((p) => p.text))).toEqual([
      'First.',
      'Second.',
    ])
  })

  it('falls back to bucketing when the text has no headings at all', () => {
    const source = Array.from({ length: 25 }, (_, i) => `Paragraph ${i + 1}.`).join('\n\n')
    const book = parseTxt(source, meta())
    expect(book.chapters).toHaveLength(1)
    expect(book.sections[0].paragraphs).toHaveLength(20)
    expect(book.sections[1].paragraphs).toHaveLength(5)
  })

  it('records the source format', () => {
    expect(parseTxt('Prose.', meta({ source: 'md' })).meta.source).toBe('txt')
  })

  it('produces canonical, unique, stable anchors', () => {
    const source = 'PART ONE\n\nCHAPTER I\n\nFirst.\n\nCHAPTER II\n\nSecond.'
    const first = parseTxt(source, meta())
    const second = parseTxt(source, meta())
    const anchors = first.sections.flatMap((s) => s.paragraphs.map((p) => p.anchor))

    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every((a) => isAnchor(a))).toBe(true)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(second.sections).toEqual(first.sections)
  })
})
