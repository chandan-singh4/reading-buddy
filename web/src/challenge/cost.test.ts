// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'

import { sliceFrom } from './generate.ts'
import { material, userMessage } from './prompt.ts'
import { lastChapter, rememberChapter } from './lastChapter.ts'

function passagesOfSize(count: number, size = 4000) {
  return Array.from({ length: count }, (_, index) => ({
    anchor: `ch02/s01/p${index + 1}`,
    text: 'x'.repeat(size),
  }))
}

describe('what one call actually carries', () => {
  it('sends the chapter once, not twice', () => {
    const passages = passagesOfSize(2, 500)
    const body = userMessage({
      bookTitle: 'Man and His Symbols',
      chapter: 2,
      chapterTitle: 'Ancient Myths',
      concepts: ['the-shadow'],
      passages,
      count: 5,
    })
    // The prose belongs in the material, and nowhere else. It used to appear
    // in both, which paid for the chapter twice on every call.
    expect(body).not.toContain('xxxxx')
    expect(material(passages)).toContain('xxxxx')
    expect(material(passages)).toContain('[ch02/s01/p1]')
  })

  it('reads a short chapter whole', () => {
    const passages = passagesOfSize(2, 1000)
    expect(sliceFrom(passages, 0)).toHaveLength(2)
  })

  it('reads only part of a long chapter', () => {
    const passages = passagesOfSize(20, 4000)
    const first = sliceFrom(passages, 0)
    expect(first.length).toBeLessThan(passages.length)
    expect(first.length).toBeGreaterThan(0)
  })

  it('reads somewhere new on a refill', () => {
    const passages = passagesOfSize(20, 4000)
    const first = sliceFrom(passages, 0)
    const second = sliceFrom(passages, 5)
    expect(second[0]?.anchor).not.toBe(first[0]?.anchor)
  })

  it('comes round again rather than running out', () => {
    const passages = passagesOfSize(20, 4000)
    // However many batches a reader asks for, a slice always comes back.
    for (const written of [0, 5, 25, 100, 500]) {
      expect(sliceFrom(passages, written).length).toBeGreaterThan(0)
    }
  })
})

describe('the chapter the reader last chose', () => {
  beforeEach(() => window.localStorage.clear())

  it('is nothing for a book never examined', () => {
    expect(lastChapter('book-1')).toBeUndefined()
  })

  it('comes back, per book', () => {
    rememberChapter('book-1', 1)
    rememberChapter('book-2', 7)
    expect(lastChapter('book-1')).toBe(1)
    expect(lastChapter('book-2')).toBe(7)
  })

  it('survives a corrupt store rather than throwing', () => {
    window.localStorage.setItem('reading-buddy:challenge-chapter', 'not json')
    expect(lastChapter('book-1')).toBeUndefined()
    rememberChapter('book-1', 3)
    expect(lastChapter('book-1')).toBe(3)
  })
})
