import { describe, expect, it, vi } from 'vitest'

import type { BookId, Manifest } from '../structure/index.ts'
import {
  chapterTitle,
  firstSection,
  nextSection,
  pathOf,
  previousSection,
  type SectionCountLookup,
} from './navigation.ts'

function manifestOf(chapterCount: number): Manifest {
  return {
    bookId: 'b1' as BookId,
    title: 'A Book',
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      chapter: index + 1,
      title: `Chapter ${index + 1}`,
      summary: '',
    })),
  }
}

/** Sections per chapter, 1-based: `[3, 1, 5]` is ch01=3, ch02=1, ch03=5. */
function lookup(counts: number[]): SectionCountLookup {
  return (chapter) => Promise.resolve(counts[chapter - 1])
}

describe('addressing', () => {
  it('turns a position into its storage key', () => {
    expect(pathOf({ chapter: 2, section: 3 })).toBe('ch02/s03')
  })

  it('opens a book at the very beginning', () => {
    expect(firstSection()).toEqual({ chapter: 1, section: 1 })
  })
})

describe('moving forward', () => {
  it('stays in the chapter while there are sections left', async () => {
    const next = await nextSection(manifestOf(3), { chapter: 1, section: 1 }, lookup([3, 2, 2]))
    expect(next).toEqual({ chapter: 1, section: 2 })
  })

  it('crosses into the next chapter at the end of one', async () => {
    const next = await nextSection(manifestOf(3), { chapter: 1, section: 3 }, lookup([3, 2, 2]))
    expect(next).toEqual({ chapter: 2, section: 1 })
  })

  it('stops at the end of the book', async () => {
    const next = await nextSection(manifestOf(3), { chapter: 3, section: 2 }, lookup([3, 2, 2]))
    expect(next).toBeUndefined()
  })

  it('crosses a chapter that holds only one section', async () => {
    const next = await nextSection(manifestOf(3), { chapter: 2, section: 1 }, lookup([3, 1, 2]))
    expect(next).toEqual({ chapter: 3, section: 1 })
  })
})

describe('moving back', () => {
  it('stays in the chapter while there are sections behind', async () => {
    const previous = await previousSection(
      { chapter: 2, section: 2 },
      lookup([3, 2, 2]),
    )
    expect(previous).toEqual({ chapter: 2, section: 1 })
  })

  it('lands on the *last* section of the previous chapter, not its first', async () => {
    // The asymmetry that makes these functions async: going forward, the next
    // chapter always starts at 1; going back, the previous chapter's length
    // has to be looked up.
    const previous = await previousSection(
      { chapter: 2, section: 1 },
      lookup([7, 2, 2]),
    )
    expect(previous).toEqual({ chapter: 1, section: 7 })
  })

  it('stops at the start of the book', async () => {
    const previous = await previousSection(
      { chapter: 1, section: 1 },
      lookup([3, 2, 2]),
    )
    expect(previous).toBeUndefined()
  })
})

describe('a book whose storage is incomplete', () => {
  it('refuses to move forward from a chapter that has no sections', async () => {
    const next = await nextSection(manifestOf(3), { chapter: 2, section: 1 }, () =>
      Promise.resolve(undefined),
    )
    expect(next).toBeUndefined()
  })

  it('refuses to move back into an empty chapter rather than addressing section 0', async () => {
    // Section 0 is not a valid address; `sectionPath` would throw on it. A
    // dead end is better than a crash.
    const previous = await previousSection(
      { chapter: 2, section: 1 },
      lookup([0, 2, 2]),
    )
    expect(previous).toBeUndefined()
  })
})

describe('cost', () => {
  it('needs one lookup to go forward, and none of the next chapter', async () => {
    const sectionsIn = vi.fn(lookup([3, 2, 2]))
    await nextSection(manifestOf(3), { chapter: 1, section: 3 }, sectionsIn)

    // Only the current chapter is consulted — the next one always starts at 1,
    // so reading its index would be a wasted round trip on every chapter end.
    expect(sectionsIn).toHaveBeenCalledTimes(1)
    expect(sectionsIn).toHaveBeenCalledWith(1)
  })

  it('needs no lookup at all to move within a chapter, going back', async () => {
    const sectionsIn = vi.fn(lookup([3, 2, 2]))
    await previousSection({ chapter: 1, section: 2 }, sectionsIn)
    expect(sectionsIn).not.toHaveBeenCalled()
  })
})

describe('chapter titles', () => {
  it('finds the title for the line of context above the text', () => {
    expect(chapterTitle(manifestOf(3), 2)).toBe('Chapter 2')
  })

  it('returns nothing for a chapter the manifest does not list', () => {
    expect(chapterTitle(manifestOf(3), 9)).toBeUndefined()
  })
})
