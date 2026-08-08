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
import { MIN_QUERY, type SearchOutcome } from './search.ts'
import type { SectionRef } from './navigation.ts'
import type { Anchor, Manifest } from '../structure/index.ts'
import {
  MAX_TEXT_STEP,
  MIN_TEXT_STEP,
  READING_FONTS,
  THEMES,
  type Margins,
  type ReaderSettings,
  type Spacing,
} from './readerSettings.ts'
import styles from './Chrome.module.css'

/** The sheet's four tabs. Notes is a stub until WP-25; the rest are WP-14's. */
export type SheetTab = 'contents' | 'bookmarks' | 'notes' | 'aa'

/**
 * A bookmark as this component needs it — an id, where it points, what it is
 * called, and which chapter it falls in so the list can group by chapter without
 * re-parsing anchors here.
 *
 * Structural rather than importing `StoredBookmark`: Chrome is presentational
 * and has no business knowing what the database keeps. `chapter` is worked out
 * by the reading page, which already has the manifest open.
 */
export interface BookmarkRow {
  id: string
  anchor: Anchor
  label: string
  chapter: number
  /** The chapter's own title, for the heading above a run of marks. */
  chapterTitle: string
}

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
  /** The reading-comfort settings: theme, font, text size, spacing, margins. */
  settings: ReaderSettings
  onToggleFocus: () => void
  onToggleSheet: () => void
  onSelectTab: (tab: SheetTab) => void
  onBarStateChange: (state: BarState) => void
  /** Go to the first section of a chapter. */
  onJumpToChapter: (chapter: number) => void
  /** Go to a page — which may be inside the section already on screen. */
  onJumpToPage: (page: number) => void
  /** Change one or more reading-comfort settings at once. */
  onSettingsChange: (patch: Partial<ReaderSettings>) => void

  /** Every mark in this book, already in the book's own order. */
  bookmarks: readonly BookmarkRow[]
  /**
   * Whether the paragraph at the top of the page is marked.
   *
   * A boolean rather than the bookmark itself, because the ribbon only ever
   * needs to know which of two things to draw and which of two callbacks to
   * fire. Which bookmark would be removed is the reading page's business.
   */
  bookmarkedHere: boolean
  /** Mark the current page, or unmark it if it is already marked. */
  onToggleBookmark: () => void
  /** Go to a mark. */
  onJumpToBookmark: (anchor: Anchor) => void
  onRenameBookmark: (id: string, label: string) => void
  onDeleteBookmark: (id: string) => void

  /** Whether the search panel is up. */
  searchOpen: boolean
  /** What is in the search field — held by the reading page so it survives. */
  query: string
  /**
   * The answer to `query`, or `null` while the book's text is still being
   * fetched. `null` is a real state and not merely "no results": the first
   * search in a book waits for its prose to load, and saying "nothing found"
   * during that wait would be a wrong answer rather than a slow one.
   */
  results: SearchOutcome | null
  onToggleSearch: () => void
  onQueryChange: (query: string) => void
  /** Go to a result. */
  onJumpToHit: (anchor: Anchor) => void
}

/**
 * What to call the chapter a result falls in.
 *
 * The manifest is the only thing that knows chapter titles, and a result whose
 * chapter isn't in it — a broken anchor, or a book re-parsed into fewer chapters
 * since — still has to say *something*, or the row appears to belong nowhere.
 */
function chapterNameOf(manifest: Manifest, chapter: number): string {
  return manifest.chapters.find((entry) => entry.chapter === chapter)?.title ?? 'Elsewhere'
}

const TABS: { id: SheetTab; label: string }[] = [
  { id: 'contents', label: 'Contents' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'notes', label: 'Notes' },
  { id: 'aa', label: 'Aa' },
]

// Themes and faces come from `readerSettings.ts`, which is also what validates
// a stored setting. Keeping a second copy here is how the tab ends up offering
// a theme the settings file will refuse to save.
const THEME_OPTIONS = THEMES
const FONT_OPTIONS = READING_FONTS

const SPACING_OPTIONS: { id: Spacing; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Normal' },
  { id: 'relaxed', label: 'Relaxed' },
]

