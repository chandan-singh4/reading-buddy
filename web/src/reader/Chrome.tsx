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
 * - A tap in the middle raises **one** bar, at the top: back, search, Aa, and
 *   the focus lamp. Four controls, all reachable, none of them furniture.
 * - Contents, Bookmarks and Notes moved *out* of the bottom of the screen. They
 *   are a page of their own now, opened by the ⋮ beside the slider and shared
 *   by a tab row; Aa is still a sheet, straight at its own panel.
 * - The bookmark left the bar entirely. It is a corner of the page now — see
 *   the ribbon in `pages/Reader.tsx`, which is where a bookmark belongs: on the
 *   paper, not in the toolbar.
 */

import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'

import { stepThrough, swipeOf, type Touch } from './swipe.ts'
import { progressOf, type OutlineEntry, type Pages } from './progress.ts'
import { MIN_QUERY, type SearchOutcome } from './search.ts'
import type { SectionRef } from './navigation.ts'
import type { Anchor, Manifest } from '../structure/index.ts'
import type { ReaderSettings } from './readerSettings.ts'
import type { HighlighterChoice } from './highlightStyle.ts'
import { TextSettings } from './TextSettings.tsx'
import { BookmarksPanel, type BookmarkRow } from './BookmarksPanel.tsx'
import { NotesPanel, type NoteRow } from './NotesPanel.tsx'
import { FocusLamp } from './FocusLamp.tsx'
import styles from './Chrome.module.css'

/**
 * Which panel the sheet is showing. Notes is a stub until WP-25; the rest are
 * WP-14's.
 *
 * Three of them are a page of their own now, with a tab row across the top —
 * Google Books' arrangement, and the one this reader asked for. Aa is the
 * exception: it stays a sheet that rises over the book, because changing the
 * text size while you cannot see the text is no use at all.
 */
export type SheetTab = 'contents' | 'bookmarks' | 'notes' | 'aa'

/** What each panel calls itself — the tab labels, and the sheet's own heading. */
const SHEET_TITLES: Record<SheetTab, string> = {
  contents: 'Contents',
  bookmarks: 'Bookmarks',
  notes: 'Notes',
  aa: 'Reading mode',
}

/**
 * The two big panels live in files of their own — they are the size of a screen
 * each, with state of their own (which row is unfurled, which chip is chosen),
 * and inlining them is what made this file's Aa sheet a hundred lines of form.
 */
export type { BookmarkRow } from './BookmarksPanel.tsx'

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
  /** The reading-comfort settings: theme, font, text size, spacing, margins. */
  settings: ReaderSettings
  onToggleFocus: () => void
  /** Open one panel by name — the ⋮, the Aa button, and each tab all use this. */
  onOpenSheet: (tab: SheetTab) => void
  onCloseSheet: () => void
  /**
   * The contents list: chapters, with each chapter's named sections under it.
   * Built by `contentsOutline`, which decides what earns a row.
   */
  outline: readonly OutlineEntry[]
  /** Go to a chapter, or to one section inside it. */
  onJumpTo: (chapter: number, section: number) => void
  /** Go to a page — which may be inside the section already on screen. */
  onJumpToPage: (page: number) => void
  /** Change one or more reading-comfort settings at once. */
  onSettingsChange: (patch: Partial<ReaderSettings>) => void
  /**
   * How highlights are painted in this book. Optional, because it is kept per
   * book rather than in `settings` and a caller without a book has none.
   */
  highlighter?: HighlighterChoice
  onHighlighterChange?: (choice: HighlighterChoice) => void

  /** Every mark in this book, already in the book's own order. */
  bookmarks: readonly BookmarkRow[]
  /** Go to a mark. */
  onJumpToBookmark: (anchor: Anchor) => void
  onRenameBookmark: (id: string, label: string) => void
  onDeleteBookmark: (id: string) => void

  /** Every note in this book, yours and the tutor's, in the book's order. */
  notes: readonly NoteRow[]
  /** Go to the paragraph a note is about. */
  onJumpToNote: (anchor: Anchor) => void

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

/**
 * The three panels that share the browse page, in tab order.
 *
 * Aa is not among them on purpose — see the note on `SheetTab`.
 */
