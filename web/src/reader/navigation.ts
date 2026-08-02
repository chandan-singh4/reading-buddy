/**
 * Moving between sections, without ever knowing what a book contains.
 *
 * These are the only functions that decide "what comes next", and they are
 * deliberately ignorant: they know how many chapters the book has (from the
 * manifest, one line each) and how many sections a *given* chapter has (looked
 * up on demand). They never see a list of every section in the book, because
 * nothing in Reading Buddy ever holds one — that is the whole token strategy,
 * and it would be quietly undone by a convenient `allSections` array here.
 *
 * The lookup is passed in rather than reached for, which keeps these testable
 * against a plain object and lets the reader cache chapter indexes as it goes.
 */

import type { Manifest, SectionPath } from '../structure/index.ts'
import { sectionPath } from '../structure/index.ts'

/** Where the reader is: a chapter and a section within it. Both 1-based. */
export interface SectionRef {
  chapter: number
  section: number
}

/**
 * How many sections a chapter has. Returns `undefined` for a chapter that isn't
 * there — a manifest can outlive the chapter rows if a write was interrupted,
 * and a missing chapter should stop navigation, not crash it.
 */
export type SectionCountLookup = (chapter: number) => Promise<number | undefined>

/** The storage key for a ref. The path *is* the address — see `architecture.md`. */
export function pathOf(ref: SectionRef): SectionPath {
  return sectionPath(ref.chapter, ref.section)
}

/** Where a book opens. Always the beginning until WP-15 remembers otherwise. */
export function firstSection(): SectionRef {
  return { chapter: 1, section: 1 }
}

function chapterCount(manifest: Manifest): number {
  return manifest.chapters.length
}

/**
 * The section after this one, or `undefined` at the end of the book.
 *
 * Crossing into the next chapter costs one lookup — of the *current* chapter,
 * to find out whether we're at its end. The next chapter's first section is
 * always section 1, so no second lookup is needed.
 */
export async function nextSection(
  manifest: Manifest,
  current: SectionRef,
  sectionsIn: SectionCountLookup,
): Promise<SectionRef | undefined> {
  const inThisChapter = await sectionsIn(current.chapter)
  if (inThisChapter === undefined) return undefined

  if (current.section < inThisChapter) {
    return { chapter: current.chapter, section: current.section + 1 }
  }

  if (current.chapter < chapterCount(manifest)) {
    return { chapter: current.chapter + 1, section: 1 }
  }

  return undefined
}

/**
 * The section before this one, or `undefined` at the start of the book.
 *
 * Going *back* across a chapter boundary is the asymmetric case: the previous
 * chapter's last section could be its 3rd or its 30th, so it has to be looked
 * up. That single lookup is why these functions are async at all.
 *
 * Takes no manifest, unlike `nextSection`: chapter 1 is always the first
 * chapter, so nothing about the book as a whole is needed to know when to stop.
 */
export async function previousSection(
  current: SectionRef,
  sectionsIn: SectionCountLookup,
): Promise<SectionRef | undefined> {
  if (current.section > 1) {
    return { chapter: current.chapter, section: current.section - 1 }
  }

  if (current.chapter <= 1) return undefined

  const previousChapter = current.chapter - 1
  const inPrevious = await sectionsIn(previousChapter)
  // A chapter recorded in the manifest but holding no sections would otherwise
  // yield section 0, which addresses nothing. Refusing to move is the honest
  // answer; the reader shows a disabled control rather than a dead end.
  if (inPrevious === undefined || inPrevious < 1) return undefined

  return { chapter: previousChapter, section: inPrevious }
}

/** The chapter's title, for the one line of context the bare page shows. */
export function chapterTitle(manifest: Manifest, chapter: number): string | undefined {
  return manifest.chapters.find((entry) => entry.chapter === chapter)?.title
}
