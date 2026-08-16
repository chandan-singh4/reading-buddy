import { describe, expect, it } from 'vitest'

import type { BookId, ChapterIndex, Manifest } from '../structure/index.ts'
import {
  chapterAt,
  chapterPages,
  contentsOutline,
  progressLabel,
  progressOf,
  type Spine,
} from './progress.ts'

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

describe('the contents, to the depth the book has', () => {
  const spine: Spine = {
    entries: [
      { chapter: 1, section: 1, words: 600, startWords: 0 },
      { chapter: 1, section: 2, words: 300, startWords: 600 },
      { chapter: 2, section: 1, words: 300, startWords: 900 },
    ],
    totalWords: 1200,
  }

  function indexes(
    rows: { chapter: number; sections: (string | undefined)[] }[],
  ): ChapterIndex[] {
    return rows.map((row) => ({
      chapter: row.chapter,
      title: `Chapter ${row.chapter}`,
      path: `/book/ch0${row.chapter}/index.md`,
      sections: row.sections.map((title, index) => ({
        section: index + 1,
        title,
        path: `/book/ch0${row.chapter}/s0${index + 1}.md`,
        words: 300,
      })),
    })) as ChapterIndex[]
  }

  it('indents a chapter’s named sections under it, each with its own page', () => {
    // The whole point: a list that offers page 1 and then page 300 cannot be
    // navigated with. The sections are the only finer division a book has.
    const outline = contentsOutline(
      manifestOf(['One', 'Two']),
      indexes([
        { chapter: 1, sections: ['Openings', 'Middles'] },
        { chapter: 2, sections: ['Ends'] },
      ]),
      spine,
    )

    expect(outline).toEqual([
      { chapter: 1, title: 'One', page: 1 },
      { chapter: 1, section: 1, title: 'Openings', page: 1 },
      { chapter: 1, section: 2, title: 'Middles', page: 3 },
      // Chapter 2 has one section, so it stays a single row.
      { chapter: 2, title: 'Two', page: 4 },
    ])
  })

  it('leaves out a section the book never named', () => {
    // An untitled section is the parser's own bucket — the prose before the
    // first heading. It is a real division of the text and not a thing the book
    // calls anything, so there is nothing to print beside its page number.
    const outline = contentsOutline(
      manifestOf(['One']),
      indexes([{ chapter: 1, sections: [undefined, 'Middles'] }]),
      spine,
    )

    expect(outline).toEqual([
      { chapter: 1, title: 'One', page: 1 },
      { chapter: 1, section: 2, title: 'Middles', page: 3 },
    ])
  })

  it('still lists the book when it does not know its own length', () => {
    // No spine means no word counts, so no page numbers. The list must still
    // navigate rather than vanish.
    const outline = contentsOutline(
      manifestOf(['One']),
      indexes([{ chapter: 1, sections: ['Openings', 'Middles'] }]),
      null,
    )

    expect(outline.map((row) => row.title)).toEqual(['One', 'Openings', 'Middles'])
    expect(outline.every((row) => row.page === 1)).toBe(true)
  })

  it("leaves out an endnote subheading that repeats a chapter's title", () => {
    // A NOTES division names each chapter it holds notes for, so the notes can
    // be found and linked back to. Those are cross-references, not destinations.
    const outline = contentsOutline(
      manifestOf(['Robots That Think', 'From Meditation to Action', 'NOTES']),
      indexes([
        {
          chapter: 3,
          sections: ['ROBOTS THAT THINK', 'FROM MEDITATION TO ACTION', 'A Note on Sources'],
        },
      ]),
      spine,
    )

    // Punctuation and case differ from the chapter headings and must not matter.
    expect(outline.map((row) => row.title)).toEqual([
      'Robots That Think',
      'From Meditation to Action',
      'NOTES',
      'A Note on Sources',
    ])
  })

  it('names an untitled chapter rather than printing a blank line', () => {
    expect(contentsOutline(manifestOf(['']), [], spine)[0]).toEqual({
      chapter: 1,
      title: 'Chapter 1',
      page: 1,
    })
  })
})