const MENU_PANELS: SheetTab[] = ['contents', 'bookmarks', 'notes']

export function Chrome({
  bookTitle,
  manifest,
  here,
  pages,
  shown,
  focusMode,
  sheetOpen,
  sheetTab,
  settings,
  highlighter,
  onHighlighterChange,
  onToggleFocus,
  onOpenSheet,
  onCloseSheet,
  outline,
  onJumpTo,
  onJumpToPage,
  onSettingsChange,
  bookmarks,
  onJumpToBookmark,
  onRenameBookmark,
  onDeleteBookmark,
  notes,
  onJumpToNote,
  searchOpen,
  query,
  results,
  onOpenSearch,
  onCloseSearch,
  onQueryChange,
  onJumpToHit,
}: ChromeProps) {
  const { chapter, chapterCount } = progressOf(manifest, here)

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

  /**
   * Where a swipe across the browse page began.
   *
   * The tab row is three targets at the top of a phone, and the page under it
   * is the whole screen. A swipe is the cheaper gesture — the same one the book
   * itself answers to — so the tabs answer to it too. `stepThrough` stops at the
   * ends rather than cycling: the row visibly does not loop, so wrapping from
   * Notes back to Contents would contradict what the eye just saw.
   */
  const swipeFrom = useRef<Touch | null>(null)

  /* The scrolling list, and the one row inside it that is the reader. Both are
     needed to open the contents where they are — see the layout effect below. */
  const contentsBox = useRef<HTMLElement | null>(null)
  const readingRow = useRef<HTMLLIElement | null>(null)

  /**
   * Whether the contents list names the section the reader is actually in.
   *
   * It often does not: an untitled section earns no row, and a chapter of one
   * section is left as a single line. When there is no section row to mark, the
   * chapter row carries "reading now" instead — so the reader always has exactly
   * one, and never two.
   */
  const readingSection = outline.some(
    (entry) =>
      entry.section !== undefined &&
      entry.chapter === here.chapter &&
      entry.section === here.section,
  )

  /*
   * Open the contents at the reader, not at page one.
   *
   * A long book's list is hundreds of rows. A reader on page 260 opens it to ask
   * what is next, and a list that opens at the top answers by making them scroll
   * past everything they have already read to find themselves first. The place
   * they are is the only row they are certainly interested in, so it is where the
   * list should already be.
   *
   * Set a third down rather than centred: the question is what comes *next*, so
   * the room belongs below the row and not above it.
   *
   * `scrollTop` and not `scrollIntoView` — the latter can scroll ancestors as
   * well, and this list sits inside an overlay that must not move. In a layout
   * effect so it lands before the paint; the reader never sees the top of the
   * list, so there is no jump to notice.
   *
   * Keyed to `sheetOpen` and not to `shown`. They are different things: `shown`
   * is the bar at the top of the reading screen, which is already up by the time
   * a reader taps Contents. Watching it meant that opening the panel changed
   * nothing this effect could see — `sheetTab` is remembered between visits, so
   * on the second open no dependency changed at all and the list stayed where it
   * was.
   */
  useLayoutEffect(() => {
    if (!sheetOpen || sheetTab !== 'contents') return
    const list = contentsBox.current
    const row = readingRow.current
    if (!list || !row) return

    const top = row.offsetTop - list.offsetTop
    // Already on the first screenful. Scrolling would only push the ornament and
    // the word CONTENTS out of sight to gain nothing.
    if (top < list.clientHeight) return

    list.scrollTop = top - list.clientHeight / 3
    // Deliberately not keyed to the reading position. `here` is a fresh object
    // on every render, so watching it would re-run this on each one and drag the
    // list back under a reader who is scrolling it. Opening the panel is the
    // only moment this should act, and the panel unmounts when it closes.
  }, [sheetOpen, sheetTab, outline])

  return (
    /* `inert` rather than unmounted: the overlay keeps its scroll position in
        the contents list, and a hidden control must not be reachable by tab or
        by a screen reader while it is invisible. */
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
          aria-label="Reading mode"
          onClick={() => onOpenSheet('aa')}
        >
          <span aria-hidden="true">Aa</span>
        </button>

        {/*
          Focus mode has the corner the ⋮ used to hold. It was a line in the
          menu, which is two taps and a decision for the one control a reader
          reaches for *because* they want the chrome gone — a thing you should
          not have to open the chrome to ask for. The ⋮ went to the foot, beside
          the slider.

          The lamp is the control: unlit line art when Focus Mode is off, lit
          with a halo around it when it is on. See `FocusLamp.tsx`.
        */}
        <button
          type="button"
          className={`${styles.iconControl} ${styles.focusControl}`}
          aria-pressed={focusMode}
          aria-label="Focus mode"
          onClick={onToggleFocus}
        >
          <FocusLamp on={focusMode} />
        </button>
      </header>

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
      {sheetOpen && sheetTab === 'aa' && (
        <div
          className={styles.scrim}
          data-scrim="true"
          onClick={onCloseSheet}
          aria-hidden="true"
        />
      )}

      {/*
        Aa, and only Aa, still rises as a sheet over the book. Text size is
        judged against the text: a full page of settings would hide the very
        thing the reader is adjusting.
      */}
      {sheetOpen && sheetTab === 'aa' && (
        <div className={styles.sheet} role="dialog" aria-label={SHEET_TITLES[sheetTab]}>
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

          {/*
            The whole of Aa lives in its own component now — see
            `TextSettings.tsx`. It is the one panel with behaviour of its own
            (tabs, and the fade while a slider is dragged), and leaving it
            inline was what made this file's sheet a hundred lines of form.
          */}
          <div className={styles.sheetPanel}>
            <TextSettings
              settings={settings}
              onSettingsChange={onSettingsChange}
              highlighter={highlighter}
              onHighlighterChange={onHighlighterChange}
            />
          </div>
        </div>
      )}

      {/*
        Contents, Bookmarks and Notes: one page, three tabs, the book's name at
        the top and a way back beside it.

        They were a dropdown that opened a sheet — two taps to reach a chapter
        list, and a list capped at two thirds of a short screen. They are lists
        you *browse*, sometimes at length, and often after comparing one with
        another. A page gives them the whole screen, and the tab row makes the
        comparison one tap instead of a trip back through the menu.
      */}
      {sheetOpen && sheetTab !== 'aa' && (
        <div
          className={styles.browse}
          role="dialog"
          aria-label={SHEET_TITLES[sheetTab]}
          onTouchStart={(event) => {
            const touch = event.touches[0]
            swipeFrom.current = touch ? { x: touch.clientX, y: touch.clientY } : null
          }}
          onTouchEnd={(event) => {
            const from = swipeFrom.current
            const touch = event.changedTouches[0]
            swipeFrom.current = null
            if (!from || !touch) return

            // `swipeOf` returns null for a tap, a scroll, or a wobble, and
            // `stepThrough` hands back the same tab for null — so a list
            // scrolled with a thumb never changes tab by accident.
            const next = stepThrough(
              MENU_PANELS,
              sheetTab,
              swipeOf(from, { x: touch.clientX, y: touch.clientY }),
            )
            if (next !== sheetTab) onOpenSheet(next)
          }}
        >
          <div className={styles.browseHead}>
            <button
              type="button"
              className={styles.iconControl}
              aria-label="Close"
              onClick={onCloseSheet}
            >
              <span aria-hidden="true">←</span>
            </button>
            <h2 className={styles.browseTitle}>{bookTitle}</h2>
          </div>

          <div className={styles.tabRow} role="tablist" aria-label="Browse this book">
            {MENU_PANELS.map((panel) => (
              <button
                key={panel}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={sheetTab === panel}
                onClick={() => onOpenSheet(panel)}
              >
                {SHEET_TITLES[panel]}
              </button>
            ))}
          </div>

          {/*
            The contents, set like the contents page of a printed book.

            A list of chapters is the one screen in this app that has a
            centuries-old typographic answer, and the reader asked for it: the
            word CONTENTS letterspaced under a small ornament, titles ranged
            left, page numbers ranged right, and a line of dots joining the two
            so the eye can cross the gap. It is set in the reading face rather
            than the interface face, because it is part of the book.

            Parts — "PART ONE" between chapters — are the one thing from the
            sketch that isn't here. Nothing in the manifest records which part a
            chapter belongs to, so they would have to be invented.
          */}
          {sheetTab === 'contents' && (
            <nav className={styles.contents} aria-label="Contents" ref={contentsBox}>
              <div className={styles.contentsHead} aria-hidden="true">
                <span className={styles.contentsFlower}>❁</span>
                <p className={styles.contentsWord}>Contents</p>
                <span className={styles.contentsRule}>✦</span>
              </div>

              <ul className={styles.contentsList}>
                {outline.map((entry) => {
                  /*
                    The one row that is *you*, and it must be exactly one.
                    Marking the chapter row as well as the section row inside it
                    would print "reading now" twice a few lines apart, which
                    reads as the list contradicting itself. So the deepest row
                    that matches wins: the section you are in when the list
                    names it, and the chapter otherwise.
                  */
                  const reading =
                    entry.section === undefined
                      ? entry.chapter === here.chapter && !readingSection
                      : entry.chapter === here.chapter && entry.section === here.section

                  const label = `${entry.title}, page ${entry.page}`

                  return (
                    <li
                      key={entry.section === undefined ? `c${entry.chapter}` : `c${entry.chapter}s${entry.section}`}
                      /* A section is drawn indented and lighter, so the eye
                         reads the list as a hierarchy without a second heading
                         level to scan past. */
                      className={entry.section === undefined ? undefined : styles.contentsSub}
                      ref={reading ? readingRow : undefined}
                    >
                      <button
                        type="button"
                        className={styles.contentsItem}
                        aria-current={reading ? 'true' : undefined}
                        /* The dots are decoration, so the number has to be said
                           in words to anyone who can't see them line up. */
                        aria-label={label}
                        onClick={() => onJumpTo(entry.chapter, entry.section ?? 1)}
                      >
                        <span className={styles.contentsTitle}>{entry.title}</span>
                        <span className={styles.contentsLeader} aria-hidden="true" />
                        <span className={styles.contentsPage} aria-hidden="true">
                          {entry.page}
                        </span>
                      </button>

                      {/*
                        Where you actually are, under the row you are in. The
                        right-hand column is where each division *starts*, so
                        without this line the list can say 91 while you are on
                        102 — true of the chapter, and not an answer to the
                        question a reader opens the contents to ask.
                      */}
                      {reading && pages && (
                        <p className={styles.readingNow}>
                          <span aria-hidden="true">✦ </span>
                          reading now · page {pages.page}
                          <span aria-hidden="true"> ✦</span>
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </nav>
          )}

          {/* The marks, as page-edge tabs. See `BookmarksPanel.tsx`. */}
          {sheetTab === 'bookmarks' && (
            <BookmarksPanel
              bookmarks={bookmarks}
              onJumpToBookmark={onJumpToBookmark}
              onRenameBookmark={onRenameBookmark}
              onDeleteBookmark={onDeleteBookmark}
            />
          )}

          {/* The notes, on a ruled sheet. See `NotesPanel.tsx`. */}
          {sheetTab === 'notes' && <NotesPanel notes={notes} onJumpToNote={onJumpToNote} />}
        </div>
      )}

      {/*
        The bottom carries the slider and the ⋮ beside it.

        The rule at the head of this file still holds — the foot of a phone is
        where a thumb rests, so it is the wrong place for anything you are not
        deliberately reaching for. The ⋮ earns its seat by sharing the row a
        reader is already reaching into: you drag the slider to move through the
        book, and contents, bookmarks and notes are the other three ways of
        doing the same thing. They belong together.
      */}
      <footer className={styles.bar}>
        <div className={styles.footRow}>
          <button
            type="button"
            className={styles.iconControl}
            aria-expanded={sheetOpen && sheetTab !== 'aa'}
            aria-haspopup="dialog"
            aria-label="More"
            onClick={() => onOpenSheet('contents')}
          >
            <span aria-hidden="true">⋮</span>
          </button>

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
              // The coarse slider moves in whole chapters, so it always lands on
              // the first section of one.
              onChange={(event) => onJumpTo(Number(event.target.value), 1)}
            />
          )}
        </div>
      </footer>
    </div>
  )
}
