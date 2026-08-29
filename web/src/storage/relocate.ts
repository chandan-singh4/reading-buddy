import type { ReadingBuddyDB } from './db.ts'
import { db as defaultDb } from './db.ts'
import type { ParsedBook } from './repository.ts'
import type { Anchor, BookId, Section } from '../structure/index.ts'
import { sectionPath, tryParseAnchor } from '../structure/index.ts'

/**
 * Carry the reader's marks across a re-parse.
 *
 * ## The problem this exists for
 *
 * An anchor is a *position* — `[ch06-s07-p003]` — and that is what makes it
 * survive a re-import: parse the same file twice and every paragraph lands in
 * the same place. The rule holds right up until the parser changes how the book
 * is divided. `PARSER_VERSION` 34 let a third heading level open a section, so
 * in *Man and His Symbols* the paragraph that was `ch06-s06-p050` became
 * `ch06-s07-p003`. Nothing was deleted, and every highlight and every
 * conversation with Veda pointed at a place that no longer held those words.
 *
 * ## Why the words, not the position
 *
 * Every mark in this app stores the text it is about, and it always has: a
 * highlight keeps its `quote`, a thread keeps its `excerpt`. The reason given
 * at the time was that character offsets die on the first re-parse. The same
 * copy answers this, and answers it better than any arithmetic over the old
 * division could: the words are what the reader marked, so finding the words
 * again *is* finding the mark. It needs no memory of the old parser, so it will
 * work for the next change to the divisions as well as for this one.
 *
 * ## What it will not do
 *
 * It never deletes. A mark whose words cannot be found keeps the anchor it has
 * — the reader's note is theirs, and a passage the parser has stopped producing
 * is a reason to investigate, not a reason to throw the note away.
 */

/** Long enough that the words identify a passage rather than a common phrase. */
const SHORT_QUOTE = 12

/**
 * A comparable form of a passage: one space between words, and the typographic
 * characters folded to their plain twins.
 *
 * Books are full of curly quotes, en dashes and non-breaking spaces, and a
 * parser change can alter which of them survive into `text` without altering a
 * word of the book. Comparing the folded forms means such a change cannot cost
 * a reader a highlight.
 */
function fold(text: string): string {
  return text
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‐-―]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

interface Place {
  anchor: Anchor
  chapter: number
  section: number
  paragraph: number
  text: string
}

/** Every paragraph in the book, folded once and kept for every mark to search. */
export function placesIn(sections: readonly Section[]): Place[] {
  const places: Place[] = []
  for (const section of sections) {
    for (const paragraph of section.paragraphs) {
      const parts = tryParseAnchor(paragraph.anchor)
      if (!parts) continue
      places.push({ anchor: paragraph.anchor, ...parts, text: fold(paragraph.text) })
    }
  }
  return places
}

/** How far apart two places are, in the order the book is read. */
function distance(
  place: Place,
  from: { chapter: number; section: number; paragraph: number },
): number {
  return (
    Math.abs(place.chapter - from.chapter) * 1_000_000 +
    Math.abs(place.section - from.section) * 1_000 +
    Math.abs(place.paragraph - from.paragraph)
  )
}

/**
 * Where a passage lives now, or `undefined` if the book no longer holds it.
 *
 * The old anchor is a hint and not an answer. It decides between several
 * paragraphs that all contain the words — a stock phrase, or a passage the book
 * prints twice — by preferring the one nearest to where the reader made the
 * mark. A short quote is only ever matched inside its own chapter, because a
 * dozen characters can honestly appear anywhere.
 */
export function relocate(
  places: readonly Place[],
  anchor: Anchor,
  quote: string,
): Anchor | undefined {
  const wanted = fold(quote)
  if (wanted === '') return undefined

  const from = tryParseAnchor(anchor)
  const candidates = places.filter((place) => place.text.includes(wanted))
  const scoped =
    wanted.length < SHORT_QUOTE && from
      ? candidates.filter((place) => place.chapter === from.chapter)
      : candidates

  if (scoped.length === 0) return undefined
  if (!from) return scoped[0].anchor

  // Already right: the commonest case by far, since most of a book does not
  // move. Returning the same anchor is what lets the caller skip the write.
  const here = scoped.find((place) => place.anchor === anchor)
  if (here) return here.anchor

  return scoped.reduce((best, place) => (distance(place, from) < distance(best, from) ? place : best))
    .anchor
}

/** What a relocation did, for the log and for the tests. */
export interface Relocation {
  moved: number
  lost: number
}

const NOTHING: Relocation = { moved: 0, lost: 0 }

function add(a: Relocation, b: Relocation): Relocation {
  return { moved: a.moved + b.moved, lost: a.lost + b.lost }
}

/**
 * Re-find every mark in a book that has just been parsed again.
 *
 * Device-local tables only. Notes, threads, bookmarks and summaries are the
 * reader's, kept outside `Repository` — see `storage/notes.ts` — so this takes
 * the database directly rather than going through it.
 */
export async function relocateMarks(
  book: ParsedBook,
  database: ReadingBuddyDB = defaultDb,
): Promise<Relocation> {
  const bookId = book.meta.id
  const places = placesIn(book.sections)
  if (places.length === 0) return NOTHING

  // Threads first: a kept line of Veda's takes its anchor from the conversation
  // it came out of, so that conversation has to have found its place already.
  const threads = await relocateThreads(bookId, places, database)
  const notes = await relocateNotes(bookId, places, threads.anchors, database)
  const bookmarks = await relocateBookmarks(bookId, places, database)
  const summaries = await relocateSummaries(bookId, book.sections, database)

  return [notes, threads, bookmarks, summaries].reduce(add, NOTHING)
}

