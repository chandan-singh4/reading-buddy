// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'

import {
  HIGHLIGHT_COLOURS,
  colourOfKey,
  keyOfColour,
  readHighlighter,
  resolveHighlighter,
  seedOf,
  styleForTheme,
  writeHighlighter,
} from './highlightStyle.ts'

afterEach(() => {
  localStorage.clear()
})

describe('the colour keys', () => {
  it('turns a key into the value it paints', () => {
    expect(colourOfKey('yellow')).toBe(HIGHLIGHT_COLOURS[0]!.value)
  })

  it('finds the key a stored value came from, whatever its case', () => {
    expect(keyOfColour(HIGHLIGHT_COLOURS[2]!.value.toUpperCase())).toBe('blue')
  })

  it('keeps an old custom colour rather than calling it an error', () => {
    expect(keyOfColour('#123456')).toBeNull()
    expect(keyOfColour(undefined)).toBeNull()
  })
})

describe('which style to paint in', () => {
  it('gives the paper themes a marker', () => {
    expect(styleForTheme('paper')).toBe('handdrawn')
    expect(styleForTheme('sepia')).toBe('handdrawn')
  })

  it('gives a flat theme a clean wash', () => {
    expect(styleForTheme('dark')).toBe('clean')
  })

  it('never overrules a choice the reader made', () => {
    expect(resolveHighlighter('clean', 'paper')).toBe('clean')
    expect(resolveHighlighter('handdrawn', 'dark')).toBe('handdrawn')
    expect(resolveHighlighter('auto', 'paper')).toBe('handdrawn')
  })
})

describe('where the choice is kept', () => {
  it('starts every book on auto', () => {
    expect(readHighlighter('book-1')).toBe('auto')
    expect(readHighlighter(undefined)).toBe('auto')
  })

  it('keeps one choice per book', () => {
    writeHighlighter('book-1', 'clean')
    writeHighlighter('book-2', 'handdrawn')
    expect(readHighlighter('book-1')).toBe('clean')
    expect(readHighlighter('book-2')).toBe('handdrawn')
  })

  it('ignores rubbish in the store', () => {
    localStorage.setItem('reading-buddy:highlighter', '{"book-1":"crayon"}')
    expect(readHighlighter('book-1')).toBe('auto')
    localStorage.setItem('reading-buddy:highlighter', 'not json')
    expect(readHighlighter('book-1')).toBe('auto')
  })
})

describe('the seed', () => {
  it('gives the same highlight the same number every time', () => {
    expect(seedOf('note-7')).toBe(seedOf('note-7'))
  })

  it('gives neighbours different numbers, inside [0, 1)', () => {
    const seed = seedOf('note-8')
    expect(seed).not.toBe(seedOf('note-7'))
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(1)
  })
})
