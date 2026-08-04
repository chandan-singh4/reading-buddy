/**
 * Rescuing a title from a citation dump.
 *
 * Some epubs — especially ones that passed through a download/conversion
 * pipeline such as Anna's Archive — carry a `<dc:title>` that isn't a title at
 * all: the real title run straight into the author, the publisher, an ISBN, a
 * content hash and a trailing "Anna's Archive" credit, with no punctuation
 * marking where one field ends and the next begins (`The Book Author,
 * Firstname Place of publication not identified, 2009 9780307566126
 * 60cda61f8cf1d1443efe944bb205a3a2 Anna's Archive`). None of that was ever
 * something a reader chose to see, so once any of it is spotted, the title is
 * cut right there — everything from the earliest match onward is dropped.
 *
 * This is a best effort, not a guarantee: a subtitle mashed into the same
 * run-on string with no marker of its own (no author, no ISBN, nothing this
 * function recognises) can't be told apart from the real title
 * algorithmically. The book's own detail page offers a manual rename for
 * exactly that gap.
 *
 * ---
 *
 * This lives in its own module, apart from `epub.ts`, because it has two
 * callers with different needs. The parser runs it on the way in. The *heal*
 * pass (`storage/healTitles.ts`) runs it again over books already on the shelf,
 * so improving the rules here fixes existing books without anyone re-importing
 * anything. That second caller is the whole reason `TITLE_CLEAN_VERSION` below
 * exists.
 */

/**
 * Bump this whenever the rules below change in a way that would produce a
 * better title for a book already on the shelf.
 *
 * This is deliberately *not* `PARSER_VERSION`. That one means "the text of this
 * book was produced by an older parser", and the only cure is re-reading the
 * original file — which needs the kept source, takes real time, and rewrites
 * every section. A title is one short string sitting in one row: it can be
 * recomputed from what is already stored, offline, in milliseconds. Tying the
 * two together would mean a title fix could only reach a reader who still had
 * the source file and thought to press Update, which is exactly the failure
 * this separation removes.
 *
 * History:
 *   1 — hash removal, ISBN / "Anna's Archive" / publisher / author-name cuts
 *       (the rules as they stood at `PARSER_VERSION` 6).
 *   2 — the shelf reads as a list of *titles*: a run-together subtitle is cut
 *       as well, and the citation markers widened (a bare author name, a
 *       stray `null`, a year, a binding word, an edition parenthetical).
 *   3 — an orphaned opening bracket left behind by a cut is removed: a shelf
 *       full of titles ending in a lone "(" was how round 2 came back. Volume
 *       markers join the bracket list, and `With` may open a subtitle when
 *       what follows it is long enough to be one.
 */
export const TITLE_CLEAN_VERSION = 3

