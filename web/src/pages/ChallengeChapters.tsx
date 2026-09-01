/**
 * Which chapter Veda is asking about.
 *
 * ## Why this is a real list and not a `<select>`
 *
 * A native select would be four lines of code and would show "Chapter 7" in a
 * grey box. The thing being chosen here is a *chapter of a book* — it has a
 * title, and the title is what a reader recognises. A row with the number set
 * small beside the name is how the contents page in the reader already does it,
 * and this is the same choice being made in a different room.
 *
 * It is also a sheet rather than a dropdown for a plain reason: a book has
 * thirty chapters, and a dropdown anchored to a button at the top of the screen
 * would open downward over the question. A sheet from the foot is where a
 * thumb already is.
 */

import { useEffect, useRef, useState } from 'react'

import type { ManifestChapter } from '../structure/index.ts'
import styles from './challenge.module.css'

export interface ChapterPickerProps {
  chapters: readonly ManifestChapter[]
  chapter: number
  /** What to call this chapter. Already resolved by the page. */
  chapterTitle: string
  onPick: (chapter: number) => void
}

export function ChapterPicker({
  chapters,
  chapter,
  chapterTitle,
  onPick,
}: ChapterPickerProps) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const name = chapterTitle || `Chapter ${chapter}`

  /*
   * Open the list *at* the chapter you are on. A reader on chapter 24 of 31
   * should not have to scroll to find where they are, and the row above and
   * below are the two most likely next choices.
   */
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-here="true"]')?.scrollIntoView({ block: 'center' })
  }, [open])

  // Escape closes it, the way the reader's own sheets already behave.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className={styles.pick}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={styles.pickNo}>Ch. {chapter}</span>
        <span className={styles.pickName}>{name}</span>
        <span className={styles.pickChevron} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* A large invisible target that means "no thanks". Not a button:
              announcing it would be noise, and the ✕ is the announced way out. */}
          <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />

          <div className={styles.sheet} role="dialog" aria-label="Choose a chapter">
            <div className={styles.sheetHead}>
              <h2 className={styles.sheetTitle}>Ask me about</h2>
              <button
                type="button"
                className={styles.sheetClose}
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className={styles.sheetList} ref={listRef}>
              {chapters.length === 0 && (
                <p className={styles.waiting}>This book has no chapter list yet.</p>
              )}
              {chapters.map((entry) => (
                <button
                  key={entry.chapter}
                  type="button"
                  data-here={entry.chapter === chapter}
                  className={
                    entry.chapter === chapter ? `${styles.row} ${styles.rowHere}` : styles.row
                  }
                  aria-current={entry.chapter === chapter ? 'true' : undefined}
                  onClick={() => {
                    setOpen(false)
                    if (entry.chapter !== chapter) onPick(entry.chapter)
                  }}
                >
                  <span className={styles.rowNo}>{entry.chapter}</span>
                  <span className={styles.rowName}>{entry.title}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
