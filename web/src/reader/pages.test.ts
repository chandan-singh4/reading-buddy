/**
 * The page number, counted in words.
 *
 * Kept apart from `progress.test.ts` — that one covers chapters, which are the
 * fallback and a different claim about the book.
 */

import { describe, expect, it } from 'vitest'

import { WORDS_PER_PAGE, countWords, pagesIn } from '../structure/index.ts'
import type { BookId, ChapterIndex, Manifest } from '../structure/index.ts'
import { chapterPath, sectionPath } from '../structure/index.ts'
import { formatAnchor } from '../structure/index.ts'
import type { Section } from '../structure/index.ts'
import {
  anchorAtPage,
  buildSpine,
  hasWordCounts,
  pagesAt,
  pagesOf,
  paragraphStarts,
  refAtPage,
  wordsAt,
} from './progress.ts'

/** Chapters given as their sections' word counts: `[[300, 300], [300]]`. */
function bookOf(shape: number[][]): { manifest: Manifest; indexes: ChapterIndex[] } {
  const manifest: Manifest = {
    bookId: 'b1' as BookId,
    title: 'A Book',
    chapters: shape.map((sections, index) => ({
      chapter: index + 1,
      title: `Chapter ${index + 1}`,
      summary: '',
      words: sections.reduce((total, words) => total + words, 0),
    })),
  }

  const indexes: ChapterIndex[] = shape.map((sections, index) => ({
    chapter: index + 1,
    title: `Chapter ${index + 1}`,
    path: chapterPath(index + 1),
    sections: sections.map((words, sectionIndex) => ({
      section: sectionIndex + 1,
      path: sectionPath(index + 1, sectionIndex + 1),
      words,
    })),
  }))

  return { manifest, indexes }
}

function spineOf(shape: number[][]) {
  const { manifest, indexes } = bookOf(shape)
  const spine = buildSpine(manifest, indexes)
  if (!spine) throw new Error('expected a spine')
  return spine
}

/** Three pages exactly: two sections in chapter 1, one in chapter 2. */
const THREE_PAGES = [[300, 300], [300]]

describe('counting words', () => {
  it('counts whitespace-separated runs', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('is unmoved by the whitespace itself', () => {
    // Stability is the whole requirement — the same text must always give the
    // same count, or a page number changes under a reader for no reason.
    expect(countWords('  one \n\n two\tthree  ')).toBe(3)
  })

  it('counts nothing as nothing', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })

  it('never rounds a non-empty book down to zero pages', () => {
    expect(pagesIn(0)).toBe(0)
    expect(pagesIn(1)).toBe(1)
    expect(pagesIn(WORDS_PER_PAGE)).toBe(1)
    expect(pagesIn(WORDS_PER_PAGE + 1)).toBe(2)
  })
})

describe('a book that does not know its own length', () => {
  it('is spotted by a single missing count', () => {
    const { manifest, indexes } = bookOf(THREE_PAGES)
    const partial: Manifest = {
      ...manifest,
      chapters: [{ ...manifest.chapters[0], words: undefined }, manifest.chapters[1]],
    }

    expect(hasWordCounts(partial)).toBe(false)
    // One unknown chapter poisons every page number after it, so the whole
    // book falls back rather than being confidently wrong for its second half.
    expect(buildSpine(partial, indexes)).toBeNull()
  })

  it('refuses to build a spine for a book with no words at all', () => {
    const { manifest, indexes } = bookOf([[0], [0]])
    expect(buildSpine(manifest, indexes)).toBeNull()
  })
})

