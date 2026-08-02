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
 *
 * WP-40 shaped the bottom half after Google Books, which the reader uses daily:
 * a hamburger on the left opening a tabbed sheet, a tappable status line that
 * cycles through three states, a percentage on the right, and a slider that
 * moves one page at a time.
 */

import { useRef } from 'react'
import { Link } from 'react-router'

import { advanceBar, barLabel, showsPercent, type BarState } from './bar.ts'
import { stepThrough, swipeOf, type Touch } from './swipe.ts'
import { progressLabel, progressOf, type Pages } from './progress.ts'
import type { SectionRef } from './navigation.ts'
import type { Manifest } from '../structure/index.ts'
import styles from './Chrome.module.css'

/** The sheet's three tabs. Two are stubs until WP-14 and WP-25. */
export type SheetTab = 'contents' | 'bookmarks' | 'notes'

export interface ChromeProps {
  bookTitle: string
  manifest: Manifest
  here: SectionRef
  /**
   * Where you are in pages, or `null` for a book that doesn't know its own
   * length yet. `null` costs the page number and the fine slider; the chapter
   * line and the contents list carry on regardless.
   *
   * Worked out by the reading page rather than here, because it depends on
   * which paragraph is on screen — something this component deliberately can't
   * see. Chrome stays presentational.
   */
  pages: Pages | null
  /** Whether the overlay is currently on screen. */
  shown: boolean
  focusMode: boolean
  sheetOpen: boolean
  sheetTab: SheetTab
  barState: BarState
  onToggleFocus: () => void
  onToggleSheet: () => void
  onSelectTab: (tab: SheetTab) => void
  onBarStateChange: (state: BarState) => void
  /** Go to the first section of a chapter. */
  onJumpToChapter: (chapter: number) => void
  /** Go to a page — which may be inside the section already on screen. */
  onJumpToPage: (page: number) => void
}

const TABS: { id: SheetTab; label: string }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'notes', label: 'Notes' },
]

