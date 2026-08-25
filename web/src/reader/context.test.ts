import { describe, expect, it } from 'vitest'

import { neighboursOf, passageContext, sentences } from './context.ts'
import type { PassageAnchor } from './tutor.ts'
import type { Anchor, BookMeta, Manifest, Paragraph, Section } from '../structure/index.ts'

function para(n: number, text: string, kind: Paragraph['kind'] = 'prose'): Paragraph {
  return { anchor: `[ch01-s01-p${String(n).padStart(3, '0')}]` as Anchor, text, kind }
}

const AT = (n: number) => `[ch01-s01-p${String(n).padStart(3, '0')}]` as Anchor

function passage(n: number, excerpt: string, kind: PassageAnchor['kind']): PassageAnchor {
  return { anchor: AT(n), excerpt, kind }
}

describe('sentences', () => {
  it('splits on end punctuation', () => {
    expect(sentences('One. Two! Three? Four')).toEqual(['One.', 'Two!', 'Three?', 'Four'])
  })

  it('keeps a closing quote with its sentence', () => {
    expect(sentences('He said “no.” She left.')).toEqual(['He said “no.”', 'She left.'])
  })

  it('drops empty parts', () => {
    expect(sentences('   ')).toEqual([])
  })
})

describe('neighboursOf — a whole paragraph', () => {
  const blocks = [para(1, 'First block.'), para(2, 'Middle block.'), para(3, 'Last block.')]

  it('takes the paragraph either side', () => {
    expect(neighboursOf(blocks, passage(2, 'Middle block.', 'paragraph'))).toEqual({
      before: 'First block.',
      after: 'Last block.',
    })
  })

  it('leaves out the side that does not exist', () => {
    expect(neighboursOf(blocks, passage(1, 'First block.', 'paragraph'))).toEqual({
      after: 'Middle block.',
    })
  })

  it('steps over a figure or a table', () => {
    const withFigure = [para(1, 'Prose one.'), para(2, 'Fig 3. A chart.', 'figure'), para(3, 'Prose two.')]
    expect(neighboursOf(withFigure, passage(3, 'Prose two.', 'paragraph'))).toEqual({
      before: 'Prose one.',
    })
  })

  it('returns nothing when the anchor is not on this page', () => {
    expect(neighboursOf(blocks, passage(9, 'Elsewhere.', 'paragraph'))).toEqual({})
  })
})

describe('neighboursOf — one sentence', () => {
  const blocks = [
    para(1, 'Before block.'),
    para(2, 'One. Two. Three.'),
    para(3, 'After block.'),
  ]

  it('takes the sentences either side, inside the paragraph', () => {
    expect(neighboursOf(blocks, passage(2, 'Two.', 'sentence'))).toEqual({
      before: 'One.',
      after: 'Three.',
    })
  })

  it('reaches into the previous paragraph for the first sentence', () => {
    expect(neighboursOf(blocks, passage(2, 'One.', 'sentence'))).toEqual({
      before: 'Before block.',
      after: 'Two. Three.',
    })
  })

  it('reaches into the next paragraph for the last sentence', () => {
    expect(neighboursOf(blocks, passage(2, 'Three.', 'sentence'))).toEqual({
      before: 'One. Two.',
      after: 'After block.',
    })
  })

  it('falls back to the whole paragraph when the words do not match', () => {
    expect(neighboursOf(blocks, passage(2, 'One.  Two', 'sentence'))).toEqual({
      before: 'One. Two. Three.',
      after: 'After block.',
    })
  })
})

describe('neighboursOf — long neighbours', () => {
  it('caps a long neighbour and marks the cut', () => {
    const long = 'x'.repeat(2000)
    const blocks = [para(1, long), para(2, 'Here.'), para(3, long)]
    const { before, after } = neighboursOf(blocks, passage(2, 'Here.', 'paragraph'))
    expect(before?.length).toBe(601)
    expect(before?.startsWith('…')).toBe(true)
    expect(after?.length).toBe(601)
    expect(after?.endsWith('…')).toBe(true)
  })
})

describe('passageContext', () => {
  const book = { id: 'b', title: 'Memories', author: 'C. G. Jung' } as BookMeta
  const manifest = {
    bookId: 'b',
    title: 'Memories',
    chapters: [{ chapter: 1, title: 'First Years', summary: '' }],
  } as Manifest
  const section: Section = {
    chapter: 1,
    section: 1,
    path: 'ch01/s01' as Section['path'],
    title: 'The Cathedral',
    paragraphs: [para(1, 'Before.'), para(2, 'Here.'), para(3, 'After.')],
  }

  it('names the book, the place, and the text either side', () => {
    expect(passageContext(book, manifest, section, passage(2, 'Here.', 'paragraph'))).toEqual({
      title: 'Memories',
      author: 'C. G. Jung',
      chapter: 'First Years',
      section: 'The Cathedral',
      before: 'Before.',
      after: 'After.',
    })
  })

  it('keeps the book when there is no section on screen', () => {
    expect(passageContext(book, manifest, undefined, passage(2, 'Here.', 'paragraph'))).toEqual({
      title: 'Memories',
      author: 'C. G. Jung',
    })
  })

  it('leaves out a title the book does not carry', () => {
    const plain = { id: 'b', title: 'Untitled' } as BookMeta
    const bare: Section = { ...section, title: undefined }
    const got = passageContext(plain, manifest, bare, passage(2, 'Here.', 'paragraph'))
    expect(got.author).toBeUndefined()
    expect(got.section).toBeUndefined()
    expect(got.chapter).toBe('First Years')
  })
})

describe('neighboursOf — a figure', () => {
  /*
   * A figure's own "text" is the parser's placeholder, so there are no
   * sentences in it to sit between. What explains a plate is the prose either
   * side of it, which is what a tapped paragraph already takes.
   */
  const blocks = [
    para(1, 'The prose before the plate.'),
    para(2, '[Figure: Figure 1. A mandala.]', 'figure'),
    para(3, 'The prose after the plate.'),
  ]

  it('takes the prose either side, as a paragraph does', () => {
    expect(neighboursOf(blocks, passage(2, 'Figure 1. A mandala.', 'figure'))).toEqual({
      before: 'The prose before the plate.',
      after: 'The prose after the plate.',
    })
  })

  it('does not hunt for its caption inside the placeholder', () => {
    // The caption is not a substring of the placeholder in every book, and the
    // sentence path would have answered with the placeholder itself.
    const found = neighboursOf(blocks, passage(2, 'A caption the block does not hold', 'figure'))
    expect(found.before).toBe('The prose before the plate.')
  })

  it('is empty for a figure that is not in this section', () => {
    expect(neighboursOf(blocks, passage(9, 'Figure 9.', 'figure'))).toEqual({})
  })
})