describe('where you are, in pages', () => {
  const spine = spineOf(THREE_PAGES)

  it('starts at page 1 of 3, at 0%', () => {
    expect(pagesOf(spine, { chapter: 1, section: 1 })).toMatchObject({
      page: 1,
      pageCount: 3,
      percent: 0,
    })
  })

  it('advances a page for each section passed', () => {
    expect(pagesOf(spine, { chapter: 1, section: 2 }).page).toBe(2)
    expect(pagesOf(spine, { chapter: 2, section: 1 }).page).toBe(3)
  })

  it('never reports a page past the end', () => {
    const { page, pageCount } = pagesOf(spine, { chapter: 2, section: 1 })
    expect(page).toBeLessThanOrEqual(pageCount)
  })

  it('counts the pages left in the chapter, including the one you are on', () => {
    // Chapter 1 is 600 words; standing at its start, both its pages are ahead.
    expect(pagesOf(spine, { chapter: 1, section: 1 }).leftInChapter).toBe(2)
    expect(pagesOf(spine, { chapter: 1, section: 2 }).leftInChapter).toBe(1)
  })

  it('never says nought pages are left while you are still reading one', () => {
    const short = spineOf([[10], [10]])
    expect(pagesOf(short, { chapter: 1, section: 1 }).leftInChapter).toBe(1)
  })

  it('falls back to the chapter start for a section it has never heard of', () => {
    // A stale saved position, or a chapter index that failed to load. Better a
    // slightly early page number than a crash or a zero.
    expect(pagesOf(spine, { chapter: 2, section: 99 }).page).toBe(3)
  })
})

describe('sliding to a page', () => {
  const spine = spineOf(THREE_PAGES)

  it('lands on the section that holds it', () => {
    expect(refAtPage(spine, 1)).toEqual({ chapter: 1, section: 1 })
    expect(refAtPage(spine, 2)).toEqual({ chapter: 1, section: 2 })
    expect(refAtPage(spine, 3)).toEqual({ chapter: 2, section: 1 })
  })

  it('clamps a page outside the book to its ends', () => {
    expect(refAtPage(spine, 0)).toEqual({ chapter: 1, section: 1 })
    expect(refAtPage(spine, 999)).toEqual({ chapter: 2, section: 1 })
  })

  it('round-trips with the page number', () => {
    for (const page of [1, 2, 3]) {
      expect(pagesOf(spine, refAtPage(spine, page)).page).toBe(page)
    }
  })

  it('sends several pages of one long section to that section', () => {
    // Section-granular on purpose: `refAtPage` says *which section to load*,
    // and `anchorAtPage` says where to land inside it once it has. Answering
    // only this half is what made the slider look broken inside a long chapter.
    const long = spineOf([[900]])
    expect(refAtPage(long, 1)).toEqual({ chapter: 1, section: 1 })
    expect(refAtPage(long, 3)).toEqual({ chapter: 1, section: 1 })
  })
})

describe('a chapter whose index did not load', () => {
  it('still occupies its own length, so later pages stay right', () => {
    const { manifest } = bookOf(THREE_PAGES)
    // Only chapter 2's index is available.
    const spine = buildSpine(manifest, bookOf(THREE_PAGES).indexes.slice(1))
    if (!spine) throw new Error('expected a spine')

    expect(spine.totalWords).toBe(900)
    // Chapter 2 has not slid forward to fill chapter 1's gap.
    expect(pagesOf(spine, { chapter: 2, section: 1 }).page).toBe(3)
  })
})

/**
 * The case the reader actually hit: a chapter that is a single section running
 * many pages. Real books are full of these — a chapter of the Jung epub is one
 * section covering fourteen pages — and a page position that can only name a
 * section is no use inside one.
 */