export function Chrome({
  bookTitle,
  manifest,
  here,
  pages,
  shown,
  focusMode,
  sheetOpen,
  sheetTab,
  barState,
  onToggleFocus,
  onToggleSheet,
  onSelectTab,
  onBarStateChange,
  onJumpToChapter,
  onJumpToPage,
}: ChromeProps) {
  const { chapter, chapterCount } = progressOf(manifest, here)
  const label = barLabel(barState, pages, progressLabel(manifest, here))

  /**
   * Where the finger went down on the sheet. A ref rather than state: it
   * changes on every touch and nothing renders from it, so putting it in state
   * would re-render the whole overlay mid-gesture.
   */
  const touchStart = useRef<Touch | null>(null)

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0]
    touchStart.current = point ? { x: point.clientX, y: point.clientY } : null
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const from = touchStart.current
    const point = event.changedTouches[0]
    touchStart.current = null
    if (!from || !point) return

    const next = stepThrough(
      TABS.map((tab) => tab.id),
      sheetTab,
      swipeOf(from, { x: point.clientX, y: point.clientY }),
    )
    if (next !== sheetTab) onSelectTab(next)
  }

  return (
    <>
    {/* `inert` rather than unmounted: the overlay keeps its scroll position in
        the contents list, and a hidden control must not be reachable by tab or
        by a screen reader while it is invisible. */}
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

      {/*
        The space above the sheet, which closes it. Without this the sheet
        filled everything between the two bars, so there was nowhere to tap to
        mean "no thanks" and the only way out was to find the ☰ again.

        Not a button: it is a large invisible target, so announcing it to a
        screen reader would be noise — the ☰ toggle and the back gesture are the
        two routes that get announced.
      */}
      {sheetOpen && (
        <div
          className={styles.scrim}
          data-scrim="true"
          onClick={onToggleSheet}
          aria-hidden="true"
        />
      )}

      {sheetOpen && (
        // Swipe sideways to change tab — the row of tabs is a row, so a
        // sideways gesture is what it looks like it should answer to. Tapping a
        // tab still works and is still the announced route; this is the
        // shortcut, not the only way.
        <div className={styles.sheet} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className={styles.tabs} role="tablist" aria-label="Book navigation">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`sheet-tab-${tab.id}`}
                aria-selected={tab.id === sheetTab}
                aria-controls={`sheet-panel-${tab.id}`}
                className={styles.tab}
                onClick={() => onSelectTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {sheetTab === 'contents' && (
            <nav
              role="tabpanel"
              id="sheet-panel-contents"
              aria-labelledby="sheet-tab-contents"
              className={styles.sheetPanel}
            >
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

          {/*
            Deliberately built as three tabs with two empty, rather than as a
            contents list to be widened later. The empty state names the
            waypoint so it reads as "not yet" rather than "broken".
          */}
          {sheetTab === 'bookmarks' && (
            <div
              role="tabpanel"
              id="sheet-panel-bookmarks"
              aria-labelledby="sheet-tab-bookmarks"
              className={styles.sheetPanel}
            >
              <p className={styles.empty}>
                Bookmarks arrive with the reading controls — you’ll be able to mark a
                place and name it.
              </p>
            </div>
          )}

          {sheetTab === 'notes' && (
            <div
              role="tabpanel"
              id="sheet-panel-notes"
              aria-labelledby="sheet-tab-notes"
              className={styles.sheetPanel}
            >
              <p className={styles.empty}>
                Notes and highlights arrive with the tutor — anything you ask about gets
                saved here, filed by chapter.
              </p>
            </div>
          )}
        </div>
      )}

      <footer className={styles.bar}>
        {/*
          The slider moves one page at a time when the book knows its length,
          and falls back to the coarse chapter slider when it doesn't — WP-13's
          behaviour, kept as the floor rather than deleted.
        */}
        {pages ? (
          <input
            className={styles.slider}
            type="range"
            min={1}
            max={pages.pageCount}
            value={pages.page}
            aria-label="Move through the book"
            aria-valuetext={`Page ${pages.page} of ${pages.pageCount}`}
            disabled={pages.pageCount <= 1}
            onChange={(event) => onJumpToPage(Number(event.target.value))}
          />
        ) : (
          <input
            className={styles.slider}
            type="range"
            min={1}
            max={Math.max(chapterCount, 1)}
            value={chapter}
            aria-label="Move through the book"
            aria-valuetext={`Chapter ${chapter} of ${chapterCount}`}
            disabled={chapterCount <= 1}
            onChange={(event) => onJumpToChapter(Number(event.target.value))}
          />
        )}

        <div className={styles.statusRow}>
          <button
            type="button"
            className={styles.sheetButton}
            aria-expanded={sheetOpen}
            aria-label="Contents, bookmarks and notes"
            onClick={onToggleSheet}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </footer>
    </div>

    {/*
      Where you are — and the only part of the interface that stays on screen.

      Deliberately *outside* the overlay above, and it is the whole point of
      this arrangement. Everything else here is a panel: it has a background, an
      edge, and a shadow, and it sits over the book. This has none of those. It
      is a line of small grey text at the foot of the page, exactly as a page
      number is printed at the foot of a printed page, and it neither comes nor
      goes as the overlay does.

      Still the control it always was — tapping it cycles through the page
      number, the pages left in this chapter, and nothing at all. The third
      state is escapable because the button stays there, empty, to be tapped.
    */}
    <div className={styles.statusLine}>
      <button
        type="button"
        className={styles.status}
        onClick={() => onBarStateChange(advanceBar(barState))}
        aria-label={label ?? 'Show where you are in the book'}
      >
        {label}
      </button>

      <span className={styles.percent}>
        {showsPercent(barState) && pages ? `${pages.percent}%` : ''}
      </span>
    </div>
    </>
  )
}
