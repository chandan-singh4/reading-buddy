/**
 * Rescuing an author from `dc:creator`.
 *
 * The field is free text and nobody validates it, so a shelf built straight
 * from it ends up holding four different kinds of thing:
 *
 *   - a name with a stray separator on the end — `James Nestor;`, from a list
 *     that only ever had one entry in it;
 *   - a placeholder standing in for a name — `Unknown`, which every conversion
 *     tool writes and which tells the reader nothing a blank wouldn't;
 *   - the book's own title, or a line of its blurb, in the author's place —
 *     `Kundalini. The evolutionary energy in man`;
 *   - a real name, but in catalogue order — `Bown, Stephen R.` sitting in a
 *     column of `Albert Camus` and `Jon Krakauer`.
 *
 * Only the last of those is a judgement call; the first three are junk. Where
 * the string can't be a name at all, the answer is `undefined` — no author is
 * honest, and the shelf already knows how to show a book without one. A wrong
 * name is worse: it is indistinguishable from a right one.
 *
 * ---
 *
 * Like `cleanTitle`, this lives apart from `epub.ts` because it has two callers.
 * The parser runs it on the way in; the heal pass in `storage`'s `healTitles`
 * runs it again over books already on the shelf. An author is one short string
 * sitting in one row — recomputable from what is stored, with no source file
 * and no re-parse — so improving these rules reaches existing books at the next
 * boot. That pass is stamped with `TITLE_CLEAN_VERSION`, which is why changing
 * anything here means bumping that number.
 */

/**
 * Strings that occupy the field without naming anyone.
 *
 * `anonymous` is deliberately *not* here. It is a real and deliberate
 * attribution — the Cloud of Unknowing has an author, and "Anonymous" is what
 * the library calls them. `Unknown` is a tool giving up.
 */
const PLACEHOLDERS = new Set([
  'unknown',
  'unknown author',
  'author unknown',
  'no author',
  'not identified',
  'name of author not identified',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'author',
])

/**
 * Short words that legitimately end in a full stop inside a name.
 *
 * The sentence test below reads `Word. Capital` as prose, which is what catches
 * a title in the author's place. `St. John of the Cross` and `Prof. Kingsley`
 * have the same shape and are names, so the abbreviations get out of the way of
 * the rule rather than the rule being weakened for everyone.
 */
const ABBREVIATIONS = new Set([
  'st',
  'dr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'rev',
  'fr',
  'sri',
  'srila',
  'hon',
  'jr',
  'sr',
])

/** Trailing words that are a role or a generation, not a forename. */
const SUFFIXES = new Set([
  'jr',
  'sr',
  'ii',
  'iii',
  'iv',
  'phd',
  'md',
  'ed',
  'eds',
  'trans',
  'translator',
  'editor',
])

/**
 * The most words a name can run to before it stops being one.
 *
 * Generous on purpose — `Ngawang Losang Tenzin Gyatso` is four, and a
 * transliterated name with an honorific in front can reach six. A title in the
 * author's place is almost always longer than that, and the sentence test
 * catches the short ones.
 */
const MAX_NAME_WORDS = 6

/**
 * Turn whatever `dc:creator` said into a name, or into nothing.
 *
 * Several authors separated by semicolons are kept, each cleaned on its own and
 * rejoined with commas — which is also what quietly repairs `James Nestor;`,
 * since the empty second entry simply drops out.
 */
export function cleanAuthor(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined

  const names: string[] = []
  for (const part of trimmed.split(';')) {
    const name = cleanOne(part)
    // Case-insensitive, because a file listing the same person twice in two
    // capitalisations is a file that has been through a conversion tool.
    if (name && !names.some((seen) => seen.toLowerCase() === name.toLowerCase())) {
      names.push(name)
    }
  }

  return names.length > 0 ? names.join(', ') : undefined
}

function cleanOne(part: string): string | undefined {
  const text = part
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Separators stranded at either end by a list with a gap in it. The full
    // stop is spared at the end: `Bown, Stephen R.` earns its own.
    .replace(/^[\s,;:.]+/, '')
    .replace(/[\s,;:]+$/, '')
    .trim()

  if (!text) return undefined
  if (PLACEHOLDERS.has(text.toLowerCase().replace(/\./g, ''))) return undefined
  if (!looksLikeName(text)) return undefined

  return catalogueOrder(text)
}

/**
 * Whether a string could be somebody's name.
 *
 * Three signals, all of them about *prose* rather than about names, because
 * there is no describing what a name looks like across every language a shelf
 * might hold. What can be said is that names are short, contain no sentences,
 * and have no ISBNs in them.
 */
function looksLikeName(text: string): boolean {
  if (text.split(/\s+/).length > MAX_NAME_WORDS) return false

  // A run of digits long enough to be an identifier rather than a regnal number.
  if (/\d{4,}/.test(text)) return false

  // Prose punctuation. A question or exclamation mark never appears in a name;
  // a full stop does, but only after an initial or a known abbreviation.
  if (/[!?]/.test(text)) return false
  for (const match of text.matchAll(/(\S+?)\.\s+\S/g)) {
    const word = match[1].toLowerCase().replace(/[^a-z]/g, '')
    if (word.length > 1 && !ABBREVIATIONS.has(word)) return false
  }

  return true
}

/**
 * `Bown, Stephen R.` → `Stephen R. Bown`.
 *
 * Catalogue order exists so that names sort by surname, which matters in a card
 * index and not at all on a shelf that sorts by title and recency. Mixed in
 * among `Albert Camus` and `Jon Krakauer` it just reads as a mistake.
 *
 * Narrow by design: one comma, a plausible number of words either side, and
 * never when what follows the comma is a suffix (`King, Jr.`) rather than a
 * forename. Anything else is left exactly as the file wrote it — an author
 * shown in the wrong order is legible, and one reassembled wrongly is not.
 */
function catalogueOrder(text: string): string {
  const parts = text.split(',')
  if (parts.length !== 2) return text

  const last = parts[0].trim()
  const first = parts[1].trim()
  if (!last || !first) return text
  if (SUFFIXES.has(first.toLowerCase().replace(/\./g, ''))) return text
  if (last.split(/\s+/).length > 2 || first.split(/\s+/).length > 3) return text

  return `${first} ${last}`
}
