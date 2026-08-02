import { describe, expect, it } from 'vitest'

import type { ParsedBook } from '../storage/index.ts'
import type { Anchor, BookId, Paragraph, SectionPath } from '../structure/index.ts'
import { shelfFor, shelfOf } from './shelf.ts'

/** A parsed book carrying `texts` as its opening blocks — all `shelfFor` reads. */
function bookOf(texts: string[]): ParsedBook {
  const paragraphs: Paragraph[] = texts.map((text, index) => ({
    anchor: `[ch01-s01-p${String(index + 1).padStart(3, '0')}]` as Anchor,
    text,
    kind: 'prose',
  }))

  return {
    meta: {
      id: 'b1' as BookId,
      title: 'Untitled',
      source: 'pdf',
      type: 'dense-technical',
      importedAt: '2026-08-02T00:00:00.000Z',
    },
    manifest: { bookId: 'b1' as BookId, title: 'Untitled', chapters: [] },
    chapters: [],
    sections: [
      { chapter: 1, section: 1, path: 'ch01/s01' as SectionPath, paragraphs },
    ],
  }
}

const NOVEL_OPENING = [
  'Chapter One',
  'It was a bright cold day in April, and the clocks were striking thirteen.',
  'Winston Smith slipped quickly through the glass doors.',
]

describe('the format decides when the text says nothing', () => {
  it('files an epub as a book', () => {
    expect(shelfFor('epub', bookOf(NOVEL_OPENING))).toBe('book')
  })

  it('files markdown and plain text as documents', () => {
    expect(shelfFor('md', bookOf(['# Notes', 'Some thoughts.']))).toBe('document')
    expect(shelfFor('txt', bookOf(['Some thoughts.']))).toBe('document')
  })

  it('files an ordinary pdf as a book', () => {
    expect(shelfFor('pdf', bookOf(NOVEL_OPENING))).toBe('book')
  })

  it('files an ordinary docx as a document', () => {
    expect(shelfFor('docx', bookOf(['Meeting notes', 'Discussed the roadmap.']))).toBe(
      'document',
    )
  })

  it('never inspects an epub, so a quoted doi cannot move a novel', () => {
    // The signals are only trustworthy on the formats papers actually use. A
    // book *about* research quotes all of these and is still a book.
    expect(shelfFor('epub', bookOf(['A note on sources', 'See doi: 10.1000/182.']))).toBe(
      'book',
    )
  })
})

describe('a research paper is recognised from its first page', () => {
  it.each([
    ['a doi', 'doi: 10.1038/s42240-024-00169-w'],
    ['a doi url', 'https://doi.org/10.1038/s42240-024-00169-w'],
    ['an arxiv id', 'arXiv: 2401.01234v2'],
    ['an abstract', 'Abstract'],
    ['keywords', 'Keywords: retrieval, anchoring, evaluation'],
    ['a preprint notice', 'This is a preprint and has not been peer reviewed.'],
  ])('on %s alone', (_label, signal) => {
    expect(shelfFor('pdf', bookOf(['A Study of Something', signal]))).toBe('paper')
  })

  it('on two weaker signals together', () => {
    expect(
      shelfFor('pdf', bookOf(['Department of Computer Science', 'Received: 3 January 2026'])),
    ).toBe('paper')
  })

  it('but not on one weak signal alone', () => {
    // "University" turns up on the copyright page of a great many books, and a
    // false move is more annoying than a missed one — the shelf is wrong in a
    // place the reader has to go and fix.
    expect(shelfFor('pdf', bookOf(['Oxford University Press', ...NOVEL_OPENING]))).toBe('book')
  })

  it('in a docx as well as a pdf', () => {
    expect(shelfFor('docx', bookOf(['Our Paper', 'Abstract']))).toBe('paper')
  })

  it('only from the opening, so a bibliography late on is ignored', () => {
    const longBook = [...Array<string>(60).fill('Ordinary narrative prose.'), 'doi: 10.1000/182']
    expect(shelfFor('pdf', bookOf(longBook))).toBe('book')
  })
})

describe('reading a shelf back', () => {
  it('uses the stored shelf when there is one', () => {
    expect(shelfOf({ shelf: 'paper', source: 'epub' })).toBe('paper')
  })

  it('falls back to the format for books imported before shelves existed', () => {
    // No migration, on purpose: the fallback is as good as the original guess
    // would have been, and the reader can move it either way.
    expect(shelfOf({ source: 'epub' })).toBe('book')
    expect(shelfOf({ source: 'txt' })).toBe('document')
  })

  it('respects a shelf the reader chose, even one the guesser would not pick', () => {
    expect(shelfOf({ shelf: 'document', source: 'epub' })).toBe('document')
  })
})
