/**
 * The decks carry progress as thickness, and thickness is the only thing they
 * say — there is no label to read, so a wrong number here is silent. What is
 * worth pinning down is that the two sides are complementary (paper leaves one
 * deck and arrives on the other, it does not evaporate) and that a book of
 * unknown length still looks like a book.
 */

// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageDecks } from './PageDecks.tsx'

/** The `--fill` each deck was given, left first. */
function fills(percent: number | null): [string, string] {
  const { container } = render(<PageDecks percent={percent} />)
  // Children of the wrapper, not a descendant query — the wrapper itself is a
  // `div` inside `container` and would otherwise be counted as the left deck.
  const [left, right] = Array.from(container.firstElementChild?.children ?? [])
  return [
    (left as HTMLElement).style.getPropertyValue('--fill'),
    (right as HTMLElement).style.getPropertyValue('--fill'),
  ]
}

describe('PageDecks', () => {
  it('splits the book between the two sides', () => {
    expect(fills(0)).toEqual(['0', '1'])
    expect(fills(25)).toEqual(['0.25', '0.75'])
    expect(fills(100)).toEqual(['1', '0'])
  })

  it('shows an even, half-read book when the length is not known yet', () => {
    // Not an empty left deck: that reads as "you have not started", which is a
    // claim, where the truth is that nothing is known.
    expect(fills(null)).toEqual(['0.5', '0.5'])
  })

  it('survives a percentage outside the range it was promised', () => {
    // A deck with a negative width silently disappears, taking the binding with
    // it, and a rounding error upstream is enough to get there.
    expect(fills(-10)).toEqual(['0', '1'])
    expect(fills(140)).toEqual(['1', '0'])
  })

  it('is invisible to a screen reader', () => {
    // It is a picture of the book's thickness. There is nothing here to say
    // that the page number does not already say better.
    const { container } = render(<PageDecks percent={50} />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })
})
