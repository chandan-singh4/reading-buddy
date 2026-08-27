/**
 * The shape the two summary views consume.
 *
 * One item unit, two indexes. The Commonplace Book gathers `DistilledItem`s by
 * `concept.name` across every book; the Chapter View gathers the same items by
 * `book` + `chapter` and puts a `ChapterRecap` on top of them. Nothing here
 * describes *how* an item is produced — see `dataSource.ts` for that seam.
 */

/** A concept is either on the controlled vocabulary, or waiting to join it. */
export type ConceptStatus = 'linked' | 'candidate'

export interface ItemConcept {
  /** Canonical form: lowercase, singular, general. "the unconscious", not "Unconscious". */
  name: string
  /**
   * `candidate` means the Q&A pass met a concept that is not on the running
   * list and declined to invent a node for it. A candidate item shows in the
   * Chapter View with its amber dashed chip, and is held out of the
   * Commonplace Book — it has no confirmed heading to live under yet.
   */
  status: ConceptStatus
}

export interface DistilledItem {
  id: string
  /**
   * The load-bearing claim, compressed. May carry inline markup — `<em>` for
   * emphasis, and `<a class="link">` for a concept named mid-sentence. Parsed
   * by `claimNodes.ts`, never injected as HTML.
   */
  claim: string
  concept: ItemConcept
  /** Human-readable passage anchor, e.g. "the annex-dream passage". */
  anchor: string
  book: string
  chapter: string | number
  /** Coarse, straight from the book's metadata. Never used as a heading. */
  subjectTags: string[]
}

export interface ChapterRecap {
  book: string
  chapter: string | number
  chapterTitle: string
  /** Veda's plain-language, explain-to-a-friend summary of the chapter. */
  recapText: string
}

/** A heading in the Commonplace Book, with everything filed under it. */
export interface Concept {
  name: string
  items: DistilledItem[]
}

/** One row of the Chapter View's left rail. */
export interface ChapterListEntry {
  chapter: string | number
  chapterTitle: string
  /**
   * Whether this chapter has been through the passes yet.
   *
   * The rail lists every chapter of the book, distilled or not — a reader
   * needs to see where they are in the whole, not only the parts that are
   * done. This flag is what lets the view open on a chapter with something to
   * show, instead of landing on chapter 1 and reading as broken.
   */
  distilled: boolean
}

/** A whole chapter as the Chapter View needs it: the recap, then the items. */
export interface ChapterSummary {
  recap: ChapterRecap
  items: DistilledItem[]
}

/**
 * A marginal note in Veda's hand, shown under the gathered passages when she
 * has something to say about the seam between them. Optional by design: most
 * headings will not have one.
 */
export interface VedaNote {
  concept: string
  text: string
}
