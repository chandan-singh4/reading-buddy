/**
 * Where you are in a book, said honestly.
 *
 * No page numbers, anywhere. A page number changes with the font, the margins
 * and the screen, so it describes the device rather than the book — see the
 * pagination note in `backlog.md`. Chapters don't move, so they are what the
 * reader is told.
 *
 * Everything here is derived from the manifest, which is one line per chapter
 * and already in memory. Nothing loads a section to answer "how far in am I".
 */

import type { Manifest } from '../structure/index.ts'
import type { SectionRef } from './navigation.ts'

export interface Progress {
  /** 1-based, and clamped to the book — a stale position can't point past the end. */
  chapter: number
  chapterCount: number
  /** 0 to 1, for the slider. Start of chapter 1 is 0; start of the last is 1. */
  fraction: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function progressOf(manifest: Manifest, here: SectionRef): Progress {
  const chapterCount = manifest.chapters.length
  const chapter = clamp(here.chapter, 1, Math.max(chapterCount, 1))

  // A single-chapter book is entirely "at the start": there is nowhere to
  // slide to, and 0/0 would otherwise be a division by zero.
  const fraction = chapterCount <= 1 ? 0 : (chapter - 1) / (chapterCount - 1)

  return { chapter, chapterCount, fraction }
}

/**
 * The one line shown under the slider. Deliberately says *chapter*, not page,
 * and not a percentage — a percentage over chapters would imply chapters are
 * the same length, which they never are.
 */
export function progressLabel(manifest: Manifest, here: SectionRef): string {
  const { chapter, chapterCount } = progressOf(manifest, here)
  const title = manifest.chapters.find((entry) => entry.chapter === chapter)?.title

  const position = `Chapter ${chapter} of ${chapterCount}`
  return title ? `${position} · ${title}` : position
}

/** Which chapter a slider position means. The inverse of `progressOf`. */
export function chapterAt(manifest: Manifest, fraction: number): number {
  const chapterCount = manifest.chapters.length
  if (chapterCount <= 1) return 1

  const raw = Math.round(fraction * (chapterCount - 1)) + 1
  return clamp(raw, 1, chapterCount)
}