export function cleanTitle(
  raw: string | null | undefined,
  author: string | undefined,
): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined

  // A stray hash is removed in place, not treated as a cut point: what comes
  // after it can be real title text (an edition marker like "Annotated"), and
  // a hash alone doesn't mean everything past it is a citation dump.
  const dehashed = trimmed
    .replace(/\b[0-9a-f]{16,40}\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // An edition marker in brackets is removed in place rather than cut at: it
  // sits *between* the title and whatever follows (`The Perennial Way (Expanded
  // Edition) New English Versions`), so cutting there would keep the subtitle
  // that comes after it.
  const unbracketed = dehashed
    .replace(
      /\s*[([][^)\]]*\b(?:edition|annotated|illustrated|revised|expanded|unabridged|reprint|translated|vol|volume|book \d|part \d)\b[^)\]]*[)\]]/gi,
      ' ',
    )
    .replace(/\s{2,}/g, ' ')
    .trim()

  // These markers are different: once one is spotted, everything from there
  // to the end really is a citation dump — an ISBN, a publisher credit, an
  // author's name never lead back into more title — so it's cut wholesale.
  // Markers come in two strengths, and the difference only shows at position 0.
  //
  // A *hard* marker is never title text under any circumstances — an ISBN, a
  // download-service credit, a field the pipeline printed as `null`. A title
  // made of nothing else is cut to nothing, and returning `undefined` is right:
  // the heal pass reads that as "no improvement" and keeps whatever the book
  // already had, which is better than a shelf row named `9780307566126`.
  //
  // A *soft* marker is only suspicious in company. `1984` is a year and a
  // novel; `Paperback Writer` is a binding and a song. At the very start of a
  // title, one of these is the title, so a match there is ignored.
  const hard: RegExp[] = [
    /\b\d{9,13}\b/g, // an ISBN
    /anna['’]s archive/gi,
    /place of publication not identified/gi,
    /\bnull\b/gi,
    /\buniversity press\b/gi,
  ]
  const soft: RegExp[] = [
    // A publication year, bounded to plausible ones.
    /\b(?:1[5-9]\d{2}|20\d{2})\b/g,
    /\b(?:paperback|hardcover|hardback|kindle|e-?book|audiobook)\b/gi,
    ...authorMarkers(author),
  ]

  let cut = unbracketed.length
  for (const marker of hard) {
    marker.lastIndex = 0
    const match = marker.exec(unbracketed)
    if (match && match.index < cut) cut = match.index
  }
  for (const marker of soft) {
    marker.lastIndex = 0
    for (let match = marker.exec(unbracketed); match; match = marker.exec(unbracketed)) {
      if (match.index === 0) continue
      if (match.index < cut) cut = match.index
      break
    }
  }

  const withoutDump = tidy(unbracketed.slice(0, cut))
  const subtitleCut = cutSubtitle(withoutDump)
  return tidy(subtitleCut) || withoutDump || undefined
}

/**
 * Trailing punctuation, orphaned brackets and connecting words that a cut can
 * strand at the end.
 *
 * The bracket case is the visible one: cutting inside `On Love (Picador
 * Classics)` leaves `On Love (`, and a shelf full of titles ending in a lone
 * open bracket looks broken — which is exactly how the reader reported it. An
 * unclosed bracket and everything after it goes, since whatever it opened was
 * cut away.
 */
function tidy(value: string): string {
  let text = value.replace(/\s{2,}/g, ' ').trim()

  // An opening bracket with no partner left. Repeated because removing one can
  // expose another (`Title (Series (Book 2`).
  for (;;) {
    const opened = Math.max(text.lastIndexOf('('), text.lastIndexOf('['))
    if (opened === -1) break
    const closed = Math.max(text.lastIndexOf(')'), text.lastIndexOf(']'))
    if (closed > opened) break
    text = text.slice(0, opened)
  }

  return text
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[\s,;:.\-–—&/]+$/, '')
    .replace(/\s+(?:by|of|and|with|from|for|in|the|a|an)$/i, '')
    .trim()
}

/**
 * Words that begin a subtitle far more often than they appear mid-title.
 *
 * Capitalisation is the real signal, not this list — see `cutSubtitle`. The
 * list only keeps the rule from firing on every capitalised word in a
 * title-cased string.
 */
const SUBTITLE_OPENERS = new Set([
  'a',
  'an',
  'the',
  'how',
  'why',
  'what',
  'new',
  'being',
  'selected',
  'essays',
  'notes',
  'stories',
  'poems',
  'lessons',
  'reflections',
  'teachings',
  'introduction',
  'translated',
])

/**
 * Openers that are only safe on a *long* tail.
 *
 * `With` starts plenty of subtitles ("The Gay Science With a Prelude in Rhymes
 * and an Appendix of Songs") and plenty of titles ("A Room With a View",
 * "Conversations With God"). Length tells them apart: a subtitle that runs on
 * for another four words is a subtitle, while two or three words after `With`
 * is the rest of a title.
 */
const WEAK_OPENERS = new Set(['with', 'without', 'including', 'featuring', 'edited', 'foreword'])

/** Words that make a following capitalised opener part of the title, not a new phrase. */
const CONTINUES_TITLE = new Set(['of', 'by', 'with', 'and', 'or', 'in', 'on', 'from', 'to', 'for'])

