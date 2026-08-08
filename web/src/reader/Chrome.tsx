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
 * WP-55 rebuilt the shape after Google Books, which the reader uses daily. The
 * arrangement is worth stating because it is the opposite of where this started:
 *
 * - The book is on screen alone. Nothing overlays it until it is asked for.
 * - A tap in the middle raises **one** bar, at the top: back, search, Aa, and a
 *   three-dot menu. Four controls, all reachable, none of them furniture.
 * - Contents, Bookmarks and Notes moved *out* of the bottom of the screen and
 *   into that menu; Aa opens the same sheet straight at its own panel. The
 *   bottom keeps only the slider, which is the one control that is about
 *   *moving* rather than about *opening something*.
 * - The bookmark left the bar entirely. It is a corner of the page now — see
 *   the ribbon in `pages/Reader.tsx`, which is where a bookmark belongs: on the
 *   paper, not in the toolbar.
 */

import { Link } from 'react-router'

import { advanceBar, barLabel, showsPercent, type BarState } from './bar.ts'
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

/**
 * Which panel the sheet is showing. Notes is a stub until WP-25; the rest are
 * WP-14's.
 *
 * These used to be tabs along the top of the sheet. They are not any more — one
 * of them is opened at a time, by name, from the menu or from Aa — but the type
 * survives because "which panel" is still the question the sheet answers.
 */
export type SheetTab = 'contents' | 'bookmarks' | 'notes' | 'aa'

/**
 * What the sheet calls itself when it is showing each panel.
 *
 * It needs a heading now that the row of tabs is gone: a sheet that rises with
 * no title on it leaves the reader to infer what they opened from its contents,
 * which works for a chapter list and not at all for an empty one.
 */
const SHEET_TITLES: Record<SheetTab, string> = {
  contents: 'Contents',
  bookmarks: 'Bookmarks',
  notes: 'Notes',
  aa: 'Text and display',
}

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
  /** Whether the three-dot menu is down. */
  menuOpen: boolean
  sheetOpen: boolean
  sheetTab: SheetTab
  barState: BarState
  /** The reading-comfort settings: theme, font, text size, spacing, margins. */
  settings: ReaderSettings
  onToggleFocus: () => void
  onToggleMenu: () => void
  /** Open the sheet at one panel. There is no "toggle" any more: every route in
      names the panel it wants, which is what let the tab row go. */
  onOpenSheet: (tab: SheetTab) => void
  onCloseSheet: () => void
  onBarStateChange: (state: BarState) => void
  /** Go to the first section of a chapter. */
  onJumpToChapter: (chapter: number) => void
  /** Go to a page — which may be inside the section already on screen. */
  onJumpToPage: (page: number) => void
  /** Change one or more reading-comfort settings at once. */
  onSettingsChange: (patch: Partial<ReaderSettings>) => void

  /** Every mark in this book, already in the book's own order. */
  bookmarks: readonly BookmarkRow[]
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
  onOpenSearch: () => void
  onCloseSearch: () => void
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

