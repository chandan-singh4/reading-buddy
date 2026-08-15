import { describe, expect, it } from 'vitest'

import type { BookId, Manifest } from '../structure/index.ts'
import { chapterAt, chapterPages, progressLabel, progressOf, type Spine } from './progress.ts'

function manifestOf(titles: string[]): Manifest {
  return {
    bookId: 'b1' as BookId,
    title: 'A Book',
    chapters: titles.map((title, index) => ({ chapter: index + 1, title, summary: '' })),
  }
}

const FIVE = manifestOf(['One', 'Two', 'Three', 'Four', 'Five'])

describe('where you are', () => {
  it('reports the chapter and how many there are', () => {
    expect(progressOf(FIVE, { chapter: 2, section: 3 })).toMatchObject({
      chapter: 2,
      chapterCount: 5,
    })
  })

  it('puts the start of the book at 0 and the last chapter at 1', () => {
    expect(progressOf(FIVE, { chapter: 1, section: 1 }).fraction).toBe(0)
    expect(progressOf(FIVE, { chapter: 5, section: 1 }).fraction).toBe(1)
  })

  it('ignores the section — the slider moves in chapters', () => {
    // Sections would make the slider finer but no more honest: chapters are
    // wildly different lengths, so neither unit is a real measure of distance.
    const early = progressOf(FIVE, { chapter: 3, section: 1 })
    const late = progressOf(FIVE, { chapter: 3, section: 9 })
    expect(early.fraction).toBe(late.fraction)
  })

  it('survives a one-chapter book rather than dividing by zero', () => {
    const single = manifestOf(['Only'])
    expect(progressOf(single, { chapter: 1, section: 1 }).fraction).toBe(0)
  })

  it('clamps a position that points past the end of the book', () => {
    // A stale position outliving a re-import shouldn't put the slider off its
    // track — it should land on the last chapter.
    expect(progressOf(FIVE, { chapter: 99, section: 1 }).chapter).toBe(5)
  })
})

describe('what it says', () => {
  it('names the chapter, and never a page', () => {
    expect(progressLabel(FIVE, { chapter: 2, section: 1 })).toBe('Chapter 2 of 5 · Two')
  })

  it('falls back to the number when a chapter has no title', () => {
    const untitled = manifestOf(['', ''])
    expect(progressLabel(untitled, { chapter: 1, section: 1 })).toBe('Chapter 1 of 2')
  })
})

describe('reading the slider back', () => {
  it('maps a position to a chapter', () => {
    expect(chapterAt(FIVE, 0)).toBe(1)
    expect(chapterAt(FIVE, 1)).toBe(5)
    expect(chapterAt(FIVE, 0.5)).toBe(3)
  })

  it('round-trips every chapter, so dragging never lands one off', () => {
    for (const chapter of [1, 2, 3, 4, 5]) {
      const { fraction } = progressOf(FIVE, { chapter, section: 1 })
      expect(chapterAt(FIVE, fraction)).toBe(chapter)
    }
  })

  it('stays in the book when handed a position outside 0–1', () => {
    expect(chapterAt(FIVE, -3)).toBe(1)
    expect(chapterAt(FIVE, 42)).toBe(5)
  })
})

describe('the page each chapter opens on', () => {
  // 300 words to a page. Chapter 1 runs two sections and 900 words, so chapter
  // 2 starts on page 4 — the fourth slice of 300, not the third.
  const spine: Spine = {
    entries: [
      { chapter: 1, section: 1, words: 600, startWords: 0 },
      { chapter: 1, section: 2, words: 300, startWords: 600 },
      { chapter: 2, section: 1, words: 300, startWords: 900 },
      { chapter: 3, section: 1, words: 300, startWords: 1200 },
    ],
    totalWords: 1500,
  }

  it('gives every chapter its opening page', () => {
    const pages = chapterPages(spine)
    expect(pages.get(1)).toBe(1)
    expect(pages.get(2)).toBe(4)
    expect(pages.get(3)).toBe(5)
  })

  it('takes the first section of a chapter, not the last', () => {
    // The second section of chapter 1 starts on page 3. Letting it win would
    // put the chapter's own page three pages after the chapter begins.
    expect(chapterPages(spine).get(1)).toBe(1)
  })
})
