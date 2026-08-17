// @vitest-environment jsdom

/**
 * The ink itself, with the geometry faked.
 *
 * jsdom has no layout, so every box is stubbed. That is enough for the one
 * question these tests ask, which is not *where* the ink goes but *whether* it
 * is there — and in particular whether it leaves when the reader takes the
 * highlight off.
 */

import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseAnchor, type Anchor } from '../structure/index.ts'
import type { PaintedHighlight } from './highlightStyle.ts'
import { HandDrawn } from './HandDrawn.tsx'

function at(value: string): Anchor {
  parseAnchor(value)
  return value as Anchor
}

function row(id: string, anchor: string, quote: string): PaintedHighlight {
  return { id, anchor: at(anchor), quote, colourKey: 'yellow', colour: '#f2df6b', seed: 0.5 }
}

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  const block = document.createElement('p')
  block.id = 'ch01-s01-p001'
  block.textContent = 'It was the best of times.'
  root.append(block)
  document.body.append(root)

  // One line box, in the same place every time. `join` needs real DOMRects.
  // jsdom has no `getClientRects` at all, so these are defined, not spied on.
  const rects = () => [new DOMRect(10, 20, 100, 16)]
  const fake = { configurable: true, writable: true, value: rects }
  Object.defineProperty(Range.prototype, 'getClientRects', fake)
  Object.defineProperty(Element.prototype, 'getClientRects', fake)
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: () => new DOMRect(10, 20, 100, 16),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function strokes(): number {
  return root.querySelectorAll('span[class*="stroke"]').length
}

describe('taking a highlight off', () => {
  it('paints the mark that is on this page', () => {
    render(<HandDrawn highlights={[row('a', '[ch01-s01-p001]', 'the best')]} root={root} />)
    expect(strokes()).toBeGreaterThan(0)
  })

  it('takes the ink away, although the book still has other highlights', () => {
    // The second row is anchored to a paragraph this root does not hold — a mark
    // in another section. It is what used to keep the deleted row's ink alive:
    // the list was not empty, so the clear never ran, and the measure came back
    // empty, so the old ink was kept as if the page were mid-turn.
    const here = row('a', '[ch01-s01-p001]', 'the best')
    const elsewhere = row('b', '[ch09-s09-p099]', 'far away')

    const page = render(<HandDrawn highlights={[here, elsewhere]} root={root} />)
    expect(strokes()).toBeGreaterThan(0)

    page.rerender(<HandDrawn highlights={[elsewhere]} root={root} />)
    expect(strokes()).toBe(0)
  })

  it('takes the ink away when the last highlight goes', () => {
    const here = row('a', '[ch01-s01-p001]', 'the best')
    const page = render(<HandDrawn highlights={[here]} root={root} />)
    expect(strokes()).toBeGreaterThan(0)

    page.rerender(<HandDrawn highlights={[]} root={root} />)
    expect(strokes()).toBe(0)
  })
})
