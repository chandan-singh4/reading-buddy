import { describe, expect, it } from 'vitest'

import {
  DECK_DEFAULT,
  DECK_MAX,
  DECK_MIN,
  DECK_TRAVEL,
  DECK_ZONE,
  clampDeck,
  deckAfterDrag,
  inDeckZone,
} from './deckShade'

describe('how dark the decks are drawn', () => {
  it('leaves the theme alone until the reader says otherwise', () => {
    expect(DECK_DEFAULT).toBe(1)
    expect(clampDeck(DECK_DEFAULT)).toBe(1)
  })

  it('never erases the decks at either end', () => {
    expect(clampDeck(0)).toBe(DECK_MIN)
    expect(clampDeck(99)).toBe(DECK_MAX)
    expect(DECK_MIN).toBeGreaterThan(0)
  })

  it('treats a value that is not a number as the theme default', () => {
    expect(clampDeck(Number.NaN)).toBe(DECK_DEFAULT)
  })
})

describe('the drag on the deck', () => {
  const height = 800

  it('darkens the lines as the finger goes up', () => {
    expect(deckAfterDrag(1, 100, height)).toBeLessThan(1)
  })

  it('fades the lines as the finger goes down', () => {
    expect(deckAfterDrag(1, -100, height)).toBeGreaterThan(1)
  })

  it('covers the whole range over its share of the screen', () => {
    expect(deckAfterDrag(DECK_MAX, height * DECK_TRAVEL, height)).toBeCloseTo(DECK_MIN, 5)
  })

  it('returns to where it began when the finger does', () => {
    expect(deckAfterDrag(1.4, 0, height)).toBeCloseTo(1.4, 5)
  })

  it('does the same thing on a tall screen as on a short one', () => {
    expect(deckAfterDrag(1, 400 * DECK_TRAVEL, 400)).toBeCloseTo(
      deckAfterDrag(1, 1200 * DECK_TRAVEL, 1200),
      5,
    )
  })

  it('holds at the ends rather than running past them', () => {
    expect(deckAfterDrag(1, 5000, height)).toBe(DECK_MIN)
    expect(deckAfterDrag(1, -5000, height)).toBe(DECK_MAX)
  })

  it('answers a screen with no height rather than dividing by it', () => {
    expect(deckAfterDrag(1.2, 100, 0)).toBe(1.2)
  })
})

describe('the band that listens', () => {
  const width = 390

  it('takes a touch on the right edge', () => {
    expect(inDeckZone(width - 1, width)).toBe(true)
    expect(inDeckZone(width - DECK_ZONE, width)).toBe(true)
  })

  it('leaves the rest of the page alone', () => {
    expect(inDeckZone(width / 2, width)).toBe(false)
    expect(inDeckZone(0, width)).toBe(false)
    expect(inDeckZone(width - DECK_ZONE - 1, width)).toBe(false)
  })

  it('is wide enough for a thumb, whatever the deck is drawn at', () => {
    expect(DECK_ZONE).toBeGreaterThanOrEqual(44)
  })
})
