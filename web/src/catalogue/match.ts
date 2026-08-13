/**
 * Deciding whether a catalogue result is actually the book on the shelf.
 *
 * A search is a guess. `intitle:"Kundalini"` returns a real book by a real
 * author that is not the reader's book, and storing it would replace a correct
 * record with a confident wrong one — page counts, genre, cover and all. Nothing
 * downstream can tell that apart from a good match, and no reader would think to
 * check. So every result that did not arrive via an ISBN has to earn its place.
 *
 * The rules here were measured against the reader's real 32-book library before
 * being written: 26 matched by strict search, 2 more by the loose fallback, 4
 * refused, and **no false accepts**. The cases that made each rule necessary are
 * the fixtures in `match.test.ts` — that file is the argument, this one is only
 * the implementation.
 */

/** Very common words carry no evidence; two books sharing "the" share nothing. */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'as', 'is', 'for', 'his', 'her', 'my'])

/**
 * Lowercase, strip accents, drop punctuation.
 *
 * `Nhất Hạnh` becomes `nhat hanh`, which is the entire reason this exists: the
 * file and the catalogue spell the same name two different ways, and a plain
 * comparison calls the right book a stranger.
 */
export function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
}

/**
 * The words worth comparing. Short ones go too — initials and `of` are noise,
 * and `C. G. Jung` should match on `jung`.
 */
export function tokens(value: string): Set<string> {
  return new Set(fold(value).split(/\s+/).filter((word) => word.length > 2 && !STOP.has(word)))
}

/**
 * Whether two author strings name anyone in common.
 *
 * `undefined` means *unknown*, not *fine*: either side may be missing, and two
 * books whose authors are both blank have agreed on nothing.
 *
 * Deliberately generous about order and form. The file might say
 * `Shamdasani, Sonu, Jung, C. G.` where the catalogue says `C. G. Jung`, or
 * `Thich Nhat Hanh` against `Nhat Hanh (Thich.)`. One shared name token is
 * enough — but one is required, and that is what stops a loose query returning
 * a different author's book with a similar title.
 */
export function sharesAuthor(ours: string | undefined, theirs: readonly string[] | undefined): boolean | undefined {
  if (!ours?.trim() || !theirs?.length) return undefined

  const mine = tokens(ours)
  return theirs.some((name) => [...tokens(name)].some((word) => mine.has(word)))
}

/**
 * How much of the **catalogue's** title our title accounts for, 0 to 1.
 *
 * One-directional on purpose. Our titles carry subtitles the catalogue drops —
 * `Determined A Science of Life Without Free Will` against a catalogue entry of
 * plain `Determined` — so measuring the other way would reject the good match
 * for having said more. Measuring this way asks the right question: *is the
 * book they returned contained in the book we asked for?*
 */
export function titleCoverage(ours: string, theirs: string): number {
  const catalogue = tokens(theirs)
  if (catalogue.size === 0) return 0

  const mine = tokens(ours)
  let shared = 0
  for (const word of catalogue) if (mine.has(word)) shared += 1
  return shared / catalogue.size
}

/** Enough of the catalogue's title, when we know the author agrees. */
const WITH_AUTHOR = 0.5

/** Nearly all of it, when we have no author to corroborate with. */
const WITHOUT_AUTHOR = 0.8

export interface Candidate {
  title?: string
  authors?: string[]
  printType?: string
}

export interface Verdict {
  accepted: boolean
  /** Plain enough to put in a log and understand a year later. */
  reason: string
}

/**
 * Whether this candidate is the book.
 *
 * An ISBN match skips all of it — that is an identifier, not a guess, and a
 * title that looks nothing like ours is a retitled edition rather than a wrong
 * book.
 */
export function judge(
  ourTitle: string,
  ourAuthor: string | undefined,
  candidate: Candidate,
): Verdict {
  // Study guides, audiobooks and magazines share titles with the real thing.
  if ((candidate.printType ?? 'BOOK') !== 'BOOK') {
    return { accepted: false, reason: `not a book (${candidate.printType})` }
  }

  const coverage = titleCoverage(ourTitle, candidate.title ?? '')
  const author = sharesAuthor(ourAuthor, candidate.authors)

  if (author === false) {
    return { accepted: false, reason: 'different author' }
  }

  // No author on either side, so the title is carrying the whole burden and the
  // bar goes up. This is what caught `Kundalini` — a book on the shelf with no
  // author recorded, whose one-word title matches a dozen unrelated volumes.
  const needed = author === undefined ? WITHOUT_AUTHOR : WITH_AUTHOR
  const context = author === undefined ? 'no author to check' : 'author agrees'

  return {
    accepted: coverage >= needed,
    reason: `${context}; title coverage ${coverage.toFixed(2)} of ${needed.toFixed(2)} needed`,
  }
}