const MARGIN_OPTIONS: { id: Margins; label: string }[] = [
  { id: 'narrow', label: 'Narrow' },
  { id: 'normal', label: 'Normal' },
  { id: 'wide', label: 'Wide' },
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
  settings,
  onToggleFocus,
  onToggleSheet,
  onSelectTab,
  onBarStateChange,
  onJumpToChapter,
  onJumpToPage,
  onSettingsChange,
  bookmarks,
  bookmarkedHere,
  onToggleBookmark,
  onJumpToBookmark,
  onRenameBookmark,
  onDeleteBookmark,
  searchOpen,
  query,
  results,
  onToggleSearch,
  onQueryChange,
  onJumpToHit,
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

        {/*
          A toggle, not an "add" button — see `bookmarkOn` in `bookmarks.ts`.
          Tapping it on a page that is already marked takes the mark off, which
          is the only behaviour that makes a ribbon mean anything: a control that
          only ever added would leave a reader with no way to undo a mistap
          except to go hunting in the sheet for the thing they just made.

          `aria-pressed` carries the state properly; the filled and hollow
          glyphs are the sighted half of the same fact, and the label changes
          with it so a screen reader hears the *action*, not the state twice.
        */}
        <button
          type="button"
          className={styles.control}
          aria-pressed={bookmarkedHere}
          aria-label={bookmarkedHere ? 'Remove bookmark' : 'Bookmark this page'}
          onClick={onToggleBookmark}
        >
          <span aria-hidden="true">{bookmarkedHere ? '🔖' : '🏳'}</span>
        </button>

        <button
          type="button"
          className={styles.control}
          aria-expanded={searchOpen}
          aria-label="Search this book"
          onClick={onToggleSearch}
        >
          <span aria-hidden="true">🔍</span>
        </button>

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
        Search, in a panel of its own rather than as a fifth tab in the sheet.
        The reader's call, and it has one consequence worth naming: the results
        are a jump-to list exactly like the contents and the bookmarks, but it
        does not live beside them, so it has to carry its own way out (the ✕).
      */}
      {searchOpen && (
        <div className={styles.searchPanel} role="dialog" aria-label="Search this book">
          <div className={styles.searchField}>
            <span aria-hidden="true">🔍</span>
            <input
              className={styles.searchInput}
              type="search"
              value={query}
              // The panel is opened on purpose and there is exactly one thing to
              // do in it, so it takes the keyboard rather than waiting to be
              // tapped a second time.
              autoFocus
              placeholder="Search this book"
              aria-label="Search this book"
              onChange={(event) => onQueryChange(event.target.value)}
            />
            <button
              type="button"
              className={styles.searchClose}
              aria-label="Close search"
              onClick={onToggleSearch}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          {/*
            Four states, and each one is a different sentence. Collapsing any of
            them into "no results" is what makes a search box feel broken: a
            reader who has typed one letter has not failed to find anything, and
            a reader waiting for a long book to load has not either.
          */}
          <p className={styles.searchStatus} role="status">
            {query.trim().length < MIN_QUERY
              ? 'Type at least two letters.'
              : results === null
                ? 'Looking…'
                : results.total === 0
                  ? 'Nothing found.'
                  : results.capped
                    ? `${results.total} results — showing the first ${results.hits.length}.`
                    : `${results.total} result${results.total === 1 ? '' : 's'}.`}
          </p>

          {results !== null && results.hits.length > 0 && (
            <ul className={styles.searchResults}>
              {results.hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    className={styles.searchHit}
                    onClick={() => onJumpToHit(hit.anchor)}
                  >
                    <span className={styles.searchWhere}>
                      {chapterNameOf(manifest, hit.chapter)}
                    </span>
                    <span className={styles.searchSnippet}>
                      {hit.before}
                      <mark className={styles.searchMark}>{hit.match}</mark>
                      {hit.after}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            The marks, under the chapter each one falls in.

            Grouped rather than a flat list because the chapter is the thing a
            reader remembers ("it was somewhere in the breathing chapter"), and
            because a run of six marks in one chapter with the chapter repeated
            six times is six lines of noise. The heading is printed when the
            chapter changes, which — since `inBookOrder` has already sorted them
            — is exactly once per chapter.
          */}
          {sheetTab === 'bookmarks' && (
            <div
              role="tabpanel"
              id="sheet-panel-bookmarks"
              aria-labelledby="sheet-tab-bookmarks"
              className={styles.sheetPanel}
            >
              {bookmarks.length === 0 ? (
                <p className={styles.empty}>
                  No bookmarks yet. Tap the ribbon at the top of the screen to mark the
                  page you’re on.
                </p>
              ) : (
                <ul>
                  {bookmarks.map((bookmark, index) => (
                    <li key={bookmark.id}>
                      {bookmark.chapter !== bookmarks[index - 1]?.chapter && (
                        <p className={styles.bookmarkChapter}>{bookmark.chapterTitle}</p>
                      )}

                      <div className={styles.bookmarkRow}>
                        <button
                          type="button"
                          className={styles.bookmarkItem}
                          onClick={() => onJumpToBookmark(bookmark.anchor)}
                        >
                          {bookmark.label}
                        </button>

                        {/*
                          Rename through the browser's own prompt, deliberately.
                          An inline editing field inside a sheet that closes on
                          every navigation is a lot of state to get wrong for a
                          thing done rarely, and `prompt` is the one dialog that
                          is already keyboard-accessible, already dismissible,
                          and already familiar. A cancelled prompt returns null,
                          which must not be mistaken for "clear the name" — an
                          empty string is handled by the reading page, which
                          falls back to the paragraph's opening words.
                        */}
                        <button
                          type="button"
                          className={styles.bookmarkAction}
                          aria-label={`Rename ${bookmark.label}`}
                          onClick={() => {
                            const named = window.prompt('Name this bookmark', bookmark.label)
                            if (named !== null) onRenameBookmark(bookmark.id, named)
                          }}
                        >
                          <span aria-hidden="true">✎</span>
                        </button>

                        <button
                          type="button"
                          className={styles.bookmarkAction}
                          aria-label={`Remove ${bookmark.label}`}
                          onClick={() => onDeleteBookmark(bookmark.id)}
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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

          {sheetTab === 'aa' && (
            <div
              role="tabpanel"
              id="sheet-panel-aa"
              aria-labelledby="sheet-tab-aa"
              className={styles.sheetPanel}
            >
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Theme</span>
                <div className={styles.settingOptions} role="group" aria-label="Theme">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={styles.settingButton}
                      aria-pressed={settings.theme === option.value}
                      onClick={() => onSettingsChange({ theme: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Font</span>
                <div className={styles.settingOptions} role="group" aria-label="Reading font">
                  {FONT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      /* Each option is set in its own face — see
                         `.fontButton` in the stylesheet. */
                      className={`${styles.settingButton} ${styles.fontButton}`}
                      data-face={option.value}
                      aria-pressed={settings.font === option.value}
                      onClick={() => onSettingsChange({ font: option.value })}
                    >
                      <span className={styles.fontName}>{option.label}</span>
                      {option.note && <span className={styles.fontNote}>{option.note}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Text size</span>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepperButton}
                    aria-label="Smaller text"
                    disabled={settings.textStep <= MIN_TEXT_STEP}
                    onClick={() => onSettingsChange({ textStep: settings.textStep - 1 })}
                  >
                    A−
                  </button>
                  <span className={styles.stepperValue} aria-live="polite">
                    {settings.textStep}
                  </span>
                  <button
                    type="button"
                    className={styles.stepperButton}
                    aria-label="Larger text"
                    disabled={settings.textStep >= MAX_TEXT_STEP}
                    onClick={() => onSettingsChange({ textStep: settings.textStep + 1 })}
                  >
                    A+
                  </button>
                </div>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Line spacing</span>
                <div className={styles.settingOptions} role="group" aria-label="Line spacing">
                  {SPACING_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={styles.settingButton}
                      aria-pressed={settings.spacing === option.id}
                      onClick={() => onSettingsChange({ spacing: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Margins</span>
                <div className={styles.settingOptions} role="group" aria-label="Margins">
                  {MARGIN_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={styles.settingButton}
                      aria-pressed={settings.margins === option.id}
                      onClick={() => onSettingsChange({ margins: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
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
    {/*
      `data-page-furniture` marks this as belonging to the *page*, not to the
      app around it — so a page turn takes it with it. A printed page number
      turns over with the sheet it is printed on; it does not hover in place
      while the paper moves out from under it. `reader/pageTurn.ts` reads this
      attribute and nothing else, so anything else that comes to belong to the
      page — a running header, a footnote rule — joins the flip by carrying it.
    */}
    <div className={styles.statusLine} data-page-furniture="">
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