/** Fewest words a title must keep. Below this the "subtitle" is the title. */
const MIN_TITLE_WORDS = 2
/** Fewest words a subtitle must have to be worth cutting at all. */
const MIN_SUBTITLE_WORDS = 2
/** …and how many a weak opener needs behind it before it counts. */
const MIN_WEAK_SUBTITLE_WORDS = 4

/**
 * Cut a subtitle that was run together with the title, the punctuation between
 * them having been lost somewhere upstream (`The Quantum and the Lotus A
 * Journey to the Frontiers Where`).
 *
 * The signal is a **capitalised** article or subtitle-opener in the middle of
 * the string. English title case leaves articles and prepositions lowercase
 * mid-title — *the Middle Way*, *the Third Reich*, *a Hat* — so a capital `A`
 * or `The` partway through is almost always a second title-cased phrase
 * starting, which is what a subtitle is.
 *
 * This is a guess, and the reader asked for it knowing that: the shelf should
 * read as a column of titles. It is kept as narrow as the signal allows —
 * enough words either side, and never straight after a word the phrase is
 * grammatically hanging from (`The Good, The Bad`, `Alice and The Queen`) —
 * but a title that genuinely capitalises an article mid-way will be shortened.
 * The manual rename on the book's detail page is the way back.
 */
function cutSubtitle(title: string): string {
  const words = title.split(/\s+/).filter(Boolean)
  if (words.length < MIN_TITLE_WORDS + MIN_SUBTITLE_WORDS) return title

  for (let i = MIN_TITLE_WORDS; i <= words.length - MIN_SUBTITLE_WORDS; i += 1) {
    const word = words[i]
    // Capitalised, and a word that opens phrases rather than continuing one.
    if (!/^[A-Z]/.test(word)) continue
    const bare = word.toLowerCase().replace(/[^a-z]/g, '')
    const weak = WEAK_OPENERS.has(bare)
    if (!weak && !SUBTITLE_OPENERS.has(bare)) continue
    if (weak && words.length - i < MIN_WEAK_SUBTITLE_WORDS) continue

    const before = words[i - 1]
    // `The Good, The Bad` — the comma says these are items in one phrase.
    if (/[,;:&/-]$/.test(before)) continue
    // `The Autobiography of Malcolm X`, `Alice and The Queen` — the opener is
    // grammatically attached to what came before it.
    if (CONTINUES_TITLE.has(before.toLowerCase().replace(/[^a-z]/g, ''))) continue

    return words.slice(0, i).join(' ')
  }

  return title
}

/**
 * A known author's name, turned into patterns that catch it reappearing
 * citation-style inside a polluted title (`Ricard, Matthieu` for an author of
 * `Matthieu Ricard`) — the "Lastname, Firstname" shape these pipelines write
 * names in, wherever it shows up in the string.
 */
function authorMarkers(author: string | undefined): RegExp[] {
  if (!author) return []
  const names = author
    .split(/[,;]/)
    .flatMap((part) => part.trim().split(/\s+/))
    .filter((name) => name.length > 1)

  return names.map((name) => {
    // The lookbehind is the guard that makes a bare name safe to cut at. An
    // author's name inside a *real* title is nearly always hanging off a
    // preposition — `The Autobiography of Malcolm X`, `Conversations with
    // Ramana Maharshi` — and cutting there would amputate the title. Where the
    // citation dump puts it, there is no such word in front of it.
    //
    // The author's *other* names belong in that guard too. Without them only
    // the first word of a multi-word name is protected: `Conversations with
    // Ramana Maharshi` survives the `Ramana` marker on the preposition, then
    // loses its last word to the `Maharshi` one.
    const preceding = [
      'of',
      'by',
      'with',
      'and',
      'to',
      'for',
      'from',
      'on',
      'in',
      ...names.filter((other) => other !== name),
    ]
      .map(escapeRegExp)
      .join('|')

    // The name matches with or without the trailing comma the "Lastname,
    // Firstname" shape puts there — these dumps write the author both ways,
    // and often both ways in one string (`… Way Nagarjuna's Nagarjuna & Jay L
    // Garfield`).
    return new RegExp(`(?<!\\b(?:${preceding})\\s)\\b${escapeRegExp(name)}\\b`, 'gi')
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
