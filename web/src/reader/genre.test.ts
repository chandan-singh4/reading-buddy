/**
 * Which chips a book earns.
 *
 * The rule that matters is the wrong-chip rule: "Still true?" must never appear
 * on a novel and "What's happening here?" must never appear on a textbook. Both
 * are silent failures — the model answers, warmly and at length, about
 * something that is not there.
 *
 * The order of the guess matters as much as the guess. The reader's own answer
 * outranks the publisher's headings, which outrank the catalogue's coarse
 * label, which outranks the app's own two-way split.
 */

import { describe, expect, it } from 'vitest'

import { GENRE_INTENTS, genreOf, intentsFor, isBookGenre } from './genre.ts'
import type { BookMeta } from '../structure/index.ts'

function book(over: Partial<BookMeta>): BookMeta {
  return {
    id: 'b1' as never,
    title: 'A book',
    source: 'epub',
    type: 'dense-technical',
    ...over,
  } as BookMeta
}

const NEUTRAL = ['simply', 'friend', 'discuss', 'define'] as const

describe('what kind of book it is', () => {
  it('takes the reader’s own answer over everything else', () => {
    const said = book({ tutorGenre: 'poetry', subjects: ['Fiction / Thrillers'], genre: 'Fiction' })
    expect(genreOf(said)).toBe('poetry')
  })

  it('reads the publisher’s headings before the catalogue’s label', () => {
    // Google calls a history book "Non-fiction", which would earn the science
    // chip. The heading is finer and says what the book actually is.
    const meta = book({ subjects: ['History / Europe / Medieval'], genre: 'Non-fiction' })
    expect(genreOf(meta)).toBe('history')
  })

  it('tests the narrow kinds before the broad ones', () => {
    expect(genreOf(book({ subjects: ['Philosophy / Ethics'] }))).toBe('poetry')
    expect(genreOf(book({ subjects: ['Science / Life Sciences'] }))).toBe('nonfiction')
  })

  it('falls back to the catalogue label, then to the app’s own split', () => {
    expect(genreOf(book({ genre: 'Juvenile Fiction' }))).toBe('fiction')
    expect(genreOf(book({ genre: 'Non-fiction' }))).toBe('nonfiction')
    expect(genreOf(book({ type: 'light-fiction' }))).toBe('fiction')
    expect(genreOf(book({ type: 'dense-technical' }))).toBe('nonfiction')
  })

  it('says general when it knows nothing, and for no book at all', () => {
    expect(genreOf(undefined)).toBe('general')
  })
})

describe('the chips a genre earns', () => {
  it('never offers a novel a claim to fact-check', () => {
    expect(GENRE_INTENTS.fiction).not.toContain('stilltrue')
    expect(intentsFor('fiction', NEUTRAL)).toEqual([...NEUTRAL, 'happening'])
  })

  it('never offers a textbook a scene to be oriented in', () => {
    expect(GENRE_INTENTS.nonfiction).not.toContain('happening')
    expect(GENRE_INTENTS.history).not.toContain('happening')
  })

  it('keeps the row to six, which is a phone’s whole budget', () => {
    for (const extra of Object.values(GENRE_INTENTS)) {
      expect(intentsFor('general', NEUTRAL).length + extra.length).toBeLessThanOrEqual(6)
    }
  })

  it('gives a book it knows nothing about the four that suit anything', () => {
    expect(intentsFor('general', NEUTRAL)).toEqual([...NEUTRAL])
  })
})

describe('reading a stored word back', () => {
  it('accepts our own words and refuses anything else', () => {
    expect(isBookGenre('poetry')).toBe(true)
    expect(isBookGenre('Fiction')).toBe(false)
    expect(isBookGenre(null)).toBe(false)
  })
})
