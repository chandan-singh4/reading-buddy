// @vitest-environment jsdom

/**
 * Finding a stored quote again in the page.
 *
 * The only part of drawing a highlight that can be tested without a layout
 * engine — and the part that decides whether anything is drawn at all.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { parseAnchor, type Anchor } from '../structure/index.ts'
import { rangeOfQuote } from './selection.ts'

/** The branded anchor these tests keep asking for. Parsed, so a typo throws. */
function at(value: string): Anchor {
  parseAnchor(value)
  return value as Anchor
}

function paragraph(html: string, id = 'ch01-s01-p001') {
  const element = document.createElement('p')
  element.id = id
  element.innerHTML = html
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('rangeOfQuote', () => {
  it('finds plain words in the paragraph they were taken from', () => {
    paragraph('It was the best of times.')
    const range = rangeOfQuote(at('[ch01-s01-p001]'), 'the best')
    expect(range?.toString()).toBe('the best')
  })

  it('finds words that run across an italic or a link', () => {
    paragraph('It was the <em>best</em> of times.')
    const range = rangeOfQuote(at('[ch01-s01-p001]'), 'the best of')
    expect(range?.toString()).toBe('the best of')
  })

  it('matches although the page has line breaks the stored quote does not', () => {
    paragraph('It was\n   the best\n of times.')
    const range = rangeOfQuote(at('[ch01-s01-p001]'), 'the best of')
    // The page's own whitespace comes back with it. The words are what matter.
    expect(range?.toString().replace(/\s+/g, ' ')).toBe('the best of')
  })

  it('finds the whole paragraph', () => {
    paragraph('It was the best of times.')
    const range = rangeOfQuote(at('[ch01-s01-p001]'), 'It was the best of times.')
    expect(range?.toString()).toBe('It was the best of times.')
  })

  it('gives nothing when the paragraph is not on screen', () => {
    expect(rangeOfQuote(at('[ch09-s09-p099]'), 'anything')).toBeNull()
  })

  it('gives nothing when the words are no longer in it', () => {
    paragraph('It was the best of times.')
    expect(rangeOfQuote(at('[ch01-s01-p001]'), 'the worst of times')).toBeNull()
  })

  it('gives nothing for an empty quote', () => {
    paragraph('It was the best of times.')
    expect(rangeOfQuote(at('[ch01-s01-p001]'), '   ')).toBeNull()
  })
})