describe('moving inside one long section', () => {
  /** One section of `count` paragraphs, each exactly ten words. */
  function longSection(chapter: number, section: number, count: number): Section {
    return {
      chapter,
      section,
      path: sectionPath(chapter, section),
      paragraphs: Array.from({ length: count }, (_, index) => ({
        anchor: formatAnchor({ chapter, section, paragraph: index + 1 }),
        text: 'one two three four five six seven eight nine ten',
        kind: 'prose' as const,
      })),
    }
  }

  // A single 1400-word chapter — five pages with nothing to navigate between.
  const spine = spineOf([[1400]])
  const section = longSection(1, 1, 140)

  it('knows where each paragraph starts', () => {
    const starts = paragraphStarts(section)
    expect(starts[0]?.startWords).toBe(0)
    expect(starts[1]?.startWords).toBe(10)
    expect(starts[30]?.startWords).toBe(300)
  })

  it('finds the paragraph a page begins at', () => {
    const here = { chapter: 1, section: 1 }
    // Page 2 starts 300 words in, which is paragraph 31 at ten words each.
    expect(anchorAtPage(spine, here, section, 2)).toBe(
      formatAnchor({ chapter: 1, section: 1, paragraph: 31 }),
    )
    expect(anchorAtPage(spine, here, section, 1)).toBe(
      formatAnchor({ chapter: 1, section: 1, paragraph: 1 }),
    )
  })

  it('gives every page in the section a different paragraph', () => {
    // The bug: page 176 and page 177 both resolved to the section's start, so
    // nudging the slider did nothing at all until it left the chapter.
    const here = { chapter: 1, section: 1 }
    const anchors = [1, 2, 3, 4, 5].map((page) => anchorAtPage(spine, here, section, page))
    expect(new Set(anchors).size).toBe(5)
  })

  it('declines a page that is not in this section', () => {
    // Better to scroll nowhere than to scroll somewhere misleading.
    const twoChapters = spineOf([[600], [600]])
    expect(anchorAtPage(twoChapters, { chapter: 1, section: 1 }, section, 4)).toBeUndefined()
  })

  it('moves the page number as you move through the section', () => {
    const here = { chapter: 1, section: 1 }
    const atStart = wordsAt(spine, here, section, formatAnchor({ chapter: 1, section: 1, paragraph: 1 }))
    const partWay = wordsAt(spine, here, section, formatAnchor({ chapter: 1, section: 1, paragraph: 31 }))

    expect(pagesAt(spine, here, atStart).page).toBe(1)
    expect(pagesAt(spine, here, partWay).page).toBe(2)
  })

  it('counts down the pages left in the chapter as you read', () => {
    const here = { chapter: 1, section: 1 }
    const start = pagesAt(spine, here, 0)
    const later = pagesAt(spine, here, 900)

    expect(start.leftInChapter).toBe(5)
    expect(later.leftInChapter).toBe(2)
  })

  it('falls back to the start of the section when no paragraph is named', () => {
    // What the bar shows before first paint, and what `pagesOf` still means.
    expect(wordsAt(spine, { chapter: 1, section: 1 })).toBe(0)
    expect(pagesOf(spine, { chapter: 1, section: 1 }).page).toBe(1)
  })

  /*
   * "Finished" is defined as 100% in both `app/homeShelves.ts` and
   * `library/status.ts`, so what this function returns on the last page is not
   * a readout — it is the whole definition of having finished a book.
   */
  describe('the last page is 100%', () => {
    const here = { chapter: 1, section: 1 }

    it('reports 100 on the final page', () => {
      const last = pagesAt(spine, here, spine.totalWords)
      expect(last.page).toBe(last.pageCount)
      expect(last.percent).toBe(100)
    })

    it('reports 100 from anywhere on the final page, not just its last word', () => {
      // The real case: `at` is where the paragraph at the top of the screen
      // begins, so it lands somewhere *inside* the last page and never on its
      // final word. Dividing gave 99 here, which is why nothing was ever
      // finished.
      const intoLastPage = (pagesIn(spine.totalWords) - 1) * WORDS_PER_PAGE + 1
      const last = pagesAt(spine, here, intoLastPage)

      expect(last.page).toBe(last.pageCount)
      expect(last.percent).toBe(100)
    })

    it('does not report 100 before the final page', () => {
      const before = pagesAt(spine, here, (pagesIn(spine.totalWords) - 2) * WORDS_PER_PAGE)
      expect(before.page).toBeLessThan(before.pageCount)
      expect(before.percent).toBeLessThan(100)
    })

    it('counts a one-page book as finished — the whole text is on the screen', () => {
      const tiny = spineOf([[80]])
      expect(pagesAt(tiny, here, 0)).toMatchObject({ page: 1, pageCount: 1, percent: 100 })
    })
  })
})
