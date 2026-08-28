import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../storage/db.ts'
import { summaryStore } from '../storage/summaries.ts'
import type { BookId } from '../structure/index.ts'
import { liveDataSource } from './liveSource.ts'

/*
 * The state the reader was actually in, and the one the page used to hide.
 *
 * A chapter is summarised only once it is finished. Its named parts are offered
 * as the reader passes each one. So the ordinary state of the chapter in hand
 * is: several parts summarised, no chapter recap yet.
 *
 * The page required the chapter row before it drew anything, so PART 1 of Man
 * and His Symbols showed "this chapter has no summary yet" while holding three.
 */

const BOOK = 'b1' as BookId

beforeEach(async () => {
  await db.summaries.clear()
  await db.chapters.clear()
  // The rail is built from the book's own spine, so the chapter has to exist.
  await db.chapters.put({
    bookId: BOOK,
    chapter: 6,
    title: 'PART 1 APPROACHING THE UNCONSCIOUS',
    path: 'ch06' as never,
    sections: [],
  })
})

function part(section: number, title: string) {
  return {
    bookId: BOOK,
    chapterId: `ch06/s0${section}`,
    chapter: 6,
    chapterTitle: 'PART 1 APPROACHING THE UNCONSCIOUS',
    section,
    sectionTitle: title,
    recap: `A recap of ${title}.`,
    concepts: [{ name: 'dreams', status: 'existing-match' as const }],
    coversNConversations: 0,
    recapAt: '2026-08-27T10:00:00.000Z',
  }
}

describe('a chapter whose parts are summarised but whose recap is not', () => {
  it('hands the page the parts, with no recap', async () => {
    await summaryStore.save(part(1, 'The importance of dreams'))
    await summaryStore.save(part(3, 'The function of dreams'))
    await summaryStore.save(part(2, 'Past and future in the unconscious'))

    const found = await liveDataSource.getChapter(BOOK, 6)
    expect(found).toBeTruthy()
    // Empty is the signal the page reads: it draws the reason, not a blank.
    expect(found?.recapText).toBe('')
    // In the book's order, whatever order they were summarised in.
    expect(found?.sections?.map((row) => row.title)).toEqual([
      'The importance of dreams',
      'Past and future in the unconscious',
      'The function of dreams',
    ])
  })

  it('counts in the rail, so the page opens on it', async () => {
    await summaryStore.save(part(1, 'The importance of dreams'))
    // `distilled` has to mean "there is something here", not "this is
    // complete" — it is what the page uses to choose where to land.
    const list = await liveDataSource.getChapterList(BOOK)
    expect(list.find((row) => row.chapter === 6)?.distilled).toBe(true)
  })

  it('still says nothing at all when there is nothing at all', async () => {
    expect(await liveDataSource.getChapter(BOOK, 6)).toBeUndefined()
  })
})
