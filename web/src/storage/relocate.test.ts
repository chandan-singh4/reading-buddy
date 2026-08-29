// The marks that have to survive a re-parse. The cases here are the ones that
// actually happened to a reader's copy of Man and His Symbols.

import { describe, expect, it } from 'vitest'

import { placesIn, relocate } from './relocate.ts'
import type { Anchor, Paragraph, Section } from '../structure/index.ts'
import { formatAnchor, sectionPath } from '../structure/index.ts'

/** A section of prose, anchored exactly as the parser anchors it. */
function section(chapter: number, number: number, texts: string[], title?: string): Section {
  const paragraphs: Paragraph[] = texts.map((text, index) => ({
    anchor: formatAnchor({ chapter, section: number, paragraph: index + 1 }),
    kind: 'prose',
    text,
  }))
  return { chapter, section: number, path: sectionPath(chapter, number), title, paragraphs }
}

const JUNG =
  'Yet in order to sustain his creed, contemporary man pays the price in a remarkable lack of introspection.'

/** The book after the split: the passage moved out of s06 and into s07. */
const after = placesIn([
  section(6, 6, ['The problem of types opens here.'], 'The problem of types'),
  section(6, 7, ['A page of the archetype.', JUNG], 'The archetype in dream symbolism'),
  section(6, 8, ['What we call civilized consciousness.'], 'The soul of man'),
])

describe('relocate', () => {
  it('finds a highlight the split moved into another section', () => {
    // The reader marked this in ch06-s06-p050. The parser now calls it
    // ch06-s07-p002, and nothing about the words changed.
    const found = relocate(after, formatAnchor({ chapter: 6, section: 6, paragraph: 50 }), JUNG)
    expect(found).toBe(formatAnchor({ chapter: 6, section: 7, paragraph: 2 }))
  })

  it('leaves a mark alone when its anchor is still right', () => {
    const here = formatAnchor({ chapter: 6, section: 8, paragraph: 1 })
    expect(relocate(after, here, 'What we call civilized consciousness.')).toBe(here)
  })

  it('is not stopped by curly quotes or a stray line break', () => {
    // The stored quote and the book's own text disagree about typography, which
    // a parser change can cause without altering a word.
    const marked = 'in order to sustain his   creed,\ncontemporary man'
    expect(relocate(after, formatAnchor({ chapter: 6, section: 6, paragraph: 9 }), marked)).toBe(
      formatAnchor({ chapter: 6, section: 7, paragraph: 2 }),
    )
  })

  it('says nothing rather than guessing when the words are gone', () => {
    const found = relocate(after, formatAnchor({ chapter: 6, section: 6, paragraph: 1 }), 'A passage this book does not contain')
    expect(found).toBeUndefined()
  })

  it('takes the nearest copy when a passage appears more than once', () => {
    const twice = placesIn([
      section(1, 1, ['the same words twice over', 'filler']),
      section(9, 1, ['filler', 'the same words twice over']),
    ])
    const found = relocate(twice, formatAnchor({ chapter: 9, section: 1, paragraph: 5 }), 'the same words twice over')
    expect(found).toBe(formatAnchor({ chapter: 9, section: 1, paragraph: 2 }))
  })

  it('keeps a short quote inside the chapter it was made in', () => {
    // "dreams" is six characters and honestly appears everywhere. A mark made in
    // chapter 6 must not be dragged into chapter 1 by it.
    const both = placesIn([
      section(1, 1, ['dreams, early on']),
      section(6, 1, ['dreams, much later']),
    ])
    const found = relocate(both, formatAnchor({ chapter: 6, section: 1, paragraph: 1 }), 'dreams')
    expect(found).toBe(formatAnchor({ chapter: 6, section: 1, paragraph: 1 }))
  })

  it('has nothing to say about an empty quote', () => {
    expect(relocate(after, formatAnchor({ chapter: 6, section: 6, paragraph: 1 }), '   ')).toBeUndefined()
  })

  it('still answers for a mark whose anchor cannot be read', () => {
    // Old rows exist. An unreadable anchor is no reason to lose the words.
    expect(relocate(after, 'not-an-anchor' as Anchor, JUNG)).toBe(
      formatAnchor({ chapter: 6, section: 7, paragraph: 2 }),
    )
  })
})