/** What the three-dot menu opens, in the order it lists them. */
const MENU_PANELS: SheetTab[] = ['contents', 'bookmarks', 'notes']

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
  menuOpen,
  sheetOpen,
  sheetTab,
  barState,
  settings,
  onToggleFocus,
  onToggleMenu,
  onOpenSheet,
  onCloseSheet,
  onBarStateChange,
  onJumpToChapter,
  onJumpToPage,
  onSettingsChange,
  bookmarks,
  onJumpToBookmark,
  onRenameBookmark,
  onDeleteBookmark,
  searchOpen,
  query,
  results,
  onOpenSearch,
  onCloseSearch,
  onQueryChange,
  onJumpToHit,
}: ChromeProps) {
  const { chapter, chapterCount } = progressOf(manifest, here)
  const label = barLabel(barState, pages, progressLabel(manifest, here))

  /**
   * What the ✕ in the search field means, which depends on whether there is
   * anything to clear.
   *
   * This is the whole of a bug the reader hit: with an empty field the ✕ has
   * nothing to erase, so a button that only ever erased sat there doing
   * literally nothing. One control, two honest jobs — clear the word, and when
   * there is no word, leave.
   */
  const clears = query.length > 0

  return (
    <>
    {/* `inert` rather than unmounted: the overlay keeps its scroll position in
        the contents list, and a hidden control must not be reachable by tab or
        by a screen reader while it is invisible. */}
    <div className={styles.chrome} data-shown={shown} inert={!shown}>
      {/*
        One bar, at the top, and four controls on it. The bottom of the screen
        used to carry a second row of buttons; a phone is held at the bottom, so
        that is exactly where a reader's thumb rests while reading, and putting
        controls under it meant tapping "contents" while trying to turn a page.
      */}
      <header className={styles.bar}>
        <Link to="/" className={styles.iconControl} aria-label="Back to library">
          <span aria-hidden="true">←</span>
        </Link>

        <span className={styles.bookTitle}>{bookTitle}</span>

        <button
          type="button"
          className={styles.iconControl}
          aria-expanded={searchOpen}
          aria-label="Search this book"
          onClick={onOpenSearch}
        >
          <span aria-hidden="true">🔍</span>
        </button>

        {/*
          Aa opens the sheet straight at the settings, rather than opening it
          somewhere else and asking the reader to find a tab. It is the one
          panel worth a control of its own: text size is adjusted mid-sentence,
          in the middle of reading, and it should cost one tap.
        */}
        <button
          type="button"
          className={styles.iconControl}
          aria-expanded={sheetOpen && sheetTab === 'aa'}
          aria-label="Text and display"
          onClick={() => onOpenSheet('aa')}
        >
          <span aria-hidden="true">Aa</span>
        </button>

        <button
          type="button"
          className={styles.iconControl}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="More"
          onClick={onToggleMenu}
        >
          <span aria-hidden="true">⋮</span>
        </button>
      </header>

      {/*
        The three-dot menu: the things you open occasionally, kept off the bar
        so the bar stays four controls wide however many of them there are.
      */}
      {menuOpen && (
        <>
          {/* Clear rather than dimmed: a dropdown is a small thing and dimming
              the whole book behind it overstates it. It still has to catch the
              tap that dismisses it. */}
          <div className={styles.menuScrim} onClick={onToggleMenu} aria-hidden="true" />

          <div className={styles.menu} role="menu" aria-label="More">
            {MENU_PANELS.map((panel) => (
              <button
                key={panel}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => onOpenSheet(panel)}
              >
                {SHEET_TITLES[panel]}
              </button>
            ))}

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              aria-pressed={focusMode}
              onClick={onToggleFocus}
            >
              {focusMode ? 'Focus on' : 'Focus off'}
            </button>
          </div>
        </>
      )}

      {/*
        Search, in a panel of its own rather than as one more thing in the
        sheet. The results are a jump-to list exactly like the contents and the
        bookmarks, but it does not live beside them, so it carries its own way
        out (the ✕, and the back gesture the reading page wires to it).
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
              aria-label={clears ? 'Clear search' : 'Close search'}
              onClick={() => (clears ? onQueryChange('') : onCloseSearch())}
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
        mean "no thanks" and the only way out was to find the control again.

        Not a button: it is a large invisible target, so announcing it to a
        screen reader would be noise — the sheet's own ✕ and the back gesture
        are the two routes that get announced.
      */}
      {sheetOpen && (
        <div
          className={styles.scrim}
          data-scrim="true"
          onClick={onCloseSheet}
          aria-hidden="true"
        />
      )}

      {sheetOpen && (
        <div className={styles.sheet} role="dialog" aria-label={SHEET_TITLES[sheetTab]}>
          {/*
            The heading the tab row used to supply. It is also where the ✕ went:
            with four tabs there was always another tab to move to, so closing
            was rare; opened by name from a menu, the only move left is out.
          */}
          <div className={styles.sheetHead}>
            <h2 className={styles.sheetTitle}>{SHEET_TITLES[sheetTab]}</h2>
            <button
              type="button"
              className={styles.sheetClose}
              aria-label="Close"
              onClick={onCloseSheet}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          {sheetTab === 'contents' && (
            <nav className={styles.sheetPanel} aria-label="Contents">
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
            <div className={styles.sheetPanel}>
              {bookmarks.length === 0 ? (
                <p className={styles.empty}>
                  No bookmarks yet. Tap the top right corner of the page to mark where
                  you are, the way you’d fold a corner down.
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
            <div className={styles.sheetPanel}>
              <p className={styles.empty}>
                Notes and highlights arrive with the tutor — anything you ask about gets
                saved here, filed by chapter.
              </p>
            </div>
          )}

          {sheetTab === 'aa' && (
            <div className={styles.sheetPanel}>
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

      {/*
        The bottom is the slider and nothing else now. Everything that used to
        sit beside it opens from the top bar instead — see the note at the head
        of this file for why the foot of a phone screen is the wrong place for
        anything you are not deliberately dragging.
      */}
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
