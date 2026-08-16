/**
 * The chapter title, set as a designed thing rather than as big body text.
 *
 * Four settings, one chosen per book or per chapter by `chapterHeading.ts`.
 * This file only draws; every decision is made there, so a theme or a setting
 * can force a style later by passing `style` without any of the rules moving.
 */

import { chapterHeadingStyle, chapterNumber, type ChapterHeadingStyle } from './chapterHeading.ts'
import styles from './ChapterOpening.module.css'

export interface ChapterOpeningProps {
  /** The chapter's name from the manifest — "Chapter 6", "The Wave". */
  chapterTitle?: string
  /** The section's own title, where the book gave one. */
  sectionTitle?: string
  /** The publisher's subject headings for the book. */
  subjects?: readonly string[]
  /** Force a setting. Left out, the rules decide. */
  style?: ChapterHeadingStyle
}

export function ChapterOpening({
  chapterTitle,
  sectionTitle,
  subjects,
  style,
}: ChapterOpeningProps) {
  const chosen = style ?? chapterHeadingStyle(subjects, chapterTitle)
  const parts = chapterNumber(chapterTitle)

  // The name to print large. A numbered title has already spent its number, so
  // what is left is the name — and where the number was the whole title, the
  // section's own heading is the only name there is.
  const name = parts ? parts.rest || sectionTitle || '' : (sectionTitle ?? chapterTitle ?? '')

  // The quiet line above the name — "Chapter 6", or the chapter's own name
  // where a section under it supplied the large one. Dropped when it would only
  // repeat the name, which is what a one-section chapter always does.
  const label = parts
    ? `${parts.label} ${parts.numeral}`
    : chapterTitle && chapterTitle !== name
      ? chapterTitle
      : undefined

  if (chosen === 'ornamental') {
    return (
      <div className={`${styles.opening} ${styles.ornamental}`}>
        <span className={styles.ornament} aria-hidden="true">
          ❈
        </span>
        {label && name && <p className={styles.ornamentalLabel}>{label}</p>}
        <h2 className={styles.ornamentalTitle}>{name || label}</h2>
        <span className={styles.rosette} aria-hidden="true">
          <i />✦<i className={styles.right} />
        </span>
      </div>
    )
  }

  if (chosen === 'nameplate') {
    return (
      <div className={`${styles.opening} ${styles.nameplate}`}>
        <div className={styles.plate}>
          {label && <p className={styles.plateLabel}>{label}</p>}
          <h2 className={styles.plateTitle}>{name || label}</h2>
        </div>
      </div>
    )
  }

  if (chosen === 'numeral' && parts) {
    return (
      <div className={`${styles.opening} ${styles.numeral}`}>
        {/* The figure is decoration: the same number is read out in the label
            beside it, and a screen reader saying "6 Chapter 6" helps nobody. */}
        <span className={styles.figure} aria-hidden="true">
          {parts.numeral}
        </span>
        <div className={styles.numeralText}>
          <p className={styles.numeralLabel}>
            {parts.label} {parts.numeral}
          </p>
          {name && <h2 className={styles.numeralTitle}>{name}</h2>}
        </div>
      </div>
    )
  }

  // Modern minimal. No numeral is invented for a chapter that has none — that
  // is the whole reason this style exists.
  return (
    <div className={`${styles.opening} ${styles.minimal}`}>
      {label && name && <p className={styles.minimalLabel}>{label}</p>}
      <h2 className={styles.minimalTitle}>{name || label}</h2>
      <span className={styles.tick} aria-hidden="true" />
    </div>
  )
}
