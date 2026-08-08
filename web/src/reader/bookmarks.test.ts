import { describe, expect, it } from 'vitest'

import type { Anchor } from '../structure/index.ts'
import { bookmarkOn, inBookOrder, labelFor } from './bookmarks.ts'

/**
 * A bookmark at a place. Takes the anchor's *inside* and adds the brackets, so
 * the cases below read as coordinates rather than as punctuation — an anchor is
 * `[ch02-s03-p013]`, brackets included, and forgetting them is the one way to
 * write a test that quietly checks nothing.
 */
const at = (coords: string, addedAt = '2026-01-01T00:00:00.000Z') => ({
  id: coords,
  anchor: `[${coords}]` as Anchor,
  label: coords,
  addedAt,
})

/** The anchors of a list, without their brackets, for readable expectations. */
const order = (bookmarks: readonly { anchor: Anchor }[]) =>
  bookmarks.map((b) => b.anchor.replace(/^\[|\]$/g, ''))

describe('naming a bookmark the reader did not name', () => {
  it('uses the paragraph as-is when it is short enough', () => {
    expect(labelFor('A short opening.')).toBe('A short opening.')
  })

  it('collapses the whitespace a parser leaves behind', () => {
    // Paragraph text arrives with the source's line breaks in it, and a label
    // is one line.
    expect(labelFor('  Two   lines\n  of it.  ')).toBe('Two lines of it.')
  })

  it('cuts on a word boundary, never mid-word', () => {
    const long =
      'The nose is not merely an ornament on the face but the beginning of the entire respiratory system'
    const label = labelFor(long)

    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThanOrEqual(61)
    // The giveaway that it cut properly: what is left is whole words.
    expect(long.startsWith(label.slice(0, -1))).toBe(true)
    expect(label).not.toMatch(/\s…$/)
  })

  it('hard-cuts a single word with nowhere to break', () => {
    const label = labelFor('a'.repeat(120))
    expect(label).toBe(`${'a'.repeat(60)}…`)
  })

  it('never hands back an empty name', () => {
    // A figure with no caption, or a paragraph that is only whitespace. A blank
    // row in the list reads as the app having lost something.
    expect(labelFor('   ')).toBe('Bookmark')
    expect(labelFor('')).toBe('Bookmark')
  })
})

describe('the order a bookmark list reads in', () => {
  it('is the book’s order, not the order they were made', () => {
    const made = [
      at('ch05-s01-p002', '2026-01-03T00:00:00.000Z'),
      at('ch01-s01-p001', '2026-01-09T00:00:00.000Z'),
      at('ch02-s03-p013', '2026-01-01T00:00:00.000Z'),
    ]

    expect(order(inBookOrder(made))).toEqual(['ch01-s01-p001', 'ch02-s03-p013', 'ch05-s01-p002'])
  })

  it('sorts by number, not by the text of the anchor', () => {
    // The trap a string sort falls into: '10' sorts before '2'.
    const made = [at('ch10-s01-p001'), at('ch02-s01-p001'), at('ch01-s10-p001'), at('ch01-s02-p001')]

    expect(order(inBookOrder(made))).toEqual([
      'ch01-s02-p001',
      'ch01-s10-p001',
      'ch02-s01-p001',
      'ch10-s01-p001',
    ])
  })

  it('breaks a tie on the same paragraph by when it was made', () => {
    const made = [
      at('ch01-s01-p001', '2026-02-02T00:00:00.000Z'),
      at('ch01-s01-p001', '2026-01-01T00:00:00.000Z'),
    ]
    expect(inBookOrder(made).map((b) => b.addedAt)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-02T00:00:00.000Z',
    ])
  })

  it('keeps a bookmark whose anchor is broken, at the end', () => {
    // Written by an older build, or edited by hand. Dropping it would decide on
    // the reader's behalf that a mark they made never existed.
    const made = [at('not-an-anchor'), at('ch03-s01-p001')]

    expect(order(inBookOrder(made))).toEqual(['ch03-s01-p001', 'not-an-anchor'])
  })

  it('does not disturb the list it was given', () => {
    const made = [at('ch05-s01-p001'), at('ch01-s01-p001')]
    inBookOrder(made)
    expect(order(made)).toEqual(['ch05-s01-p001', 'ch01-s01-p001'])
  })
})

describe('whether the page in front of the reader is marked', () => {
  const marks = [at('ch02-s03-p013'), at('ch05-s01-p002')]

  it('finds the mark on this paragraph', () => {
    expect(bookmarkOn(marks, '[ch02-s03-p013]' as Anchor)?.anchor).toBe('[ch02-s03-p013]')
  })

  it('says no for a paragraph with no mark', () => {
    expect(bookmarkOn(marks, '[ch02-s03-p014]' as Anchor)).toBeUndefined()
  })

  it('says no before the reader has landed anywhere', () => {
    // `anchorHere` is unset until the first paint settles; the ribbon must read
    // as unmarked rather than throwing.
    expect(bookmarkOn(marks, undefined)).toBeUndefined()
  })
})
