/**
 * The anchor grammar: `[ch02-s03-p013]` = chapter 2, section 3, paragraph 13.
 *
 * Anchors are permanent once assigned (`docs/decisions.md`), so every function
 * here is strict by design. A malformed anchor must fail loudly — a *plausible
 * but wrong* permanent id is far worse than a crash, because it silently
 * mis-addresses saved highlights and notes forever.
 *
 * Canonical form only: zero-padded to at least 2/2/3 digits, lower-case,
 * bracketed, no whitespace. `[ch2-s3-p13]` is rejected rather than repaired,
 * so there is exactly one spelling of any given location.
 */

import type {
  Anchor,
  AnchorParts,
  ChapterPath,
  SectionPath,
} from './types.ts'

const CHAPTER_DIGITS = 2
const SECTION_DIGITS = 2
const PARAGRAPH_DIGITS = 3

/**
 * `{2,}` rather than `{2}` so books with more than 99 chapters still work:
 * numbers grow past the pad width instead of being truncated or wrapping.
 */
const ANCHOR_PATTERN = /^\[ch(\d{2,})-s(\d{2,})-p(\d{3,})\]$/

export class AnchorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnchorError'
  }
}

function assertCoordinate(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new AnchorError(
      `${label} must be a positive whole number, received ${String(value)}`,
    )
  }
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Build the canonical anchor for a location. Throws on invalid coordinates. */
export function formatAnchor(parts: AnchorParts): Anchor {
  assertCoordinate(parts.chapter, 'chapter')
  assertCoordinate(parts.section, 'section')
  assertCoordinate(parts.paragraph, 'paragraph')

  const chapter = pad(parts.chapter, CHAPTER_DIGITS)
  const section = pad(parts.section, SECTION_DIGITS)
  const paragraph = pad(parts.paragraph, PARAGRAPH_DIGITS)

  return `[ch${chapter}-s${section}-p${paragraph}]` as Anchor
}

/**
 * Parse an anchor, or return `null` if it isn't one. Use this when the input is
 * expected to be untrusted (scanning prose for anchors, reading old data).
 */
export function tryParseAnchor(value: string): AnchorParts | null {
  const match = ANCHOR_PATTERN.exec(value)
  if (!match) return null

  const parts: AnchorParts = {
    chapter: Number(match[1]),
    section: Number(match[2]),
    paragraph: Number(match[3]),
  }

  // `ch00` matches the shape but addresses nothing — reject it as malformed.
  if (parts.chapter < 1 || parts.section < 1 || parts.paragraph < 1) return null

  return parts
}

/** Parse an anchor. Throws when the input isn't a canonical anchor. */
export function parseAnchor(value: string): AnchorParts {
  const parts = tryParseAnchor(value)
  if (!parts) {
    throw new AnchorError(
      `Not a canonical anchor: ${JSON.stringify(value)} ` +
        `(expected the form [ch02-s03-p013])`,
    )
  }
  return parts
}

/** Type guard — narrows a plain string to a validated `Anchor`. */
export function isAnchor(value: string): value is Anchor {
  return tryParseAnchor(value) !== null
}

// --- Addresses --------------------------------------------------------------
// In the browser there is no filesystem: these paths are used verbatim as
// storage keys. The mental model from the spec is unchanged — the path is still
// the address — only the lookup mechanism differs. See `docs/architecture.md`.

/** `ch02` — the chapter's address. */
export function chapterPath(chapter: number): ChapterPath {
  assertCoordinate(chapter, 'chapter')
  return `ch${pad(chapter, CHAPTER_DIGITS)}` as ChapterPath
}

/** `ch02/s03` — the section's address, and its storage key. */
export function sectionPath(chapter: number, section: number): SectionPath {
  assertCoordinate(chapter, 'chapter')
  assertCoordinate(section, 'section')
  return `${chapterPath(chapter)}/s${pad(section, SECTION_DIGITS)}` as SectionPath
}

/** The section an anchor points into — the retrieval unit to load. */
export function sectionPathOf(anchor: string): SectionPath {
  const { chapter, section } = parseAnchor(anchor)
  return sectionPath(chapter, section)
}
