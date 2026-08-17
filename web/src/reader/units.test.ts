// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'

import { canGrow, unitAround, unitBeyond } from './units.ts'

const ONE = 'The dog sat down. The cat laughed at him, loudly. Nobody else did.'
const TWO = 'A second paragraph. It has two sentences.'

/** Two anchored paragraphs on the page, as the reading column holds them. */
function page(): HTMLElement {
  document.body.innerHTML =
    `<main id="strip">` +
    `<p id="ch01-s01-p001">${ONE}</p>` +
    `<p id="ch01-s01-p002">${TWO}</p>` +
    `</main>`
  return document.getElementById('strip') as HTMLElement
}

/** A range over `[at, end)` of one paragraph's single text node. */
function pick(id: string, at: number, end: number): Range {
  const node = document.getElementById(id)!.firstChild as Text
  const range = document.createRange()
  range.setStart(node, at)
  range.setEnd(node, end)
  return range
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('snapping to a unit', () => {
  it('takes the sentence a word sits in', () => {
    const root = page()
    // "laughed", well inside the second sentence.
    const snapped = unitAround(pick('ch01-s01-p001', 26, 33), 'sentence', root)
    expect(snapped?.toString()).toBe('The cat laughed at him, loudly.')
  })

  it('takes both sentences when the range crosses a boundary', () => {
    const root = page()
    const snapped = unitAround(pick('ch01-s01-p001', 4, 22), 'sentence', root)
    expect(snapped?.toString()).toBe('The dog sat down. The cat laughed at him, loudly.')
  })

  it('takes the whole paragraph for the paragraph unit', () => {
    const root = page()
    expect(unitAround(pick('ch01-s01-p001', 26, 33), 'paragraph', root)?.toString()).toBe(ONE)
  })

  it('says nothing for a range outside the reading column', () => {
    page()
    const loose = document.createElement('p')
    loose.textContent = 'Not in the book.'
    document.body.append(loose)
    const range = document.createRange()
    range.selectNodeContents(loose)
    expect(unitAround(range, 'sentence', document.getElementById('strip') as HTMLElement)).toBeNull()
  })

  it('says nothing without a column', () => {
    page()
    expect(unitAround(pick('ch01-s01-p001', 0, 3), 'sentence', null)).toBeNull()
  })
})

describe('stepping by one unit', () => {
  it('adds the next sentence at the end', () => {
    const root = page()
    const first = unitAround(pick('ch01-s01-p001', 4, 7), 'sentence', root)!
    expect(unitBeyond(first, 'sentence', 'end', root)?.toString()).toBe(
      'The dog sat down. The cat laughed at him, loudly.',
    )
  })

  it('adds the sentence before at the start', () => {
    const root = page()
    const second = unitAround(pick('ch01-s01-p001', 26, 33), 'sentence', root)!
    expect(unitBeyond(second, 'sentence', 'start', root)?.toString()).toBe(
      'The dog sat down. The cat laughed at him, loudly.',
    )
  })

  it('crosses into the next paragraph when the block runs out', () => {
    const root = page()
    const last = unitAround(pick('ch01-s01-p001', 50, 55), 'sentence', root)!
    expect(unitBeyond(last, 'sentence', 'end', root)?.toString()).toContain('A second paragraph.')
  })

  it('steps a whole paragraph at a time for the paragraph unit', () => {
    const root = page()
    const first = unitAround(pick('ch01-s01-p001', 0, 3), 'paragraph', root)!
    expect(unitBeyond(first, 'paragraph', 'end', root)?.toString()).toBe(`${ONE}${TWO}`)
  })

  it('stops at the first unit of the page', () => {
    const root = page()
    const first = unitAround(pick('ch01-s01-p001', 0, 3), 'sentence', root)!
    expect(unitBeyond(first, 'sentence', 'start', root)).toBeNull()
    expect(canGrow(first, 'sentence', 'start', root)).toBe(false)
    expect(canGrow(first, 'sentence', 'end', root)).toBe(true)
  })

  it('stops at the last unit of the page', () => {
    const root = page()
    const last = unitAround(pick('ch01-s01-p002', 25, 30), 'paragraph', root)!
    expect(unitBeyond(last, 'paragraph', 'end', root)).toBeNull()
    expect(canGrow(last, 'paragraph', 'end', root)).toBe(false)
  })
})
