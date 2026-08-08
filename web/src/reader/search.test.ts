import { describe, expect, it } from 'vitest'

import { formatAnchor, sectionPath, type Section } from '../structure/index.ts'
import { MAX_HITS, searchBook } from './search.ts'

/** A section whose paragraphs are the strings given. */
function sectionOf(chapter: number, section: number, texts: string[]): Section {
  return {
    chapter,
    section,
    path: sectionPath(chapter, section),
    paragraphs: texts.map((text, index) => ({
      anchor: formatAnchor({ chapter, section, paragraph: index + 1 }),
      text,
      kind: 'prose' as const,
    })),
  }
}

/** A snippet as one string, so a case reads the way it looks on screen. */
const snippet = (hit: { before: string; match: string; after: string }) =>
  `${hit.before}[${hit.match}]${hit.after}`

describe('finding a word in a book', () => {
  it('finds it whatever the casing, and shows the book’s casing back', () => {
    const book = [sectionOf(1, 1, ['The Breath of the world.'])]
    const { hits } = searchBook(book, 'breath')

    expect(hits).toHaveLength(1)
    // Not 'breath': a reader should see the word as the book prints it.
    expect(hits[0]?.match).toBe('Breath')
  })

  it('counts every occurrence, not every paragraph', () => {
    // "3 results" has to mean three places, or the number is a lie.
    const book = [sectionOf(1, 1, ['A breath, a breath, and one more breath.'])]
    const { hits, total } = searchBook(book, 'breath')

    expect(total).toBe(3)
    expect(hits).toHaveLength(3)
    // All in the same paragraph, so all pointing at the same place.
    expect(new Set(hits.map((hit) => hit.anchor)).size).toBe(1)
    // But each is its own row, so each needs its own key.
    expect(new Set(hits.map((hit) => hit.key)).size).toBe(3)
  })

  it('reads in the book’s order', () => {
    const book = [
      sectionOf(1, 1, ['nose one']),
      sectionOf(1, 2, ['nose two']),
      sectionOf(2, 1, ['nose three']),
    ]
    const { hits } = searchBook(book, 'nose')

    expect(hits.map((hit) => [hit.chapter, hit.section])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ])
  })

  it('does not run away on a one-letter query', () => {
    // A single letter is tens of thousands of hits in a novel and answers
    // nothing. Below the floor, the answer is nothing at all.
    const book = [sectionOf(1, 1, ['a e i o u and everything else'])]
    expect(searchBook(book, 'e').total).toBe(0)
    expect(searchBook(book, '').total).toBe(0)
    expect(searchBook(book, '   ').total).toBe(0)
  })

  it('treats punctuation as text, not as a pattern', () => {
    // The one input where the haystack genuinely contains every character a
    // regular expression cares about.
    const book = [sectionOf(1, 1, ['He paused (briefly) and went on. a.b was next.'])]

    expect(searchBook(book, '(briefly)').total).toBe(1)
    expect(searchBook(book, 'a.b').total).toBe(1)
    // The regex reading of `a.b` would also match "and" ... no: it would match
    // 'a' + any + 'b'. Nothing here should match it beyond the literal.
    expect(searchBook(book, '.*').total).toBe(0)
  })

  it('matches across what was a line break in the source', () => {
    // Paragraph text arrives with the source's own wrapping in it.
    const book = [sectionOf(1, 1, ['the quick\n  brown fox'])]
    expect(searchBook(book, 'quick brown').total).toBe(1)
  })
})

describe('the snippet around a match', () => {
  it('shows the whole paragraph when it is short, with no ellipses', () => {
    const book = [sectionOf(1, 1, ['A short line about breath.'])]
    const { hits } = searchBook(book, 'breath')

    expect(snippet(hits[0]!)).toBe('A short line about [breath].')
  })

  it('cuts on word boundaries and marks where it cut', () => {
    const long =
      'The nose is not merely an ornament upon the face but the beginning of the entire respiratory system, and the breath that passes through it is shaped long before it ever reaches the lungs of the person doing the breathing.'
    const book = [sectionOf(1, 1, [long])]
    const { hits } = searchBook(book, 'breath that')

    const hit = hits[0]!
    expect(hit.before.startsWith('…')).toBe(true)
    expect(hit.after.endsWith('…')).toBe(true)

    // Whole words either side: what is shown is a real run of the sentence.
    const before = hit.before.slice(1)
    const after = hit.after.slice(0, -1)
    expect(long).toContain(before)
    expect(long).toContain(after)

    // And neither cut lands inside a word. The honest test is what sits on the
    // far side of the cut in the original: a space, or the end of the text.
    expect(long[long.indexOf(before) - 1]).toBe(' ')
    expect(long[long.indexOf(after) + after.length]).toBe(' ')
  })

  it('does not pretend text was cut when the match is at the very start', () => {
    const book = [sectionOf(1, 1, ['Breath is the beginning of it.'])]
    const { hits } = searchBook(book, 'breath')

    expect(hits[0]?.before).toBe('')
  })
})

describe('when a word is everywhere', () => {
  it('caps the list but still counts honestly', () => {
    // A common word in a long book. The interface has to be able to say "there
    // are more of these than you want to scroll", which needs the true total.
    const many = Array.from({ length: MAX_HITS + 50 }, () => 'the word here')
    const book = [sectionOf(1, 1, many)]
    const { hits, total, capped } = searchBook(book, 'word')

    expect(total).toBe(MAX_HITS + 50)
    expect(hits).toHaveLength(MAX_HITS)
    expect(capped).toBe(true)
  })

  it('says it did not cap when it did not', () => {
    const book = [sectionOf(1, 1, ['one word only'])]
    expect(searchBook(book, 'word').capped).toBe(false)
  })
})
