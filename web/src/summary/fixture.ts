import type { SummaryDataSource } from './dataSource.ts'
import type {
  ChapterListEntry,
  ChapterSummary,
  Concept,
  DistilledItem,
  VedaNote,
} from './types.ts'

/*
 * Hand-written sample content, so both views render before the engine exists.
 *
 * Every word here is lifted from the two reference designs
 * (`design-inspiration/commonplace-book.html` and `chapter-view.html`) so the
 * pages can be judged against them line for line.
 *
 * ## One thing the references disagree about, kept as they wrote it
 *
 * The annex-dream passage is worded differently in the two files: the
 * Commonplace Book's version is longer and carries an inline concept link, the
 * Chapter View's is tighter. They are the same idea at two lengths. Rather
 * than pick one and diverge from a reference, both are here as separate items
 * — `jung-annex-kept` and `jung-annex-qa`. If the engine turns out to produce
 * exactly one item per passage, delete one of these and the views need no
 * change; nothing depends on there being two.
 */

const MDR = 'Memories, Dreams, Reflections'
const SLEEP = 'Why We Sleep'

const items: DistilledItem[] = [
  {
    id: 'jung-annex-kept',
    claim:
      'Dreams don’t only rehash the past; they can look <em>forward</em>. Jung ordered an old ' +
      'alchemy book to check a footnote and first dreamed of a hidden library wing full of ' +
      'symbolic pictures — his <a class="link">unconscious</a> flagging that alchemy would ' +
      'become the ground of his life’s work. Once the message landed, the dream never returned.',
    concept: { name: 'prospective function of dreams', status: 'linked' },
    anchor: 'the annex-dream passage',
    book: MDR,
    chapter: 4,
    subjectTags: ['memoir'],
  },
  {
    id: 'sleep-rem-recombination',
    claim:
      'The sleeping brain is not idle bookkeeping. In REM it replays the day’s fragments and ' +
      '<em>recombines</em> them — testing arrangements it hasn’t lived yet. The same ' +
      'forward-leaning function Jung sensed, seen from the inside of the machinery.',
    concept: { name: 'prospective function of dreams', status: 'linked' },
    anchor: 'the REM-replay passage',
    book: SLEEP,
    chapter: 8,
    subjectTags: ['neuroscience'],
  },
  {
    id: 'jung-annex-qa',
    claim:
      'Dreams can have a <em>prospective</em> function — looking ahead, not just back. ' +
      'Jung’s dream of a hidden library wing previewed the alchemy book before it arrived; ' +
      'the unconscious was flagging what would matter next.',
    concept: { name: 'prospective function of dreams', status: 'linked' },
    anchor: 'the annex-dream passage',
    book: MDR,
    chapter: 4,
    subjectTags: ['memoir'],
  },
  {
    id: 'jung-scout',
    claim:
      'The unconscious behaves less like a storage closet handing back filed memories, and more ' +
      'like an active scout — selecting what to send to consciousness, and why.',
    concept: { name: 'the unconscious', status: 'linked' },
    anchor: 'the storage-closet analogy',
    book: MDR,
    chapter: 4,
    subjectTags: ['memoir'],
  },
  {
    /*
     * The pending one. It shows in the Chapter View with the dashed amber chip,
     * and the Commonplace Book must not show it anywhere — there is no
     * confirmed heading for it to live under until the Librarian approves it.
     */
    id: 'jung-survivorship',
    claim:
      'If a dream only looks meaningful <em>after</em> the event it seemed to predict, how would ' +
      'you tell a genuine prospective dream from hindsight reading pattern into coincidence?',
    concept: { name: 'survivorship in dream interpretation', status: 'candidate' },
    anchor: 'a question that wandered off-book',
    book: MDR,
    chapter: 4,
    subjectTags: ['memoir'],
  },
]

/*
 * The headings, in the order the reference rail lists them. Six of the seven
 * are empty, which is honest: a controlled vocabulary grows a name the moment
 * a chapter pass extracts it, long before a passage is filed under it.
 */
const conceptNames = [
  'the unconscious',
  'individuation',
  'active imagination',
  'prospective function of dreams',
  'REM rebound',
  'the shadow',
  'synchronicity',
]

/**
 * Only the Commonplace Book's own copy of the annex passage is gathered under
 * a heading — the Chapter View's tighter restatement of the same idea would
 * otherwise read as the passage kept twice.
 */
const heldFromHeadings = new Set(['jung-annex-qa'])