async function relocateNotes(
  bookId: BookId,
  places: readonly Place[],
  threadAnchors: ReadonlyMap<string, Anchor>,
  database: ReadingBuddyDB,
): Promise<Relocation> {
  const rows = await database.notes.where('bookId').equals(bookId).toArray()
  let moved = 0
  let lost = 0

  for (const row of rows) {
    /*
     * A kept line of Veda's follows its conversation, not its own words.
     *
     * Every other mark quotes the book, so the book can be searched for it.
     * This one quotes *Veda* — a line the reader picked out of an answer — and
     * those words appear nowhere in the text. Searching for them finds nothing,
     * which is why these were the one kind of row left pointing at the old
     * place after the first relocation. The thread it came from is anchored to
     * the passage they were talking about, and that is where the line belongs.
     */
    if (row.fromThread !== undefined) {
      const anchor = threadAnchors.get(row.fromThread)
      if (anchor === undefined) {
        // The conversation is gone. Fall through and try the words, which is
        // right for the rare kept line that quotes the book back at itself.
      } else {
        if (anchor !== row.anchor) {
          await database.notes.update([bookId, row.id], { anchor })
          moved += 1
        }
        continue
      }
    }

    // A note on a whole paragraph, with no words of its own copied, cannot be
    // searched for. It keeps its anchor; see the note at the top.
    if (!row.quote) continue
    const found = relocate(places, row.anchor, row.quote)
    if (found === undefined) {
      lost += 1
    } else if (found !== row.anchor) {
      await database.notes.update([bookId, row.id], { anchor: found })
      moved += 1
    }
  }

  return { moved, lost }
}

/** A relocation, plus where each thread ended up — what the kept lines follow. */
interface Threads extends Relocation {
  anchors: ReadonlyMap<string, Anchor>
}

async function relocateThreads(
  bookId: BookId,
  places: readonly Place[],
  database: ReadingBuddyDB,
): Promise<Threads> {
  const rows = await database.tutor.where('bookId').equals(bookId).toArray()
  const anchors = new Map<string, Anchor>()
  let moved = 0
  let lost = 0

  for (const row of rows) {
    const found = relocate(places, row.anchor, row.excerpt)
    if (found === undefined) {
      // Its own anchor is still the best answer there is, and it is what a line
      // kept out of this thread should follow.
      anchors.set(row.id, row.anchor)
      lost += 1
      continue
    }
    anchors.set(row.id, found)
    if (found !== row.anchor) {
      await database.tutor.update([bookId, row.id], { anchor: found })
      moved += 1
    }
  }

  return { moved, lost, anchors }
}

/**
 * Bookmarks, as far as their labels allow.
 *
 * A bookmark stores no copy of the book. Its `label` is the reader's own words
 * *or* the opening of the paragraph it marks, and only the second kind can be
 * searched for. So a bookmark is moved when its label is still the opening of
 * some paragraph, and left alone otherwise — which is right either way round: a
 * reader who named a bookmark named the page, not the sentence.
 */
async function relocateBookmarks(
  bookId: BookId,
  places: readonly Place[],
  database: ReadingBuddyDB,
): Promise<Relocation> {
  const rows = await database.bookmarks.where('bookId').equals(bookId).toArray()
  let moved = 0

  for (const row of rows) {
    const label = fold(row.label).replace(/(\.\.\.|…)$/u, '').trim()
    if (label.length < SHORT_QUOTE) continue
    const opener = places.find((place) => place.text.startsWith(label))
    if (opener && opener.anchor !== row.anchor) {
      await database.bookmarks.update([bookId, row.id], { anchor: opener.anchor })
      moved += 1
    }
  }

  return { moved, lost: 0 }
}

/**
 * Veda's section summaries, re-pointed by the title they were written for.
 *
 * These carry no anchor and no quote — a summary names its section by number,
 * and the numbers are exactly what a re-division changes. But every row keeps
 * `sectionTitle`, and a title is a better key than a number: the summary of
 * "The role of symbols" belongs to "The role of symbols" whichever section that
 * turns out to be. Without this the reader opens a chapter and finds Veda's
 * recap of one section filed under the name of another.
 */
async function relocateSummaries(
  bookId: BookId,
  sections: readonly Section[],
  database: ReadingBuddyDB,
): Promise<Relocation> {
  const rows = await database.summaries.where('bookId').equals(bookId).toArray()
  let moved = 0
  let lost = 0

  const numberOf = new Map<string, number>()
  for (const section of sections) {
    if (section.title === undefined) continue
    const key = `${section.chapter} ${fold(section.title)}`
    if (!numberOf.has(key)) numberOf.set(key, section.section)
  }

  for (const row of rows) {
    if (row.section === undefined || row.sectionTitle === undefined) continue
    const found = numberOf.get(`${row.chapter} ${fold(row.sectionTitle)}`)
    if (found === undefined) {
      lost += 1
      continue
    }
    if (found === row.section) continue

    // `chapterId` is part of the row's own key, so the row is written afresh
    // under the new one and the old row removed. An update in place would leave
    // a summary filed under a section it no longer describes.
    const chapterId = String(sectionPath(row.chapter, found))
    await database.summaries.delete([bookId, row.chapterId])
    await database.summaries.put({ ...row, chapterId, section: found })
    moved += 1
  }

  return { moved, lost }
}
