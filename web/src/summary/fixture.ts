import type { SummaryDataSource } from './dataSource.ts'
import type { ChapterListEntry, ChapterSummary } from './types.ts'

/*
 * Hand-written sample content, so the chapter page renders before either model
 * exists. The words come from the reference design in `design-inspiration/`.
 *
 * ## The one place this deliberately lies
 *
 * It answers with its sample chapters for *any* book, not only for the one the
 * sample was written about. The page is reached from a button on a book's own
 * details page, so a reader opens it on whatever book is in front of them.
 * Keyed strictly by title, the sample would only ever appear for a book nobody
 * owns, and the page would be blank exactly when someone went to look at it.
 *
 * A real source keys by book and this goes away with it. The page prints the
 * reader's *own* book title above the sample chapter, so nothing on screen
 * claims to be a book they do not have.
 */

/** Chapter 4 is the only one that has been read. The rest are honestly empty. */
const sampleChapters: ChapterListEntry[] = [
  { chapter: 1, chapterTitle: 'First Years', distilled: false },
  { chapter: 2, chapterTitle: 'School Days', distilled: false },
  { chapter: 3, chapterTitle: 'Student Years', distilled: false },
  { chapter: 4, chapterTitle: 'On Dreams', distilled: true },
  { chapter: 5, chapterTitle: 'The Work', distilled: false },
  { chapter: 6, chapterTitle: 'The Tower', distilled: false },
]

const sample: Omit<ChapterSummary, 'book'> = {
  chapter: 4,
  chapterTitle: 'On the function of dreams',

  /* Section one — what the Librarian gives back. */
  recapText:
    'This chapter is Jung arguing that dreams aren’t just the mind idling or replaying the ' +
    'day. He thinks they can do real work — sometimes pointing <em>forward</em>, nudging you ' +
    'toward something important before you consciously see it. The alchemy-book dream is his ' +
    'star example: it arrived, delivered its message, and once he understood it, it never ' +
    'came back.',
  tags: ['dreams', 'the unconscious', 'alchemy', 'memoir'],

  /* Section two — what the Scribe gives back. */
  qaText:
    'You pushed on whether a dream can really point forward, or whether that is hindsight ' +
    'dressed up: if a dream only looks meaningful <em>after</em> the event, how would you tell ' +
    'a genuine one from a coincidence you read a pattern into? Veda granted the objection ' +
    'rather than arguing it away. You also worked through the storage-closet analogy — the ' +
    'unconscious as an active scout choosing what to send up, not a cupboard handing back ' +
    'what was filed.',
}

export const fixtureDataSource: SummaryDataSource = {
  async getChapterList() {
    return sampleChapters
  },

  async getChapter(book, chapter) {
    // Matched on the chapter alone — see the note at the top. The book's own
    // title is carried through, so the page shows the reader their book.
    if (String(chapter) !== String(sample.chapter)) return undefined
    return { ...sample, book }
  },
}

/** The book the sample was written about, for tests that need a name. */
export const fixtureBook = 'Memories, Dreams, Reflections'
