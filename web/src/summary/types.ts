/**
 * What a chapter's page shows.
 *
 * Two sections, from two models, and nothing else:
 *
 * 1. The **Librarian** reads the chapter and gives a plain-language summary
 *    plus the tags for it.
 * 2. The **Scribe** reads the reader's conversation with Veda about that
 *    chapter and summarises it.
 *
 * There is no concept index, no controlled vocabulary and no candidate state.
 * An earlier build had all three; the reader cut them. Git holds that version
 * if the idea ever comes back.
 */

/** One row of the chapter rail. */
export interface ChapterListEntry {
  chapter: string | number
  chapterTitle: string
  /**
   * Whether the Librarian has read this chapter yet.
   *
   * The rail lists every chapter of the book, read or not — a reader needs to
   * see where they are in the whole. This flag is what lets the page open on a
   * chapter with something to show, instead of landing on chapter 1 and
   * reading as broken.
   */
  distilled: boolean
}

/** Everything one chapter's page draws. */
export interface ChapterSummary {
  book: string
  chapter: string | number
  chapterTitle: string
  /**
   * The Librarian's summary of the chapter, in plain words. May carry `<em>`,
   * which `claimNodes.ts` parses — it is never set as HTML.
   */
  recapText: string
  /** The Librarian's tags for this chapter. Shown as chips under the summary. */
  tags: string[]
  /**
   * The Scribe's summary of what the reader and Veda worked through in this
   * chapter. Absent when they have not talked about it yet — a chapter can be
   * read without a single question, and that is not a gap.
   */
  qaText?: string
  /**
   * The titled sections of this chapter that have summaries of their own.
   *
   * Empty for a book whose sections the author did not name, which is most
   * fiction — the chapter recap above is then the whole of it. Drawn under the
   * chapter, in reading order, because a section summary is a detail of the
   * chapter and not a rival to it.
   */
  sections?: SectionSummary[]
}

/** One titled section of a chapter, summarised on its own. */
export interface SectionSummary {
  section: number
  title: string
  recapText: string
  tags: string[]
  qaText?: string
}
