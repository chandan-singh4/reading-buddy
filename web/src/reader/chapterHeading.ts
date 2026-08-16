/**
 * How a chapter's opening should be set.
 *
 * A printed book does not letter every chapter opening the same way, and the
 * way it letters them is a fact about the *book*, not about the chapter: a
 * devotional text ornaments every opening, a novel gives every one a nameplate.
 * So two of the four styles are chosen from the publisher's own subject
 * headings, and only the remaining books fall through to a per-chapter rule.
 *
 * Pure on purpose. The component that draws these has nothing to decide.
 */

/** The four ways a chapter can open. */
export type ChapterHeadingStyle = 'ornamental' | 'nameplate' | 'numeral' | 'minimal'

/**
 * A publisher's subject headings, cut into single words the app can test.
 *
 * BISAC headings arrive as one string per heading with slashes inside it —
 * "Religion / Spirituality", "Philosophy / Spirituality", "Fiction / Classics".
 * The interesting part is always one of the pieces, never the whole string, so
 * the slashes are cut and each piece becomes its own tag.
 */
export function subjectTags(subjects: readonly string[] | undefined): string[] {
  if (!subjects) return []
  const tags = new Set<string>()
  for (const subject of subjects) {
    for (const piece of subject.split('/')) {
      const tag = piece.trim().toLowerCase()
      if (tag) tags.add(tag)
    }
  }
  return [...tags]
}

const ORNAMENTAL_TAGS = ['religion', 'religious', 'spirituality', 'spiritual', 'bibles']
const NAMEPLATE_TAGS = ['fiction', 'classics', 'literature', 'literary criticism']

/** Roman numerals, as a chapter is ever numbered — no need for the full grammar. */
const ROMAN = /^(?=[ivxlcdm])m*(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

function romanValue(text: string): number {
  const digits = [...text.toLowerCase()].map((letter) => ROMAN_VALUES[letter] ?? 0)
  let total = 0
  for (let i = 0; i < digits.length; i += 1) {
    const next = digits[i + 1] ?? 0
    total += digits[i] < next ? -digits[i] : digits[i]
  }
  return total
}

/** The words a book puts in front of a chapter number. */
const LABEL = /^(chapter|part|book|section|canto|lesson|day|week|step)\b[\s.:—–-]*/i

/** What a numbered chapter title breaks into. */
export interface ChapterNumber {
  /** "Chapter", "Part" — or "Chapter" by default when the title only had a digit. */
  label: string
  /** The numeral as the book wrote it: "6", "IV". */
  numeral: string
  /** The name after the number, if the title carried one. */
  rest: string
}

/**
 * Read a chapter number off the front of a chapter's title.
 *
 * Handles "Chapter 6", "6. The Wave", "IV — Return", "Part Two" is *not*
 * handled on purpose: a spelled-out number is a word, and setting the word in
 * 62px type looks like a mistake rather than a numeral.
 *
 * Returns `null` when the title is purely a name, which is the signal to fall
 * through to the plain style.
 */
export function chapterNumber(title: string | undefined): ChapterNumber | null {
  if (!title) return null
  const trimmed = title.trim()
  if (!trimmed) return null

  const labelMatch = LABEL.exec(trimmed)
  const label = labelMatch ? labelMatch[1] : 'Chapter'
  const afterLabel = labelMatch ? trimmed.slice(labelMatch[0].length) : trimmed

  const token = /^([0-9]+|[ivxlcdmIVXLCDM]+)\b[\s.:—–)]*/.exec(afterLabel)
  if (!token) return null

  const numeral = token[1]
  const arabic = /^[0-9]+$/.test(numeral)
  // A lone "I" is far more often the word than the numeral, and a title that
  // opens with the word "I" is a sentence, not a number.
  if (!arabic && !labelMatch && numeral.toLowerCase() === 'i') return null
  if (!arabic && (!ROMAN.test(numeral) || romanValue(numeral) === 0)) return null

  return {
    // Capitalised here rather than in CSS: the style upper-cases it anyway, and
    // a label read by a screen reader should be a word, not a shout.
    label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
    numeral,
    rest: afterLabel.slice(token[0].length).trim(),
  }
}

/**
 * Which style this chapter opening takes. First match wins.
 *
 * 1. A religious or spiritual book — ornamented, every chapter.
 * 2. Fiction, classics or literature — a formal nameplate, every chapter.
 * 3. A chapter whose title carries a number — the oversized numeral.
 * 4. Anything else — the plain modern setting, with no numeral invented for it.
 */
export function chapterHeadingStyle(
  subjects: readonly string[] | undefined,
  title: string | undefined,
): ChapterHeadingStyle {
  const tags = subjectTags(subjects)
  if (tags.some((tag) => ORNAMENTAL_TAGS.includes(tag))) return 'ornamental'
  if (tags.some((tag) => NAMEPLATE_TAGS.includes(tag))) return 'nameplate'
  if (chapterNumber(title)) return 'numeral'
  return 'minimal'
}