/*
 * The chapters the Chapter View's rail shows — for *any* book it is asked
 * about, not only for Jung's.
 *
 * This is the one place the fixture deliberately lies, and it is worth saying
 * why. The Chapter View is reached from a button on a book's own details page,
 * so a reader will open it on whatever book is in front of them. Keyed
 * strictly by title, the sample content would only ever appear for a book
 * nobody owns, and the page would be blank exactly when someone went to look
 * at it — which defeats the point of shipping the view before the engine.
 *
 * A real source keys by book and this goes away with it. Chapter 4 is the only
 * one with a summary; the rest are honestly empty, which is also what a
 * part-distilled book looks like.
 */
const sampleChapters: ChapterListEntry[] = [
  { chapter: 1, chapterTitle: 'First Years', distilled: false },
  { chapter: 2, chapterTitle: 'School Days', distilled: false },
  { chapter: 3, chapterTitle: 'Student Years', distilled: false },
  { chapter: 4, chapterTitle: 'On Dreams', distilled: true },
  { chapter: 5, chapterTitle: 'The Work', distilled: false },
  { chapter: 6, chapterTitle: 'The Tower', distilled: false },
]

const recaps: ChapterSummary[] = [
  {
    recap: {
      book: MDR,
      chapter: 4,
      chapterTitle: 'On the function of dreams',
      recapText:
        'This chapter is Jung arguing that dreams aren’t just the mind idling or replaying the ' +
        'day. He thinks they can do real work — sometimes pointing <em>forward</em>, nudging you ' +
        'toward something important before you consciously see it. The alchemy-book dream is his ' +
        'star example: it arrived, delivered its message, and once he understood it, it never ' +
        'came back.',
    },
    items: items.filter(
      (item) => item.book === MDR && item.chapter === 4 && item.id !== 'jung-annex-kept',
    ),
  },
]

const vedaNotes: VedaNote[] = [
  {
    concept: 'prospective function of dreams',
    text:
      'A memoirist and a neuroscientist, decades apart, circling the same idea from opposite ' +
      'ends. You found the seam yourself.',
  },
]

/**
 * The passages in scope.
 *
 * Unscoped, that is everything — a heading gathers Jung and *Why We Sleep*
 * together, which is the whole point of the library-wide lens.
 *
 * Scoped to one book, it is the sample book's passages wearing the reader's
 * book's name. The same deliberate lie as `sampleChapters`, and for the same
 * reason: the scoped view is reached from a button on a book's own details
 * page, so a reader opens it on the book in front of them. Keyed strictly by
 * title it would be blank for everyone. A real source filters honestly and
 * this goes away with it.
 */
function inScope(book: string | undefined): DistilledItem[] {
  if (book === undefined) return items
  return items.filter((item) => item.book === MDR).map((item) => ({ ...item, book }))
}

/**
 * The one rule the Commonplace Book cannot break: a `candidate` concept is not
 * a heading. Applied here, at the source, rather than in the view — so every
 * future source inherits it by having to do the same thing.
 */
function filedUnder(name: string, book?: string): DistilledItem[] {
  return inScope(book).filter(
    (item) =>
      item.concept.status === 'linked' &&
      item.concept.name === name &&
      !heldFromHeadings.has(item.id),
  )
}

export const fixtureDataSource: SummaryDataSource = {
  async getConcepts(book): Promise<Concept[]> {
    const all = conceptNames.map((name) => ({ name, items: filedUnder(name, book) }))
    // Scoped, an empty heading is noise; unscoped, it is the vocabulary.
    return book === undefined ? all : all.filter((concept) => concept.items.length > 0)
  },

  async getConcept(name, book) {
    if (!conceptNames.includes(name)) return undefined
    return { name, items: filedUnder(name, book) }
  },

  async getChapterList() {
    return sampleChapters
  },

  async getChapter(book, chapter) {
    // Matched on the chapter alone — see the note on `sampleChapters`. The
    // book's own title is still what the page prints in its eyebrow, so a
    // reader sees their book above the sample chapter, not Jung's.
    const found = recaps.find((entry) => String(entry.recap.chapter) === String(chapter))
    return found && { ...found, recap: { ...found.recap, book } }
  },

  async getConceptList(book) {
    const inBook = new Set(items.filter((item) => item.book === book).map((i) => i.concept.name))
    return conceptNames.filter((name) => inBook.has(name))
  },

  async getVedaNote(concept) {
    return vedaNotes.find((note) => note.concept === concept)
  },
}

/** The heading the Commonplace Book opens on when nothing else is asked for. */
export const openingConcept = 'prospective function of dreams'

/** The book the Chapter View has fixture chapters for. */
export const fixtureBook = MDR
