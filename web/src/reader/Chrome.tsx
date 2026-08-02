/**
 * Everything on the reading screen that isn't the book.
 *
 * Purely presentational — it is handed where you are and told what to call when
 * you want to be somewhere else. No storage, no routing decisions. That keeps
 * it testable on its own and, more importantly, keeps the reading page free of
 * the question "is the overlay showing?" beyond a single boolean.
 *
 * It layers *over* the text rather than sitting beside it, which is the whole
 * reason WP-12 was built bare: hiding this removes nothing and reveals nothing
 * — the text underneath never moves.
 */

import { Link } from 'react-router'

import { chapterAt, progressLabel, progressOf } from './progress.ts'
import type { SectionRef } from './navigation.ts'
import type { Manifest } from '../structure/index.ts'
import styles from './Chrome.module.css'

export interface ChromeProps {
  bookTitle: string
  manifest: Manifest
  here: SectionRef
  /** Whether the overlay is currently on screen. */
  shown: boolean
  focusMode: boolean
  contentsOpen: boolean
  onToggleFocus: () => void
  onToggleContents: () => void
  /** Go to the first section of a chapter. */
  onJumpToChapter: (chapter: number) => void
}

export function Chrome({
  bookTitle,
  manifest,
  here,
  shown,
  focusMode,
  contentsOpen,
  onToggleFocus,
  onToggleContents,
  onJumpToChapter,
}: ChromeProps) {
  const { chapter, chapterCount, fraction } = progressOf(manifest, here)

  return (
    // `inert` rather than unmounted: the overlay keeps its scroll position in
    // the contents list, and a hidden control must not be reachable by tab or
    // by a screen reader while it is invisible.
    <div className={styles.chrome} data-shown={shown} inert={!shown}>
      <header className={styles.bar}>
        <Link to="/" className={styles.control}>
          ← Library
        </Link>

        <span className={styles.bookTitle}>{bookTitle}</span>

        <button
          type="button"
          className={styles.control}
          aria-pressed={focusMode}
          onClick={onToggleFocus}
        >
          {focusMode ? 'Focus on' : 'Focus off'}
        </button>
      </header>

      {contentsOpen && (
        <nav className={styles.contents} aria-label="Contents">
          <ul>
            {manifest.chapters.map((entry) => (
              <li key={entry.chapter}>
                <button
                  type="button"
                  className={styles.contentsItem}
                  aria-current={entry.chapter === chapter ? 'true' : undefined}
                  onClick={() => onJumpToChapter(entry.chapter)}
                >
                  <span className={styles.contentsNumber}>{entry.chapter}</span>
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <footer className={styles.bar}>
        <button
          type="button"
          className={styles.control}
          aria-expanded={contentsOpen}
          onClick={onToggleContents}
        >
          Contents
        </button>

        <div className={styles.progress}>
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={100}
            // Chapters, not pages. The slider is coarse on purpose: it moves
            // you *near* somewhere, and the contents list moves you exactly.
            value={Math.round(fraction * 100)}
            aria-label="Move through the book"
            aria-valuetext={`Chapter ${chapter} of ${chapterCount}`}
            disabled={chapterCount <= 1}
            onChange={(event) => {
              onJumpToChapter(chapterAt(manifest, Number(event.target.value) / 100))
            }}
          />
          <span className={styles.progressLabel}>{progressLabel(manifest, here)}</span>
        </div>
      </footer>
    </div>
  )
}
