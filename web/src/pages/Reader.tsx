import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  Block,
  ChapterOpening,
  Chrome,
  NoteComposer,
  SelectionMenu,
  Highlights,
  chapterNumber,
  describeRange,
  rangeOfSelection,
  highlightAt,
  selectionBetween,
  selectionInReader,
  unitAround,
  unitBeyond,
  readHighlighter,
  resolveHighlighter,
  writeHighlighter,
  type HighlighterChoice,
  type ReaderSelection,
  type SelectionAction,
  type SelectionGrain,
  type SelectionPivot,
  anchorAtPage,
  bookmarkOn,
  buildSpine,
  chapterTitle,
  contentsOutline,
  inBookOrder,
  inNoteOrder,
  labelFor,
  pagesOf,
  type NoteRow,
  searchBook,
  PageDecks,
  PageSpine,
  RunningHead,
  StatusLine,
  type BookmarkRow,
  elementIdOf,
  pagesAt,
  refAtPage,
  wordsAt,
  beginDrag,
  cancelTurn,
  clearSheets,
  curlProgress,
  dropDrag,
  dropStill,
  fadeIn,
  holdOutgoing,
  holdStill,
  paintDrag,
  playFlip,
  scrollStrip,
  settleDrag,
  type Cancel,
  type Drag,
  type HeldPage,
  firstSection,
  isFresh,
  offsetOfPage,
  pageAt,
  pageCountOf,
  turn,
  inEdgeBand,
  swipeOf,
  nextSection,
  pathOf,
  placeOf,
  previousSection,
  readFocusMode,
  applyStoredTheme,
  DIM_FROM,
  dimAfterDrag,
  inDimZone,
  gutterOf,
  leadingOf,
  measureOf,
  readReaderSettings,
  textSizeOf,
  writeReaderSettings,
  type FollowLink,
  useBackDismiss,
  useFigureImages,
  writeFocusMode,
  type BarState,
  type ReaderSettings,
  type SectionRef,
  type SheetTab,
  type Spine,
  type Strip,
  type Touch,
  wordAt,
} from '../reader/index.ts'
import { catchUpOnOpen } from '../app/bookCatchUp.ts'
import { knownBook, noteReading } from '../app/shelvesAhead.ts'
import { noteStore, repository, type StoredBookmark, type StoredNote } from '../storage/index.ts'
import { tryParseAnchor } from '../structure/index.ts'
import type {
  Anchor,
  BookId,
  BookMeta,
  ChapterIndex,
  Manifest,
  Paragraph,
  Section,
  SectionPath,
} from '../structure/index.ts'
import { Opening } from './Opening.tsx'
import styles from './Reader.module.css'

/** The book and its manifest — loaded once, then never again while reading. */
type FrameState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; book: BookMeta; manifest: Manifest }

/** One section — reloaded on every move, and the only thing that is. */
type PageState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; section: Section }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** How far down the viewport still counts as "the paragraph you're reading". */
const READING_LINE = 80

/**
 * How much of each side turns a page when tapped, as a fraction of the width.
 *
 * A quarter each side leaves half the screen for the overlay tap. Smaller and
 * the target is hard to hit one-handed; larger and tapping to see where you are
 * starts turning pages by accident.
 */
const EDGE_TAP = 0.25

/**
 * How far a finger has to travel before it owns the page rather than the app.
 *
 * Below this a "drag" is a tap with an unsteady thumb, and building a sheet for
 * every one of those would cost a clone of the chapter each time somebody
 * touched the screen to see the page number.
 */
const DRAG_FROM = 8

/**
 * How long a landing keeps re-checking that it is still on the right page while
 * the section lays itself out behind it. See `settleOn`.
 *
 * Three seconds is a compromise between two real readers: the one opening an
 * illustrated book, whose columns keep moving for as long as the pictures take
 * to decode, and the one who opens a book and immediately swipes — who must
 * never be pulled back to where they started. The second is protected by the
 * `moveSeq` check as well, so this bound only matters for a section that never
 * finishes settling at all.
 */
const SETTLE_MS = 3000

/** Frames of unchanged layout width that count as "the section has settled". */
const SETTLE_FRAMES = 3

/*
 * The finger-tracked curl was switched off for one release, behind a
 * `DRAG_TURNS` flag, because starting a drag blocked the main thread for
 * 24.5 seconds on a long chapter and crashed the tab on a book of full-page
 * pictures. The cause was never the curl: each of the sixteen strips copied the
 * *whole laid-out section*. `pageCopy` in `pageTurn.ts` now copies only the page
 * on screen, the same drag measures 43 ms, and the flag is gone. Read the note
 * on `pageCopy` before changing what a sheet is made of.
 */

/**
 * How much of the newest reading the drag's speed estimate keeps.
 *
 * Low enough that one janky frame cannot decide a turn, high enough that the
 * number still describes the last few milliseconds rather than the whole
 * gesture.
 */
const RUN_ON = 0.35

/**
 * How much the page shrinks by when the toolbar comes up.
 *
 * Lives here rather than in the stylesheet because the arithmetic below has to
 * know it exactly — see `scaleOf`. It is handed to the CSS as a custom property
 * on the stage, so there is one number and not two that have to agree.
 *
 * The value is set by what has to fit: the room freed at the foot is
 * `(1 - PAGE_SCALE)` of the page's height less what the top bar takes, and the
 * bottom bar has to sit in the rest of it.
 */
const PAGE_SCALE = 0.85

/**
 * The scale the page is currently drawn at.
 *
 * Every rectangle read off a scaled element comes back scaled, while
 * `scrollLeft`, `scrollWidth` and the column gap do not — they are layout
 * numbers, which a transform never touches. Mixing the two is what would put
 * every page turn out of true, so each measured rectangle is divided by this on
 * the way in.
 *
 * Read from the DOM rather than passed down from React state, because the
 * measuring happens inside plain functions that scroll handlers call — and
 * asked as a *question about the element* rather than computed from
 * `getBoundingClientRect() / offsetWidth`, which would look tidier and be
 * wrong: `offsetWidth` is rounded to a whole pixel, so the scale would come out
 * a fraction of a per cent off, and a fraction of a per cent of a
 * forty-thousand-pixel strip is a page and a half.
 *
 * While the shrink is animating (`--motion-ui`), the real scale is between
 * the two values and this answers with the destination. Nothing is measured in
 * that window except by a reader turning a page in the same fifth of a second
 * as they raised the toolbar, and the next scroll settles it.
 */
function scaleOf(element: HTMLElement): number {
  return element.closest('[data-shrunk="true"]') ? PAGE_SCALE : 1
}

/**
 * Measure the laid-out strip of pages.
 *
 * Returns zeroes before layout has happened and under jsdom, which has no
 * layout at all. That is deliberate rather than defensive: `columns.ts` reads
 * zero widths as "one page", so a section that hasn't been laid out behaves
 * exactly like a section with nothing to turn — and the reader falls back to
 * moving section by section, which is what it did before pages existed.
 */
function measure(element: HTMLElement | null): Strip {
  if (!element) return { scrollWidth: 0, pageWidth: 0, scrollLeft: 0 }
  const gap = columnGapOf(element)
  return {
    // Plus one gap. `columns.ts` works in whole pages, and a page is a column
    // *and the gap after it* — so the strip has to be reported as though the last
    // column carried its gap too, or the final page is short of a full pitch and
    // `pageCountOf` rounds the book one page smaller than it is.
    scrollWidth: element.scrollWidth + gap,
    // `getBoundingClientRect`, not `clientWidth`. This is the whole of the
    // "page 134 is cut off down the middle" bug, and it is pure arithmetic: a
    // column is exactly as wide as this box, but `clientWidth` is *rounded to a
    // whole pixel* while the box itself is very often fractional — 393.6px on a
    // phone. Every page turn then lands 0.4px short, which nobody can see, and
    // by page 134 the strip is 50px out of true, which everybody can. The
    // fractional width is the real column pitch, so multiples of it land on
    // real column edges however far into the book they are.
    // The *pitch*: one column plus the gap after it, which is how far one page
    // turn travels. `Strip.pageWidth` has always been documented that way; until
    // the gap existed the two happened to be the same number.
    //
    // Divided by the scale, because the rectangle is what the page *looks*
    // like and everything else here is what it *is* — see `scaleOf`. The gap is
    // read off the computed style and so is already unscaled.
    pageWidth: element.getBoundingClientRect().width / scaleOf(element) + gap,
    scrollLeft: element.scrollLeft,
  }
}

/**
 * The gap between one column and the next, in CSS pixels.
 *
 * Read off the computed style rather than repeated as a constant here, so
 * `Reader.module.css` stays the single place the page gutter is decided — a gap
 * in the stylesheet and a different one in the arithmetic would put every turn
 * slightly out of true, which is the exact failure the gap was added to end.
 *
 * Zero where there is no layout to read (jsdom reports `normal`), which is the
 * same "one page, nothing to turn" fallback the rest of `measure` takes.
 */
function columnGapOf(element: HTMLElement): number {
  if (typeof getComputedStyle !== 'function') return 0
  const gap = Number.parseFloat(getComputedStyle(element).columnGap)
  return Number.isFinite(gap) ? gap : 0
}

/**
 * Which page of the strip a paragraph sits on, 1-based.
 *
 * Measured against the strip rather than read off `offsetLeft`, for the same
 * reason as above: `offsetLeft` is a whole number, and rounding a position that
 * may be forty thousand pixels along is how a paragraph gets attributed to the
 * page next to the one it is on.
 */
function columnOf(node: HTMLElement, strip: HTMLElement | null): number {
  const { pageWidth } = measure(strip)
  if (!strip || pageWidth <= 0) return 1

  // Both rectangles are drawn at the same scale, so the distance between them
  // is scaled once — and `scrollLeft`, which it is added to, is not scaled at
  // all. Dividing puts the two in the same units.
  const from =
    (node.getBoundingClientRect().left - strip.getBoundingClientRect().left) / scaleOf(strip)
  // A half-pixel of slack, so a paragraph sitting exactly on a column edge is
  // read as opening that column rather than as ending the one before it.
  return Math.floor((from + strip.scrollLeft + 0.5) / pageWidth) + 1
}

/**
 * How long reading has to settle before the place is written down.
 *
 * Every scroll moves the current paragraph, so without this a page of reading
 * would be a page of database writes. Long enough to coalesce a scroll, short
 * enough that closing the tab almost never beats it.
 */
const SAVE_AFTER_MS = 800

/**
 * How long typing has to pause before the book is searched (WP-14).
 *
 * Shorter than `SAVE_AFTER_MS`, because this one is in front of the reader: they
 * are watching for the answer, where a saved position is invisible. Long enough
 * that typing "breath" scans once rather than six times, once per prefix.
 */
const SEARCH_AFTER_MS = 200

/** One array, so "no section yet" is the same value every render — see
    `useFigureImages`, which re-fetches when its input changes identity. */
const EMPTY_PARAGRAPHS: Paragraph[] = []

/**
 * The last paragraph to have crossed the reading line — what the page number
 * follows as you scroll.
 *
 * Returns `undefined` when nothing has been laid out, which is the honest
 * answer in two cases that both matter: before first paint, and under jsdom,
 * where every rectangle is zero and picking "the last one above the line" would
 * silently mean "the end of the section".
 */
function anchorOnScreen(anchors: readonly Anchor[]): Anchor | undefined {
  let best: Anchor | undefined
  for (const anchor of anchors) {
    const element = document.getElementById(elementIdOf(anchor))
    if (!element) continue

    const rect = element.getBoundingClientRect()
    if (rect.height === 0) continue

    if (rect.top <= READING_LINE) best = anchor
    else break
  }
  return best
}

/**
 * The reading page: one section on screen, with Previous and Next.
 *
 * Deliberately bare. Focus Mode is a toggle that hides chrome without removing
 * it (see `backlog.md`), so the baseline is built as the quiet version and
 * WP-13's overlay arrives as a layer on top — rather than the reverse, which
 * would mean retrofitting a way back to every control once hidden.
 *
 * Never loads a book. It loads a manifest (one line per chapter), one chapter
 * index, and one section, which is the entire retrieval path the storage layer
 * was shaped around.
 */
export default function Reader() {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookId as BookId | undefined

  const [frame, setFrame] = useState<FrameState>({ status: 'loading' })
  const [here, setHere] = useState<SectionRef>(firstSection())
  const [page, setPage] = useState<PageState>({ status: 'loading' })
  const [neighbours, setNeighbours] = useState<{
    previous?: SectionRef
    next?: SectionRef
  }>({})

  /**
   * The text of those two neighbours, not just where they are.
   *
   * `neighbours` above says which section comes next. This says what is *in* it,
   * and the difference is the whole of the seam turn. To follow the finger, a
   * page turn needs the arriving page laid out and on screen underneath the
   * sheet before the finger moves; a reference cannot be revealed, only fetched.
   * So both sides are read as soon as the page settles and mounted out of sight
   * — see `.understudy` in `Reader.module.css`.
   *
   * Two extra section reads per page. They are the same reads the turn was going
   * to make a moment later anyway, moved earlier, and IndexedDB serves them off
   * the same store the current page came from.
   */
  const [beside, setBeside] = useState<{
    /**
     * The path of the section these two sit beside.
     *
     * They outlive the page they were read for, on purpose: see the effect that
     * sets them. So every use has to ask whether they still describe the page on
     * screen, and `for` is the only honest way to ask.
     */
    for?: string
    previous?: Section
    next?: Section
  }>({})

  /*
   * Whose book the two states above are describing.
   *
   * The route is `/book/:bookId`, so following one book with another changes a
   * parameter rather than the screen: React keeps this component, and `frame`
   * and `page` go on holding the *previous* book's answer until the reads for
   * the new one come back. For a fraction of a second the reader is looking at
   * a page of the book they just left — or, worse, at "That book isn't in your
   * library" about a book that is.
   *
   * Cleared here, during the render that first sees the new id, rather than in
   * an effect. An effect runs after paint, which is one frame too late to stop
   * the wrong thing being painted — and that frame is the whole bug.
   */
  const [describing, setDescribing] = useState(id)
  if (describing !== id) {
    setDescribing(id)
    setFrame({ status: 'loading' })
    setPage({ status: 'loading' })
  }

  /**
   * The pictures for the section on screen, and only that section.
   *
   * A figure stores an archive path, which no browser can fetch; the hook
   * turns the handful this page needs into `blob:` URLs and revokes them when
   * the page turns. Bound to the book here because `reader/` holds no
   * reference to storage — the lookup is passed in.
   */
  const loadAssets = useCallback(
    async (paths: readonly string[]) =>
      id ? repository.getAssets(id, paths) : new Map<string, Blob>(),
    [id],
  )
  /*
   * The pictures for all three strips, not just the one on screen.
   *
   * An understudy is a real page the reader can be dragged onto, so it has to
   * break its columns exactly where the section itself will. A figure with no
   * picture yet draws at no height. Every line after it then sits a picture's
   * worth too high, and the reader lands on the page and watches the text drop
   * into place as the real section arrives — with the picture appearing before
   * the turn has finished. That was the reported fault.
   *
   * Memoised because the hook re-fetches whenever this array changes identity,
   * and it returns the live list unchanged while there are no neighbours, so a
   * book with no figures never builds a second array.
   */
  const shownParagraphs = useMemo(() => {
    const live = page.status === 'ready' ? page.section.paragraphs : EMPTY_PARAGRAPHS
    const before = beside.previous?.paragraphs
    const after = beside.next?.paragraphs
    if (!before && !after) return live
    return [...live, ...(before ?? []), ...(after ?? [])]
  }, [page, beside])

  const figureImages = useFigureImages(shownParagraphs, loadAssets)

  const [focusMode, setFocusMode] = useState(readFocusMode)

  /** Theme, font, text size, line spacing, margins — the Aa tab's settings. */
  const [settings, setSettings] = useState<ReaderSettings>(readReaderSettings)

  const changeSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

  /**
   * How highlights are painted, for this book.
   *
   * Kept apart from `settings` because it is kept per book, not per app: a
   * devotional read on paper and a manual read on a dark screen want different
   * marks. `auto` — the default — takes the answer from the theme, and any other
   * value is the reader overruling that and is never overwritten.
   */
  const [highlighter, setHighlighter] = useState<HighlighterChoice>(() => readHighlighter(id))

  // The book can change under this screen without it remounting.
  useEffect(() => {
    setHighlighter(readHighlighter(id))
  }, [id])

  const changeHighlighter = useCallback(
    (choice: HighlighterChoice) => {
      setHighlighter(choice)
      writeHighlighter(id, choice)
    },
    [id],
  )

  /**
   * A book opens on the book, not on the interface.
   *
   * This used to start showing, so the library link and the contents button
   * were the first thing a reader met. But the overlay is a panel over the
   * page, and starting with it up means every book begins covered. The status
   * line at the foot stays regardless, and a tap in the middle of the page
   * brings the rest back — the gesture this screen has always had, and the one
   * Google Books trains.
   */
  const [chromeShown, setChromeShown] = useState(false)

  /**
   * How small the text is drawn right now — full size while reading, stepped
   * back while the toolbar is up.
   *
   * Named once here and used in the two places that both have to agree about
   * it: the stylesheet, which does the shrinking, and the page turn, which
   * copies the page and has to draw the copy at the size the reader is
   * actually looking at.
   */
  const drawnAt = chromeShown ? PAGE_SCALE : 1
  /** Whether the search panel is up. Declared here with the other two layers
      rather than beside the search machinery below, because the three of them
      are governed together — see "the layers over the page". */
  const [searchOpen, setSearchOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<SheetTab>('contents')
  const [barState, setBarState] = useState<BarState>('pages')

  /**
   * Every section's length, for the page number and the fine slider. Loaded
   * once per book alongside the manifest — chapter indexes only, never prose.
   * `null` means the book predates word counts and the backfill hasn't run or
   * hasn't finished; the overlay falls back to chapters on its own.
   */
  const [spine, setSpine] = useState<Spine | null>(null)

  /**
   * The same chapter indexes the spine is built from, kept rather than dropped.
   *
   * They carry every section title in the book, which is what the contents page
   * lists under each chapter. Titles and paths only — never prose — so this is
   * the cheap half of the book and holding it costs nothing a reading screen
   * cannot afford.
   */
  const [chapterIndexes, setChapterIndexes] = useState<readonly ChapterIndex[]>([])

  /**
   * The paragraph currently at the top of the screen. Sections run to a dozen
   * pages in a real book, so without this the page number would freeze at the
   * start of a section and only jump when you left it.
   */
  const [anchorHere, setAnchorHere] = useState<Anchor | undefined>(undefined)

  /**
   * How many pages past the start of `anchorHere` the reader is.
   *
   * State rather than a ref, deliberately: the write below is debounced on its
   * dependencies, and moving through a paragraph that runs over many columns
   * has to count as movement. See `ReadingPosition.within` for why the offset
   * is kept at all.
   */
  const [withinHere, setWithinHere] = useState(0)

  /**
   * Every place the reader has marked in this book (WP-14).
   *
   * Held in state and edited in place after each write rather than re-read from
   * the database: the list is short, the writes all happen here, and a re-read
   * would make the ribbon flicker between its two glyphs while the round trip
   * finished. The database is still the record — this is a copy of it that is
   * only ever changed at the same moment the database is.
   */
  const [bookmarks, setBookmarks] = useState<StoredBookmark[]>([])

  /** The notes on this book — yours and the tutor's. Loaded once, like marks. */
  const [notes, setNotes] = useState<StoredNote[]>([])

  // There was an `ends` state here — whether this section had pages left either
  // way — and it existed solely to grey out the Previous and Next buttons. With
  // those gone, nothing renders from it: a swipe or an arrow key at the end of
  // the book is answered by `turnPage` finding nowhere to go and doing nothing,
  // which was always the real rule.

  /**
   * Where reading was before a link was followed.
   *
   * Not optional politeness: a footnote marker throws you across the book, and
   * finding your way back by hand means remembering a page number you never
   * looked at. Every reader offers this, and without it links are a trap.
   *
   * The page number rides along because "back to where you were" is a promise a
   * reader has to take on trust, and "back to page 250" is one they can check.
   */
  const [returnTo, setReturnTo] = useState<
    { anchor: Anchor; page?: number; within: number } | undefined
  >(undefined)

  /**
   * A page asked for that needs its section loaded before it can be resolved to
   * a paragraph. Held in a ref rather than state because it is a one-shot
   * instruction to the effect below, not something anything renders.
   */
  const pendingPage = useRef<number | undefined>(undefined)

  /**
   * A paragraph to land on once its section has loaded — the saved place, on
   * opening. Shares the shape of `pendingPage` above and is consumed by the same
   * effect; the difference is only that this one already names a paragraph.
   */
  const pendingAnchor = useRef<Anchor | undefined>(undefined)

  /**
   * How many pages past the start of `pendingAnchor` to land.
   *
   * A paragraph names a place, but on a phone one block can run over several
   * pages — a long note, a caption, a table — and a page in the middle of one
   * has no paragraph of its own to be named by. That is the whole of the "Back
   * to page 10 put me on a different page 10" bug: leaving from the third page
   * of a long block and coming back to its first page is a real move, even
   * though both pages answer to the same anchor. Carrying the offset makes the
   * way back exact rather than merely close.
   */
  const pendingWithin = useRef(0)

  /** The section already landed on, so arriving somewhere happens once. */
  const landedOn = useRef<SectionPath | undefined>(undefined)

  /** Whether any section has been landed on yet — see the arrival below. */
  const landedBefore = useRef(false)

  /** The element the book is laid out in — the strip of pages. */
  const strip = useRef<HTMLElement | null>(null)

  /**
   * The same, for the section on either side. Laid out, and not drawn until a
   * turn at the seam brings one of them out. See `beside` and `.understudy`.
   */
  const beforeStrip = useRef<HTMLElement | null>(null)
  const afterStrip = useRef<HTMLElement | null>(null)

  /**
   * The seam turn in flight: which section it lands in, and which strip is
   * showing while it runs.
   *
   * A turn inside a section needs none of this — the strip is already sitting on
   * the destination, so completing is the case where nothing has to happen. A
   * seam turn is the opposite. The destination is a different section, so
   * finishing means loading it, and abandoning means putting the understudy away
   * again. Neither is knowable from the sheet alone, so it is written down when
   * the drag starts.
   */
  const seam = useRef<{ to: SectionRef; land: 'start' | 'end'; shown: HTMLElement } | null>(null)

  /**
   * An understudy left on screen after a seam turn went through, holding the
   * arriving page until the real strip has caught up with it. Put away by the
   * landing effect, which is the first moment the real strip shows the right
   * section.
   */
  const holdSeam = useRef<HTMLElement | null>(null)

  /**
   * Which end of a freshly loaded section to land on.
   *
   * Turning back from the first page of a section has to land on the *last*
   * page of the previous one, not its first — otherwise going back a page and
   * then forward again lands somewhere you have never been.
   */
  const landOn = useRef<'start' | 'end'>('start')

  /**
   * The page being left, held on screen while the next section loads.
   *
   * A turn between sections has to be made out of two moving pages, like the
   * scroll it stands in for — see `reader/pageTurn.ts` for why one moving page
   * reads as wrong however it is animated. Only ever set by a real page turn:
   * a link, the slider and opening the book are not directional gestures, and
   * giving them a direction would be inventing one.
   */
  const held = useRef<HeldPage | null>(null)

  /** Stops the slide in flight, if there is one. */
  const scrolling = useRef<Cancel | null>(null)

  /**
   * Where the strip was last told to go, or `null` if that was a landing.
   *
   * A page turn asks "which page am I on?" and answers it from `scrollLeft` —
   * which, while a slide is running, is somewhere between two pages. Tapping
   * Next twice quickly would read that halfway point, round it back to the page
   * being left, and turn to the page already being turned to: the second tap
   * does nothing. Asking where the strip is *going* makes every tap count.
   *
   * It needs no clearing when a slide ends, because by then it says exactly
   * where the strip is. A landing resets it to `null` — the offsets it was
   * measured in belong to a section that is no longer on screen.
   */
  const scrollTarget = useRef<number | null>(null)

  /**
   * How many moves have been asked for. Only ever compared with itself.
   *
   * `settleOn` corrects a landing a frame or two after it happens, and a reader
   * who swipes inside those two frames must not be dragged back to where they
   * just left. Comparing the count taken before the wait with the count after
   * it is how the correction knows it has been overtaken.
   */
  const moveSeq = useRef(0)

  /** Where the finger went down, for the swipe that turns a page. */
  const touchStart = useRef<Touch | null>(null)

  /**
   * The brightness drag on the right-hand deck, once it has been claimed.
   *
   * `y` is where it was claimed and `from` is how dark the page was at that
   * moment, so every move is reckoned from the start of the stroke rather than
   * added up — see `dimAfterDrag`. Null means no such gesture is running.
   */
  const dimDrag = useRef<{ y: number; from: number } | null>(null)

  /**
   * Whether this stroke began on the deck's band at all.
   *
   * Decided once, at `pointerdown`, and then left alone. A stroke that starts
   * in the middle of the page cannot become a brightness drag by wandering
   * over to the edge, and a stroke that starts on the band cannot turn a page
   * once it has gone vertical. That is the direction gate: one question, asked
   * once, in each direction.
   */
  const dimZone = useRef(false)

  /**
   * Whether this stroke began in the band the system's back gesture owns.
   *
   * Same gate as `dimZone`, asked at the same moment and for the same reason:
   * swiping in from an edge to leave the book was also a horizontal swipe across
   * the page, so every exit turned a page on the way out. See `inEdgeBand`.
   */
  const edgeZone = useRef(false)

  /**
   * Write the darkness straight to `<html>` while the finger is down.
   *
   * Not through React. This runs on every pointer move, and re-rendering the
   * reading screen — a section of six thousand paragraphs — to change one
   * number is how a smooth drag becomes a slideshow. The value is committed to
   * the setting once, on release, and the effect that applies the setting then
   * writes the same number it already holds.
   */
  const showDim = useCallback((value: number) => {
    document.documentElement.style.setProperty('--reader-dim', String(value))
  }, [])

  /**
   * The turn currently under the reader's thumb.
   *
   * A page turn is not a thing that is triggered any more — it is a thing that
   * is *held*. Everything below is the bookkeeping that lets one finger own the
   * sheet from the moment it starts moving until it lets go.
   */
  const drag = useRef<Drag | null>(null)

  /**
   * Where the drag was reckoned from — set at the moment the gesture is
   * recognised, not where the finger first touched down.
   *
   * The difference is the recognition threshold, and it matters: measuring from
   * the touch-down point would mean the sheet appears already eight pixels
   * turned, which the eye catches as a jump. Measuring from here, the first
   * frame of the curl is the first pixel of movement past the threshold.
   */
  const dragFrom = useRef(0)

  /** How far through the gesture the thumb is, 0 to 1, in the turn's direction. */
  const dragAt = useRef(0)

  /** The page to put back if the turn is abandoned. */
  const dragHome = useRef(1)

  /**
   * Speed, in px/ms, smoothed just enough to survive one stuttering frame.
   *
   * A flick is a real way to turn a page and it barely moves the sheet, so the
   * release has to know about speed and not only distance. A raw last-two-points
   * reading is far too jumpy — one dropped frame reads as a stop — and a long
   * average lags behind the finger. A short exponential mean is the cheap
   * middle: see `RUN_ON`.
   */
  const dragSpeed = useRef(0)

  /** The previous move, for the speed above. */
  const dragLast = useRef({ x: 0, at: 0 })

  /**
   * A swipe just happened, so the click the browser synthesises after it should
   * be ignored. Without this, every swipe would also toggle the overlay.
   */
  const swiped = useRef(false)

  /**
   * Whether the saved place has been looked up yet.
   *
   * A gate, not a status. Without it the reader opens chapter 1, fetches it,
   * *then* hears where it should have opened — a wasted read and a visible
   * flash of the wrong page. Worse, the position would be saved back as chapter
   * 1 before the real one arrived, quietly erasing it.
   */
  const [restored, setRestored] = useState(false)

  /**
   * True when the book reopened somewhere the reader may not remember leaving.
   * Suppressed for a place saved moments ago, where announcing it would be
   * noise.
   */
  const [resumed, setResumed] = useState(false)

  /**
   * How many sections each chapter has, remembered as we go. Navigation asks
   * this on every move, and re-reading the same chapter index to answer "am I
   * at the end of this chapter?" would be a database round trip per tap.
   */
  const sectionCounts = useRef(new Map<number, number>())

  const sectionsIn = useCallback(
    async (chapter: number): Promise<number | undefined> => {
      if (!id) return undefined

      const known = sectionCounts.current.get(chapter)
      if (known !== undefined) return known

      const index = await repository.getChapterIndex(id, chapter)
      if (!index) return undefined

      sectionCounts.current.set(chapter, index.sections.length)
      return index.sections.length
    },
    [id],
  )

  /**
   * The one door to "go somewhere else in this book". Next, Previous, the
   * contents list and the slider all come through here, and WP-14's page
   * transition plugs in at this single point — which is exactly why they
   * don't each move `here` themselves.
   */
  const goTo = useCallback((ref: SectionRef) => {
    // Dropping a move to where you already are matters more than it looks:
    // several pages can fall inside one long section, so dragging the page
    // slider would otherwise re-fetch and re-render the same section on every
    // step of the drag.
    setHere((current) =>
      current.chapter === ref.chapter && current.section === ref.section ? current : ref,
    )
    setSheetOpen(false)
    setResumed(false)
  }, [])

  /**
   * Scroll the strip so that `page` is the one showing.
   *
   * `instant` is not a nicety — it fixes a turn that animated the wrong way.
   * The strip slides, which is right for a turn *within* a section: page 3 → 4
   * moves leftwards, forwards. But arriving in a *new* section is not a scroll
   * at all, it is different text in the same box. Turning forward off the last
   * page left the strip scrolled hard right, the new section replaced the
   * content, and scrolling to page 1 then slid rightwards — a forward move
   * playing a backward animation. So a landing is instant, and the movement for
   * it is supplied by `pageTurn.ts` instead.
   *
   * The slide is timed by `motion.ts` rather than by `scroll-behavior: smooth`,
   * because the browser varies that duration with the distance travelled — the
   * reason a turn inside a chapter used to take visibly longer than a turn
   * between two.
   */
  const showPage = useCallback((page: number, instant = false) => {
    const element = strip.current
    if (!element) return

    // A move in flight is abandoned rather than left to fight the new one for
    // the same property — a fast tapper outruns the animation.
    scrolling.current?.()
    moveSeq.current += 1
    const left = offsetOfPage(measure(element), page)
    scrollTarget.current = instant ? null : left
    scrolling.current = scrollStrip(element, left, { instant })
  }, [])

  /**
   * Which page is showing, asked in a way that survives a slide in flight.
   *
   * `scrollLeft` alone answers "somewhere between two pages" while a turn is
   * running, and rounding that lands on either of them. Where the strip has been
   * *told* to go is the honest answer, and it is the one a link tapped straight
   * after a page turn depends on: it is the number written into the way back.
   */
  const pageShowing = useCallback(() => {
    const strip0 = measure(strip.current)
    const going = scrollTarget.current
    return pageAt(going === null ? strip0 : { ...strip0, scrollLeft: going })
  }, [])

  /**
   * Land on a paragraph's page — and stay there once the browser has finished
   * laying the section out.
   *
   * The measurement is right the moment it is taken; the trouble is that it is
   * taken the instant React has put the section in the document, and the browser
   * may still be re-flowing forty pages of columns behind it — a webfont
   * swapping in, an image finding its height. A column boundary that then moves
   * takes the page we scrolled to with it, which is how "back to page 1" arrives
   * on a screen of page 1 that isn't the one you left.
   *
   * So the answer is checked again and corrected in place as the layout moves.
   * Silent when nothing changed, which is most of the time, and abandoned the
   * moment the reader moves for themselves.
   *
   * It used to check exactly twice, on the next two frames — about 32 ms — and
   * that is the whole of the "closed on p027, reopened on p023" bug. Two frames
   * is long enough for a font swap and nowhere near long enough for an image to
   * decode. A book of full-page pictures opens with every image at zero height,
   * so the columns are far too short and *every* paragraph reports a lower
   * column number than it will end up in. We scroll to that number, the pictures
   * arrive, forty pages of columns slide rightwards, and the reader is left
   * looking at text from several paragraphs earlier.
   *
   * So instead of a fixed count, this follows the layout until it stops moving:
   * `scrollWidth` is the width of the whole laid-out section, and it changes on
   * every reflow. Correct on each frame; when the width has held still for a few
   * frames the layout has settled and there is nothing left to chase. `SETTLE_MS`
   * is the backstop for a section that never settles at all — a slowly-loading
   * image over a bad connection — because chasing forever would mean a reader who
   * scrolls at second four gets yanked back.
   */
  const settleOn = useCallback(
    (node: HTMLElement, within = 0) => {
      showPage(columnOf(node, strip.current) + within, true)

      const mine = moveSeq.current
      if (typeof requestAnimationFrame !== 'function') return

      const correct = () => {
        const element = strip.current
        if (!element || !node.isConnected || moveSeq.current !== mine) return

        const wanted = offsetOfPage(measure(element), columnOf(node, element) + within)
        // Half a pixel: below that the strip is already on the column, and
        // assigning `scrollLeft` again would only invite a rounding loop.
        if (Math.abs(element.scrollLeft - wanted) > 0.5) element.scrollLeft = wanted
      }

      const until = Date.now() + SETTLE_MS
      let lastWidth = -1
      let stillFor = 0

      const chase = () => {
        const element = strip.current
        if (!element || !node.isConnected || moveSeq.current !== mine) return

        correct()

        const width = element.scrollWidth
        stillFor = width === lastWidth ? stillFor + 1 : 0
        lastWidth = width

        // Three frames of an unchanged width is a settled layout. One is not:
        // images land one at a time, and a single quiet frame between two of
        // them would end the chase halfway through the reflow.
        if (stillFor >= SETTLE_FRAMES || Date.now() > until) return
        requestAnimationFrame(chase)
      }

      requestAnimationFrame(chase)
    },
    [showPage],
  )

  /**
   * Move to a page.
   *
   * The case that matters is the one that used to do nothing: a page inside the
   * section already on screen. A real chapter is often a single section running
   * a dozen pages, so nudging the slider from 176 to 177 found the same section,
   * decided nothing had changed, and sat still until the slider crossed into the
   * next chapter — a fourteen-page jump. Now the move within a loaded section is
   * a scroll to the paragraph that page starts at.
   */
  const jumpToPage = useCallback(
    (wanted: number) => {
      if (!spine) return
      const ref = refAtPage(spine, wanted)
      setSheetOpen(false)

      const sameSection = ref.chapter === here.chapter && ref.section === here.section
      if (sameSection && page.status === 'ready') {
        const anchor = anchorAtPage(spine, ref, page.section, wanted)
        const node = anchor ? document.getElementById(elementIdOf(anchor)) : null
        if (anchor && node) {
          settleOn(node)
          setAnchorHere(anchor)
        }
        return
      }

      // A different section: it has to load before a paragraph inside it can be
      // named, so hand the page to the effect that runs once it has.
      pendingPage.current = wanted
      setHere(ref)
    },
    [spine, here, page, settleOn],
  )

  /**
   * Where you are, in pages — derived from one number, the words behind you.
   * Keeping it single-sourced is what stops the bar, the slider and the chapter
   * countdown from disagreeing with each other by a page.
   *
   * Computed here, above the jump, rather than just before the render: following
   * a link has to write down the page you are leaving *while you are still on
   * it*, so the way back can be named rather than merely offered.
   */
  const pages = spine
    ? pagesAt(
        spine,
        here,
        // `withinHere` is the other half of the place, and without it the number
        // froze: `anchorHere` is the paragraph the page *begins in*, so reading
        // through one long paragraph changed nothing here at all. See the note
        // on `pagesInto` in `wordsAt`.
        wordsAt(
          spine,
          here,
          page.status === 'ready' ? page.section : undefined,
          anchorHere,
          withinHere,
        ),
      )
    : null

  /**
   * The contents list itself: chapters, with each chapter's named sections
   * indented under it. See `contentsOutline` for what earns a row and why the
   * flat list of chapters was not enough.
   *
   * Memoised on the same reasoning as `chapterStartPages`, and it matters more
   * here — with sections the list is hundreds of rows on a real book, not forty.
   */
  const outline = useMemo(
    () =>
      frame.status === 'ready' ? contentsOutline(frame.manifest, chapterIndexes, spine) : [],
    [frame, chapterIndexes, spine],
  )

  /**
   * The page a bookmark or a note sits on — the number on a bookmark's flag.
   *
   * **Section-granular, and knowingly so.** The exact page needs the words
   * *inside* the section counted up to that paragraph, and that needs the
   * section's text loaded. A reader with marks in nine chapters would have the
   * app fetch nine chapters to draw one list. So this answers with the page the
   * mark's section opens on: right in a book whose chapters are one section
   * each, and a page or two early in a long one. The mark itself is unaffected
   * — it is an anchor, and tapping it lands on the exact paragraph.
   *
   * `null` for a book with no word counts, and for an anchor that cannot be
   * parsed. The panels then simply show no number.
   */
  const pageOfAnchor = useCallback(
    (parts: { chapter: number; section: number } | null | undefined): number | null => {
      if (!spine || !parts) return null
      return pagesOf(spine, { chapter: parts.chapter, section: parts.section }).page
    },
    [spine],
  )

  /**
   * Go to a paragraph — what following a link does.
   *
   * Same two steps as the page slider, for the same reason: the section may
   * already be on screen, in which case this is a move between columns rather
   * than a load.
   */
  const jumpToAnchor = useCallback(
    (anchor: Anchor, within = 0) => {
      const parts = tryParseAnchor(anchor)
      if (!parts) return

      // Remembered *before* moving, so the way back is where you were reading
      // rather than where the link took you.
      //
      // The fallback matters: a link tapped before any scrolling has happened
      // leaves `anchorHere` unset, and remembering nothing would mean the
      // "back" button never appears — the one case where a reader is most
      // likely to tap a link, on the page they just opened.
      const from =
        anchorHere ?? (page.status === 'ready' ? page.section.paragraphs[0]?.anchor : undefined)
      if (from) {
        // How far into that paragraph's own run of pages we are — see
        // `pendingWithin`. Measured now, while the page it describes is still
        // the one on screen.
        const fromNode = document.getElementById(elementIdOf(from))
        const fromWithin = fromNode
          ? Math.max(0, pageShowing() - columnOf(fromNode, strip.current))
          : 0
        setReturnTo({ anchor: from, within: fromWithin, ...(pages ? { page: pages.page } : {}) })
      }
      setSheetOpen(false)

      // Nothing is raised on arrival. A jump is the one move where a reader
      // genuinely doesn't know where they have landed, and this used to answer
      // that by throwing the whole overlay up — a lot of furniture for one
      // number, over the page just arrived at. The number is now permanently at
      // the foot of the page, so there is nothing left to announce.
      if (parts.chapter === here.chapter && parts.section === here.section) {
        const node = document.getElementById(elementIdOf(anchor))
        if (node) {
          // Instant, then faded. A jump has no direction — a footnote is not to
          // the left or the right of the sentence that sent you to it — so it
          // gets the turn's *duration* rather than the turn's slide.
          settleOn(node, within)
          fadeIn(strip.current)
          setAnchorHere(anchor)
        }
        return
      }

      pendingAnchor.current = anchor
      pendingWithin.current = within
      setHere({ chapter: parts.chapter, section: parts.section })
    },
    [here, anchorHere, page, settleOn, pageShowing, pages],
  )

  /**
   * Turn one page.
   *
   * Two moves in one, and the seam between them is the point (see "the page
   * turn is a seam" in `backlog.md`): *within* a section this is a scroll of one
   * column, and at either end it becomes the section move it always was. Every
   * route to a page turn — swipe, edge tap, the Previous/Next buttons — comes
   * through here, so none of them has to know which of the two happened.
   */
  const turnPage = useCallback(
    (by: 1 | -1) => {
      // Measured against the slide's destination when one is running — see
      // `scrollTarget`. Without this, a quick second tap is swallowed.
      const now = measure(strip.current)
      const next = turn(
        scrollTarget.current === null ? now : { ...now, scrollLeft: scrollTarget.current },
        by,
      )
      if (next !== null) {
        // A turn inside a section used to *be* the scroll — the strip slid one
        // column and that slide was the animation. It isn't any more: the page
        // turns over instead, so the scroll happens instantly underneath and
        // the movement is supplied by the sheet rotating on top of it. Same two
        // pages, same timing; a different metaphor for the same move.
        //
        // A second turn before the first has landed drops the first outright —
        // a fast tapper outruns the animation rather than queueing behind it.
        cancelTurn(held.current)
        const sheet = holdOutgoing(strip.current, by, drawnAt)
        showPage(next, true)
        playFlip(sheet, strip.current)
        return
      }

      // Off the end of this section: fall through to the next or previous one,
      // remembering which end of it to arrive at.
      const target = by === 1 ? neighbours.next : neighbours.previous
      if (!target) return
      landOn.current = by === 1 ? 'start' : 'end'
      // A second turn before the first has landed drops the first outright —
      // a fast tapper outruns the animation rather than queueing behind it.
      cancelTurn(held.current)
      held.current = holdOutgoing(strip.current, by, drawnAt)
      goTo(target)
    },
    [neighbours, showPage, goTo, drawnAt],
  )

  /**
   * Start a turn the finger is going to carry.
   *
   * Returns `true` if a sheet is now under the thumb. `false` means this gesture
   * cannot be dragged and should fall back to the old threshold swipe, which
   * happens in two cases worth naming:
   *
   * - **A reader who asked for less movement.** `beginDrag` declines, and they
   *   get the instant change they asked for.
   * - **The turn crosses a section boundary.** The destination is not laid out
   *   yet — it has not been fetched — so there is nothing to reveal underneath
   *   the sheet and nothing honest to scrub against. Those turns keep the
   *   two-copy handoff in `turnPage`, which was built for exactly that seam.
   */
  /**
   * The same turn, where the destination is the next section rather than the
   * next page.
   *
   * ## What makes this different
   *
   * Everything a dragged turn does rests on one thing: the page you are arriving
   * at is already on screen, underneath, so the sheet reveals it rather than
   * announcing it. Inside a section that is free — the strip is scrolled to the
   * destination and the sheet is a picture laid over it. At a seam it was not
   * free, because the arriving section was not fetched, so these turns fell back
   * to the threshold swipe and the thumb carried nothing. Two pages per section.
   *
   * `beside` closes that. Both neighbours are read and mounted out of sight as
   * soon as the page settles, so there is a real, laid-out strip to reveal.
   *
   * ## The ordering, which is the same rule as inside a section
   *
   * `beginDrag` photographs whatever the strip shows *at the moment it is
   * called*, so the two directions sequence in opposite orders:
   *
   * - **Forwards** the sheet is the page being left, so it is built off the real
   *   strip first, and the understudy is brought out behind it afterwards.
   * - **Backwards** the sheet is the page *arriving*, so the understudy has to be
   *   showing before it is photographed — and the page being left is pinned by
   *   `holdStill` before that, or it goes out from under the reader.
   *
   * Either way the real strip is hidden once the understudy is out. They occupy
   * the same box and neither is opaque, so leaving both up prints two sections
   * of text over each other.
   *
   * ## Why it does not commit here
   *
   * The finger can still come back. Loading the next section on the way past
   * would make an abandoned turn a real move, so the destination is only written
   * down, and `endDrag` decides.
   */
  const startSeamDrag = useCallback(
    (by: 1 | -1, at: number) => {
      const element = strip.current
      if (!element) return false

      // The two strips hold the last page's neighbours until the new ones are
      // read. Revealing one then would drag the reader onto a page from
      // somewhere else entirely, so the turn declines and the threshold swipe
      // takes it — for the fraction of a second the read takes.
      if (beside.for !== pathOf(here)) return false

      const to = by === 1 ? neighbours.next : neighbours.previous
      const understudy = by === 1 ? afterStrip.current : beforeStrip.current
      // The reference and the text are set a beat apart. Both are needed: one
      // says where to go, the other is what gets revealed on the way.
      const loaded = by === 1 ? beside.next : beside.previous
      if (!to || !understudy || !loaded) return false

      // Where in the arriving section the turn lands: its first page going
      // forward, its last page coming back — the same rule `landOn` follows, so
      // the page revealed under the sheet is the page that is still there when
      // the section itself arrives.
      const land: 'start' | 'end' = by === 1 ? 'start' : 'end'
      const box = measure(understudy)
      if (box.pageWidth <= 0) return false
      understudy.scrollLeft = offsetOfPage(box, land === 'start' ? 1 : pageCountOf(box))

      const show = () => {
        understudy.dataset.showing = 'true'
        element.style.visibility = 'hidden'
      }

      const still = by === -1 ? holdStill(element, drawnAt) : null
      if (by === -1) show()

      const built =
        by === 1
          ? beginDrag(element, by, drawnAt, null, 0)
          : beginDrag(understudy, by, drawnAt, still, 0)

      if (!built) {
        // Declined — reduced motion, or no frame to hang it on. Put everything
        // back exactly as it was and let `turnPage` play the fixed animation.
        dropStill(still)
        understudy.dataset.showing = 'false'
        element.style.visibility = ''
        return false
      }

      if (by === 1) show()

      seam.current = { to, land, shown: understudy }
      drag.current = built
      dragFrom.current = at
      dragAt.current = 0
      dragSpeed.current = 0
      dragLast.current = { x: at, at: performance.now() }
      return true
    },
    [neighbours, beside, here, drawnAt],
  )

  const startDrag = useCallback(
    (by: 1 | -1, at: number) => {
      const element = strip.current
      if (!element) return false

      const now = measure(element)
      const next = turn(now, by)

      dragHome.current = pageAt(now)

      // Off the end of this section. The arriving page is in a different
      // section, which is mounted and waiting — see `startSeamDrag`.
      if (next === null) return startSeamDrag(by, at)

      // Backwards, the arriving page is the one that moves, so the page being
      // left has to be pinned down *before* the strip is scrolled off it. See
      // the ordering note on `beginDrag`.
      const still = by === -1 ? holdStill(element, drawnAt) : null

      // Forwards the bands are the page being left, so they are built first and
      // the strip slides to the destination behind them.
      const sheet = by === 1 ? beginDrag(element, by, drawnAt, null, 0) : null
      showPage(next, true)
      const built = sheet ?? (by === -1 ? beginDrag(element, by, drawnAt, still, 0) : null)

      if (!built) {
        // Declined — reduced motion, or no frame to hang it on. Put the strip
        // back and let the release play the fixed animation instead. Through
        // `dropStill`, not `remove`: taking a still copy hides the real page
        // furniture, and it has to be given back on this path too.
        dropStill(still)
        showPage(dragHome.current, true)
        return false
      }

      drag.current = built
      dragFrom.current = at
      dragAt.current = 0
      dragSpeed.current = 0
      dragLast.current = { x: at, at: performance.now() }
      return true
    },
    [showPage, drawnAt, startSeamDrag],
  )

  /** Move the sheet to wherever the thumb now is. */
  const moveDrag = useCallback((at: number) => {
    const held = drag.current
    if (!held) return

    // Positive in the direction of travel, whichever direction that is, so one
    // number drives both and the shape never needs to know which way it is
    // going.
    const travel = held.by === 1 ? dragFrom.current - at : at - dragFrom.current
    dragAt.current = curlProgress(travel, held.width)
    paintDrag(held, dragAt.current)

    const now = performance.now()
    const gap = now - dragLast.current.at
    if (gap > 0) {
      const moved = (held.by === 1 ? dragLast.current.x - at : at - dragLast.current.x) / gap
      // The first reading is taken whole, not averaged against the zero the
      // gesture starts at. A flick is over in two or three moves, and blending
      // from zero reported about a third of its real speed — so the fastest
      // swipes, the ones most obviously meant to turn the page, were the ones
      // that sprang back. Averaging only makes sense once there is something to
      // average with.
      dragSpeed.current =
        dragSpeed.current === 0 ? moved : dragSpeed.current * (1 - RUN_ON) + moved * RUN_ON
      dragLast.current = { x: at, at: now }
    }
  }, [])

  /**
   * The finger is off. Let the sheet finish, or put it back.
   *
   * The strip has been sitting on the destination since the gesture began, so
   * completing is the case where nothing more has to happen — the sheet simply
   * comes off and reveals what was already there. It is the *abandoned* turn
   * that has work to do, which is the opposite way round from how this read
   * before the drag existed, and worth knowing when reading the branch below.
   */
  const endDrag = useCallback(() => {
    const held = drag.current
    if (!held) return
    drag.current = null

    const home = dragHome.current
    const crossing = seam.current
    seam.current = null

    settleDrag(held, dragAt.current, dragSpeed.current, (committed) => {
      if (!crossing) {
        if (!committed) showPage(home, true)
        return
      }

      if (!committed) {
        // Turned back. Put the understudy away and give the real strip back —
        // the reader never left the page they were on.
        crossing.shown.dataset.showing = 'false'
        if (strip.current) strip.current.style.visibility = ''
        showPage(home, true)
        return
      }

      // Gone through. The understudy stays out and the real strip stays hidden
      // until the section it is showing has actually loaded — the arriving page
      // is on screen now, and taking it away to wait for the same page to be
      // fetched would be a blink of the section just left. `holdSeam` is put
      // away by the landing, which is the moment the real strip is right again.
      holdSeam.current = crossing.shown
      landOn.current = crossing.land
      goTo(crossing.to)
    })
  }, [showPage, goTo])

  /**
   * Turn a page from the keyboard.
   *
   * The book is read by swiping and by tapping the edges of the page, neither of
   * which exists without a touch screen or a mouse. This is what a reader on a
   * laptop turns pages with, and it is the whole replacement for the Previous
   * and Next buttons that used to sit under every page.
   *
   * On the window rather than on the text, because nothing on this screen holds
   * focus while you read — the page is prose, not a control.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Not while typing, and not while a modifier is held: those belong to the
      // browser, and stealing ⌘← would take a reader out of the book.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const by =
        event.key === 'ArrowRight' || event.key === 'PageDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'PageUp'
            ? -1
            : 0
      if (by === 0) return

      event.preventDefault()
      turnPage(by)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turnPage])

  /*
   * ## The layers over the page, and the one rule they follow
   *
   * There are two: the sheet, and search. Only one is ever open,
   * and every route in says which one it wants rather than toggling. That is
   * not tidiness — it is what makes the back gesture below correct, because
   * "close whatever is over the book" is then a single, unambiguous action.
   */

  const openSheet = useCallback((tab: SheetTab) => {
    setSheetTab(tab)
    setSearchOpen(false)
    setSheetOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
  }, [])

  const openSearch = useCallback(() => {
    setSheetOpen(false)
    setSearchOpen(true)
  }, [])

  /**
   * Leaving search keeps the query, which is what "remember the last search"
   * means in practice: come back to the panel and the word is still there,
   * ready to be run again or edited. Cleared only when the book is left,
   * because the screen goes with it.
   */
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
  }, [])

  const closeLayers = useCallback(() => {
    setSheetOpen(false)
    setSearchOpen(false)
  }, [])

  /**
   * A back gesture closes what is over the book rather than leaving the book.
   *
   * Asked of every layer through one flag, not once per layer. Separate calls
   * would each push and pop their own history entry, and moving from one layer
   * straight to another would pop one entry while pushing another in the same
   * commit — a swallowed gesture at best, and at worst a `popstate` arriving a
   * moment later to close the layer just opened.
   *
   * Two bugs from the phone, the same shape both times. First: opening search,
   * typing nothing, and swiping back threw the reader out of the book — search
   * had never been wired to this. Then, 2026-08-09: raising the toolbar shrinks
   * the page, and swiping back left the book rather than putting the page back.
   *
   * **The toolbar is a layer.** It is the one that took two reports to see,
   * because it does not *look* like a panel — but it covers the page, it
   * changes the page's size, and a reader who raised it has somewhere to come
   * back to. That is the whole definition.
   */
  const dismissTopLayer = useCallback((): void => {
    // One gesture, one layer. A reader with the sheet open over the toolbar
    // expects Back to close the sheet and leave them looking at the toolbar —
    // not to clear the screen in one go, which loses the state they were in.
    if (sheetOpen || searchOpen) {
      closeLayers()
      return
    }

    setChromeShown(false)
  }, [sheetOpen, searchOpen, closeLayers])

  /*
   * How many layers stand between the reader and the bare page. The panel counts
   * as one however it is dressed — search, contents, bookmarks, notes — because
   * only one of them is ever up, and the toolbar under it counts as another.
   *
   * A count and not a flag: the hook keeps one history entry per layer, pushed
   * as each opens. See `useBackDismiss` for why it must be that way round.
   */
  const layerDepth = (chromeShown ? 1 : 0) + (sheetOpen || searchOpen ? 1 : 0)

  useBackDismiss(layerDepth, dismissTopLayer)

  const toggleFocus = useCallback(() => {
    setFocusMode((on) => !on)
  }, [])

  // Saved here rather than inside the updater above. React is free to run a
  // state updater more than once, and a *write* in there ran twice flips the
  // stored setting back — it looked like the toggle simply didn't stick.
  // Writing the settled value is idempotent, so repeating it costs nothing.
  useEffect(() => {
    writeFocusMode(focusMode)
  }, [focusMode])

  /*
   * Focus Mode, told to the whole document.
   *
   * On `<html>` rather than on this page's own root, because what it changes —
   * the warm wash over the canvas — is a property of the surface the app is
   * drawn on, not of one component. `theme.css` holds what it does.
   *
   * Cleared when the reading page unmounts. The setting itself persists and
   * comes back with the next book; the *appearance* does not follow the reader
   * out to the library, where there would be no lamp to turn it off with.
   */
  useEffect(() => {
    const root = document.documentElement
    root.dataset.focus = focusMode ? 'on' : 'off'
    return () => {
      delete root.dataset.focus
    }
  }, [focusMode])

  /**
   * The same trick for the browse page.
   *
   * The status line is fixed to the screen and sits *above* the overlay on
   * purpose, so a full-screen list of chapters cannot cover it from inside the
   * overlay. It has to be told to stand down. See `theme.css`.
   */
  const browsing = sheetOpen && sheetTab !== 'aa'

  useEffect(() => {
    const root = document.documentElement
    root.dataset.browsing = browsing ? 'on' : 'off'
    return () => {
      delete root.dataset.browsing
    }
  }, [browsing])

  useEffect(() => {
    writeReaderSettings(settings)
  }, [settings])

  /**
   * Theme and reading font, applied to `<html>` rather than to the reader
   * screen alone — the same scope the existing dark-mode media query already
   * uses, so an explicit choice here behaves exactly like that one. Left in
   * place when the reader navigates away, like `focusMode`: it is a setting
   * about the app, not something that should revert on leaving the page.
   * `main.tsx` applies the same persisted value at boot, before this
   * component ever mounts — this effect is what keeps it live while the Aa
   * tab is open and being changed.
   */
  useEffect(() => {
    applyStoredTheme(settings)
  }, [settings])

  /**
   * Text size, line spacing and margins, scoped to this element and its
   * descendants only — unlike theme and font above, these three share their
   * underlying tokens (`--text-lg`, `--reading-measure`) with other pages, so
   * they're set as an inline override here rather than globally on `<html>`.
   * See `theme.css`'s `--reading-text-size` etc. for the defaults this
   * overrides.
   */
  const readingVars = useMemo(
    () =>
      ({
        '--reading-text-size': textSizeOf(settings.textStep),
        '--reading-leading': leadingOf(settings.spacing),
        '--reading-column-width': measureOf(settings.margins),
        '--reading-gutter': gutterOf(settings.margins),
      }) as unknown as React.CSSProperties,
    [settings.textStep, settings.spacing, settings.margins],
  )

  /**
   * Everything about the Aa tab that changes where the words fall.
   *
   * Theme is deliberately not in it: a colour changes nothing about the layout,
   * and re-landing the page on a colour change would be a visible jolt for
   * nothing.
   */
  const layoutKey = `${settings.textStep}|${settings.spacing}|${settings.margins}|${settings.font}`

  /** The layout the strip was last scrolled for. */
  const laidOutFor = useRef(layoutKey)

  /**
   * Stay on the same words when the text re-flows.
   *
   * This is the whole of a bug the reader hit by changing the margins: every
   * setting in the Aa tab re-flows the book, so the browser re-decides where
   * each page break falls — but the strip stays scrolled exactly where it was,
   * at a number of pixels that no longer lands on a column edge. What you get is
   * the tail of one page down the left of the screen and the next page running
   * off the right, which is precisely what the reader photographed.
   *
   * Re-landing on the paragraph they were reading fixes it, and does something
   * better than merely fixing it: making the text bigger now keeps you on the
   * same sentence rather than on the same page number, which is the only
   * behaviour that makes sense once the number of pages has changed underneath.
   *
   * `settleOn` re-checks itself over the next two frames, which is what covers
   * the re-flow still being in progress when this runs.
   *
   * Guarded on the key rather than on the dependency list, because `anchorHere`
   * is in that list and changes on every scroll — this must run when the
   * *layout* changed, not when reading moved.
   */
  useEffect(() => {
    if (laidOutFor.current === layoutKey) return
    laidOutFor.current = layoutKey
    if (page.status !== 'ready') return

    const anchor = anchorHere ?? page.section.paragraphs[0]?.anchor
    const node = anchor ? document.getElementById(elementIdOf(anchor)) : null
    if (node) settleOn(node)
  }, [layoutKey, page, anchorHere, settleOn])

  // The frame: book + manifest, once per book.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    void (async () => {
      try {
        const found = await repository.getBook(id)
        if (cancelled) return
        if (!found) {
          setFrame({ status: 'missing' })
          return
        }

        /*
         * A book behind the current parser is re-read *here*, before its
         * manifest is asked for — the manifest is what the old parse produced,
         * and reading it first would mean showing the old chapters and then
         * pulling them out from under the reader.
         *
         * This is the moment the wait buys something, and it costs no new UI:
         * `<Opening>` already holds a cover over the page until it is ready, so
         * a stale book simply takes a second or two longer to open. Ordinarily
         * there is nothing to do, because the background trickle has already
         * been through the shelf — see `app/bookCatchUp.ts`.
         */
        const book = (await catchUpOnOpen(found)) ?? found
        if (cancelled) return

        const manifest = await repository.getManifest(id)
        if (cancelled) return

        if (!manifest) {
          setFrame({ status: 'missing' })
          return
        }
        setFrame({ status: 'ready', book, manifest })
      } catch (error: unknown) {
        if (!cancelled) setFrame({ status: 'failed', message: messageOf(error) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  /**
   * Reopen where you left off.
   *
   * Runs once the manifest is in hand, because the manifest is what says
   * whether the saved chapter still exists — a book re-imported by a better
   * parser can genuinely have fewer chapters than the anchor expects.
   *
   * Every path through here ends at `setRestored(true)`, including the failures.
   * A position that can't be read is a reason to open at the beginning, never a
   * reason to leave the reader looking at "Opening…" forever.
   */
  useEffect(() => {
    if (!id || frame.status !== 'ready') return
    // The frame lags the URL by one render when moving straight from one book
    // to another, so without this the saved place of book B would be checked
    // against the chapters of book A.
    if (frame.book.id !== id) return
    let cancelled = false

    void (async () => {
      try {
        const saved = await repository.getPosition(id)
        if (cancelled) return

        const place = saved ? placeOf(saved.anchor, frame.manifest) : undefined
        if (place && saved) {
          pendingAnchor.current = place.anchor
          // The offset only means anything against the paragraph it was
          // measured on. `placeOf` may hand back a *different* anchor when the
          // saved one no longer exists — a book re-imported by a parser that
          // divides it differently — and carrying "eight pages in" over to
          // some other paragraph would turn a near miss into a wild one.
          pendingWithin.current = place.anchor === saved.anchor ? (saved.within ?? 0) : 0
          setHere(place.here)
          setResumed(!isFresh(saved.at))
        }
      } catch {
        // Opening at the start is a complete, working outcome. Nothing about a
        // convenience failing is worth an error over a book.
      } finally {
        if (!cancelled) setRestored(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, frame])

  // A different book starts the question again — otherwise the second book
  // opened in a session would skip the lookup and always start at chapter 1.
  useEffect(() => {
    setRestored(false)
    setResumed(false)
    pendingAnchor.current = undefined
    pendingWithin.current = 0
  }, [id])

  /**
   * The spine, and the one-shot migration that may be needed to build it.
   *
   * Separate from the frame effect above on purpose: the book must open at its
   * normal speed whether or not this succeeds. A book imported before word
   * counts existed pays a one-time whole-book read here — see
   * `repository.backfillWordCounts` — and if it fails, the reader loses the page
   * number and keeps everything else, which is why nothing here touches `frame`.
   */
  useEffect(() => {
    if (!id) return
    let cancelled = false

    setSpine(null)
    setChapterIndexes([])

    void (async () => {
      try {
        const backfilled = await repository.backfillWordCounts(id)
        if (cancelled) return

        const [manifest, chapterIndexes] = await Promise.all([
          backfilled ? Promise.resolve(backfilled) : repository.getManifest(id),
          repository.listChapterIndexes(id),
        ])
        if (cancelled || !manifest) return

        setSpine(buildSpine(manifest, chapterIndexes))
        // Kept, not discarded. These carry every section title in the book, and
        // the contents page lists them under their chapters — see
        // `contentsOutline`. They were already being loaded for the spine.
        setChapterIndexes(chapterIndexes)
      } catch {
        // Deliberately silent. The page number is a nicety; the overlay falls
        // back to "Chapter 5 of 12" by itself when the spine is null, and an
        // error toast over the book would cost more than the feature is worth.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  // The page: one section, plus what sits either side of it.
  useEffect(() => {
    if (!id || frame.status !== 'ready') return
    // Wait for the saved place. Fetching chapter 1 first would be a read thrown
    // away and a flash of the wrong page.
    if (!restored) return
    let cancelled = false

    setPage({ status: 'loading' })

    void (async () => {
      try {
        const section = await repository.getSection(id, pathOf(here))
        if (cancelled) return

        if (!section) {
          setPage({
            status: 'failed',
            message: 'That part of the book is missing. Try importing it again.',
          })
          return
        }

        setPage({ status: 'ready', section })

        const [previous, next] = await Promise.all([
          previousSection(here, sectionsIn),
          nextSection(frame.manifest, here, sectionsIn),
        ])
        if (cancelled) return
        setNeighbours({ previous, next })

        // And their text, for the sheet to be dragged over.
        //
        // Replaced in one go when it arrives, never cleared first. Clearing
        // empties two strips that are on screen — one of them possibly the very
        // page a finished turn is still resting on — and it throws away the
        // figure blobs with them, so the pictures on the live page are revoked
        // and fetched again for nothing. `for` is what keeps the old text
        // honest in the meantime: it names the page these two belong beside,
        // and `startSeamDrag` will not reveal them beside any other.
        const [before, after] = await Promise.all([
          previous ? repository.getSection(id, pathOf(previous)) : undefined,
          next ? repository.getSection(id, pathOf(next)) : undefined,
        ])
        if (!cancelled) {
          setBeside({
            for: pathOf(here),
            previous: before ?? undefined,
            next: after ?? undefined,
          })
        }
      } catch (error: unknown) {
        if (!cancelled) setPage({ status: 'failed', message: messageOf(error) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, frame, here, sectionsIn, restored])

  /**
   * Where a freshly loaded section puts you.
   *
   * A new section starts at its beginning — without that, moving on from
   * halfway down a long section drops you halfway down the next one. The
   * exception is a page asked for by the slider, which lands on the paragraph
   * that page begins at, and the saved place on opening.
   *
   * Guarded on the section's *path* rather than on the effect's dependencies.
   * The spine arrives a moment after the first section does, and re-running
   * this on that would scroll a reader who had already started reading back to
   * the top — most visibly the one who was just put back where they left off.
   */
  useEffect(() => {
    // A section that never arrives ends the turn rather than leaving it held.
    // The copy would otherwise sit over the error message, and the real page
    // number — hidden for the length of a turn, see `pageTurn.ts` — would stay
    // hidden with it, until the reader left the book.
    if (page.status === 'failed') {
      cancelTurn(held.current)
      held.current = null
      return
    }
    if (page.status !== 'ready') return
    if (landedOn.current === page.section.path) return
    landedOn.current = page.section.path

    // The real strip now holds the section the reader dragged into, so the
    // understudy that has been standing in for it can go. Done before the scroll
    // below rather than after: the two show the same page, and swapping while
    // they agree is the swap nobody can see.
    const crossed = holdSeam.current !== null
    if (holdSeam.current) {
      holdSeam.current.dataset.showing = 'false'
      holdSeam.current = null
      if (strip.current) strip.current.style.visibility = ''
    }

    const wanted = pendingPage.current
    const saved = pendingAnchor.current
    const within = pendingWithin.current
    pendingPage.current = undefined
    pendingAnchor.current = undefined
    pendingWithin.current = 0

    const asked =
      saved ??
      (wanted !== undefined && spine
        ? anchorAtPage(spine, here, page.section, wanted)
        : undefined)

    // A saved anchor can name a paragraph this section no longer has, if the
    // book was re-imported by a parser that divides it differently. The right
    // section's first page is a fair answer; landing nowhere at all is not.
    const target = asked ? document.getElementById(elementIdOf(asked)) : null
    const end = landOn.current === 'end'
    landOn.current = 'start'

    // Taken now, played last. The two pages may only start crossing once the
    // arriving one is both on screen and scrolled to where it belongs —
    // animating first would slide in a page that then jumps under the reader.
    const turn = held.current
    held.current = null

    // Every way of arriving in a new section that *isn't* a page turn — a link,
    // the contents list, the slider crossing a boundary — is a jump, and gets
    // the jump's fade at the same duration. Except the very first section of
    // all: opening the book has its own entrance, and two at once is a flicker.
    //
    // A seam turn is a *turn*, and `crossed` is how this knows. The sheet has
    // already curled over and landed by the time the section loads, so the fade
    // arrives after the movement is finished and over the page the reader is
    // already reading — which is the flash they reported, and the text
    // apparently changing weight as its opacity climbed back to 1.
    const arriving = () => {
      if (turn) playFlip(turn, strip.current)
      else if (landedBefore.current && !crossed) fadeIn(strip.current)
      landedBefore.current = true
    }

    if (asked && target) {
      settleOn(target, within)
      setAnchorHere(asked)
      arriving()
      return
    }

    // Turning *back* into a section lands on its last page, not its first —
    // otherwise going back a page and forward again arrives somewhere the
    // reader has never been.
    showPage(end ? pageCountOf(measure(strip.current)) : 1, true)
    setAnchorHere(
      end
        ? page.section.paragraphs[page.section.paragraphs.length - 1]?.anchor
        : page.section.paragraphs[0]?.anchor,
    )
    arriving()
  }, [page, here, spine, showPage, settleOn])

  // A held page must never outlive the screen it was copied from — leaving the
  // book mid-turn would otherwise leave the copy in the document. The same is
  // true of a sheet still under a thumb: closing the book with a page half
  // turned has to take the sheet, its shadow and its running frame with it.
  useEffect(() => {
    return () => {
      cancelTurn(held.current)
      held.current = null
      dropDrag(drag.current)
      drag.current = null
    }
  }, [])

  /**
   * Keep the page number honest while you read.
   *
   * Two ways of asking the same question, because there are two layouts. With
   * columns the strip scrolls sideways and the answer is "the first paragraph
   * on the visible column"; while a section is still being laid out — and under
   * jsdom, which never lays anything out — there are no columns and the answer
   * is the vertical one, the last paragraph past the reading line.
   *
   * Throttled to one frame either way: scroll fires far faster than this needs
   * answering, and reading a rectangle per paragraph per event is how a reading
   * screen starts to feel sticky under a thumb.
   */
  useEffect(() => {
    if (page.status !== 'ready') return

    const anchors = page.section.paragraphs.map((paragraph) => paragraph.anchor)
    const element = strip.current
    let frame = 0

    const update = () => {
      const { pageWidth } = measure(element)

      const showing = pageAt(measure(element))

      if (pageWidth > 0 && element) {
        // The paragraph the visible page *starts in* — the last one to have
        // begun on this column or an earlier one, not the first one to begin on
        // this column or a later one.
        //
        // The difference is the whole of the "Back to page 250 moved my place"
        // bug. A page very often opens mid-paragraph: the paragraph began on
        // the previous column and spills onto this one. Asking for the first
        // anchor at or after this column skips it and names the *next*
        // paragraph, which starts further down — so the place written down is a
        // paragraph or two ahead of where the reader is looking, and coming
        // back scrolls to it and lands them past where they left.
        let found: Anchor | undefined
        let foundColumn = 1
        let after: Anchor | undefined
        for (const anchor of anchors) {
          const node = document.getElementById(elementIdOf(anchor))
          if (!node) continue

          const column = columnOf(node, element)
          if (column <= showing) {
            found = anchor
            foundColumn = column
          } else {
            after = anchor
            break
          }
        }
        // The fallback covers the one case the rule above can't: a page whose
        // every paragraph begins later, which is what a section's opening page
        // looks like before anything has been laid out.
        const settled = found ?? after
        if (settled) {
          setAnchorHere(settled)
          // The other half of the answer, and it has to be recorded here or not
          // at all: this is the only place that knows both which column is
          // showing and which column the named paragraph began on.
          //
          // It is also what makes a long paragraph save at all. The write below
          // is debounced on `anchorHere`, so before this existed, scrolling
          // forty pages through one unbroken closing paragraph changed nothing
          // the effect could see and nothing was written down — the place
          // stayed wherever the paragraph was first entered.
          setWithinHere(found ? Math.max(0, showing - foundColumn) : 0)
        }
        return
      }

      const found = anchorOnScreen(anchors)
      if (found) {
        setAnchorHere(found)
        // No columns to be offset within — this is the vertical fallback, used
        // while a section is still being laid out and under jsdom.
        setWithinHere(0)
      }
    }

    const onScroll = () => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }

    // Once immediately: a freshly laid-out section has to name the paragraph on
    // screen before anything has scrolled, or the page number starts out wrong.
    update()

    element?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element?.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [page])

  /**
   * Write down where reading got to.
   *
   * Debounced by the cleanup: each new paragraph cancels the pending write, so
   * a long scroll costs one write at the end rather than one per paragraph.
   *
   * Gated on `restored` for a reason that isn't obvious — before the lookup has
   * finished, `anchorHere` is still the top of chapter 1, and saving that would
   * overwrite the very position being fetched.
   */
  useEffect(() => {
    if (!id || !restored || !anchorHere) return
    // Read once per effect run rather than put in the dependency array as
    // `pages` itself — that object is rebuilt every render, which would reset
    // this debounce on every scroll frame instead of once per paragraph.
    const percent = pages?.percent

    const timer = window.setTimeout(() => {
      // `withinHere` is the other half of the place: `anchorHere` is the
      // paragraph the visible page *begins in* — deliberate, see the long note
      // in the scroll listener — and a paragraph running over several columns
      // starts pages before the one being read. Reopening on its first column
      // is pages short, most visibly at the end of a book, where the last page
      // sits deep inside a long closing paragraph.
      //
      // `undefined` for `at` takes the default, which is now — only the offline
      // queue ever passes a time of its own.
      const saved = repository
        .savePosition(id, anchorHere, percent, undefined, withinHere)
        .catch(() => {
          // Losing a place is a small loss; interrupting reading to report it
          // would be a larger one. The next paragraph tries again anyway.
        })

      // The end of the book, which is a different kind of fact from where the
      // reader is: it happens once and it is dated. `markFinished` ignores a
      // book that already has a date, so reaching the last page again on a
      // re-read changes nothing. Failure is survivable too — the position that
      // proves it is queued, and the next launch backfills from that.
      const dated =
        percent === 100 ? repository.markFinished(id).catch(() => {}) : Promise.resolve()

      // This write is what moves the book to another shelf — out of Unread and
      // into Current Reading, or on to Finished. Told now, while there is still
      // a book on screen, the shelves rearrange themselves out of sight and the
      // reader closes the book onto a shelf that is simply already right. See
      // `app/shelvesAhead.ts`; both promises are settled first so the rebuild
      // reads the facts this save just wrote, not the ones before it.
      void Promise.all([saved, dated]).then(() => {
        noteReading(id, percent)
      })
    }, SAVE_AFTER_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [id, restored, anchorHere, withinHere, pages?.percent])

  /*
   * ## Bookmarks (WP-14)
   *
   * Loaded once per book, then kept in step by hand as the reader adds and
   * removes them. The list belongs to the book, not to the section on screen —
   * marks in chapter 12 have to be listed while chapter 2 is open, which is the
   * whole point of a bookmark list.
   */
  useEffect(() => {
    if (!id) return
    let cancelled = false

    void repository
      .listBookmarks(id)
      .then((rows) => {
        // A different book may have been opened while this was in flight.
        if (!cancelled) setBookmarks(rows)
      })
      .catch(() => {
        // An empty list is the honest fallback: the sheet then says there are
        // no bookmarks, and marking a page still works.
      })

    return () => {
      cancelled = true
    }
  }, [id])

  /**
   * The paragraph a bookmark would be put on.
   *
   * `anchorHere` is only set once a paint has settled and the top of the page
   * has been worked out. Until then it is `undefined` — and a reader who opens a
   * book and immediately taps the ribbon is exactly the case that hits, because
   * they have not scrolled yet. Without the fallback the ribbon silently does
   * nothing on the page a reader is most likely to want to mark: the one they
   * just opened to.
   *
   * The first paragraph of the loaded section is the honest answer there, and
   * it is the same fallback `jumpToAnchor` uses for the same reason.
   *
   * `anchorHere` is also **discarded when it belongs to a different section**,
   * which is a narrow window with a real cost. Moving to a new section loads it
   * and paints it before the settle that works out what is now at the top, so
   * for those few frames `anchorHere` still names a paragraph in the section
   * just left. Marking then would file the bookmark in the wrong chapter — and
   * the ribbon, recomputing a moment later, would flip back to unmarked as if
   * the tap had been ignored. Checking that the anchor is in the section on
   * screen costs one parse and closes the window entirely.
   */
  const anchorToMark = useMemo(() => {
    if (page.status !== 'ready') return undefined
    const first = page.section.paragraphs[0]?.anchor
    if (!anchorHere) return first

    const parts = tryParseAnchor(anchorHere)
    const belongsHere = parts?.chapter === here.chapter && parts.section === here.section
    return belongsHere ? anchorHere : first
  }, [anchorHere, page, here])

  /** The mark on the paragraph at the top of the screen, if there is one. */
  const bookmarkHere = bookmarkOn(bookmarks, anchorToMark)

  /**
   * Mark this page, or unmark it.
   *
   * The label comes from the paragraph being marked, which is why this needs the
   * loaded section rather than just the anchor — see `labelFor`. A reader can
   * rename it afterwards from the sheet; naming it up front would put a dialog
   * between them and a one-tap action they will mostly use without thinking.
   */
  const toggleBookmark = useCallback(() => {
    if (!id || !anchorToMark) return

    if (bookmarkHere) {
      const removed = bookmarkHere.id
      setBookmarks((rows) => rows.filter((row) => row.id !== removed))
      void repository.deleteBookmark(id, removed).catch(() => {
        // It will come back on the next open. Better than an error over a book.
      })
      return
    }

    const text =
      page.status === 'ready'
        ? (page.section.paragraphs.find((paragraph) => paragraph.anchor === anchorToMark)?.text ??
          '')
        : ''

    void repository
      .addBookmark(id, anchorToMark, labelFor(text))
      .then((made) => setBookmarks((rows) => [...rows, made]))
      .catch(() => {})
  }, [id, anchorToMark, bookmarkHere, page])

  const renameBookmark = useCallback(
    (bookmarkId: string, label: string) => {
      if (!id) return
      // An empty name is not a name. A reader who clears the field is asking for
      // the default back, not for a blank row — and the paragraph's opening
      // words are what the default has always been.
      const existing = bookmarks.find((row) => row.id === bookmarkId)
      if (!existing) return
      const named = label.trim() === '' ? labelFor(existing.label) : label.trim()

      setBookmarks((rows) =>
        rows.map((row) => (row.id === bookmarkId ? { ...row, label: named } : row)),
      )
      void repository.renameBookmark(id, bookmarkId, named).catch(() => {})
    },
    [id, bookmarks],
  )

  const deleteBookmark = useCallback(
    (bookmarkId: string) => {
      if (!id) return
      setBookmarks((rows) => rows.filter((row) => row.id !== bookmarkId))
      void repository.deleteBookmark(id, bookmarkId).catch(() => {})
    },
    [id],
  )

  /**
   * The marks as the sheet wants them: in the book's order, each carrying the
   * chapter it falls in so the list can put a heading above each run.
   *
   * A mark whose anchor no longer parses keeps the chapter it is filed under at
   * 0 and the book's title as its heading — it is still the reader's mark, and
   * `inBookOrder` has already put it at the end where it can't interleave.
   */
  const bookmarkRows: BookmarkRow[] = useMemo(() => {
    if (frame.status !== 'ready') return []
    return inBookOrder(bookmarks).map((row) => {
      const parts = tryParseAnchor(row.anchor)
      const chapter = parts?.chapter ?? 0
      return {
        id: row.id,
        anchor: row.anchor,
        label: row.label,
        chapter,
        chapterTitle: chapterTitle(frame.manifest, chapter) ?? 'Elsewhere',
        page: pageOfAnchor(parts),
        savedAt: row.addedAt,
      }
    })
  }, [bookmarks, frame, pageOfAnchor])

  /*
   * ## Notes (WP-25, ahead of the tutor)
   *
   * Loaded once per book, exactly as the marks are, and for the same reason:
   * the list belongs to the book, not to the section on screen.
   *
   * They come from `noteStore` rather than `repository` — see
   * `storage/notes.ts` for why the cloud backend does not carry them yet.
   */
  useEffect(() => {
    if (!id) return
    let cancelled = false

    void noteStore
      .listNotes(id)
      .then((rows) => {
        if (!cancelled) setNotes(rows)
      })
      .catch(() => {
        // An empty page is the honest fallback. Reading carries on regardless.
      })

    return () => {
      cancelled = true
    }
  }, [id])

  /** The notes as the panel wants them: in the book's order, placed and named. */
  const noteRows: NoteRow[] = useMemo(() => {
    if (frame.status !== 'ready') return []
    return inNoteOrder(notes).map((row) => {
      const parts = tryParseAnchor(row.anchor)
      const chapter = parts?.chapter ?? 0
      return {
        id: row.id,
        anchor: row.anchor,
        author: row.author,
        text: row.text,
        chapter,
        chapterTitle: chapterTitle(frame.manifest, chapter) ?? 'Elsewhere',
        page: pageOfAnchor(parts),
        createdAt: row.createdAt,
        colour: row.colour,
      }
    })
  }, [notes, frame, pageOfAnchor])

  /**
   * The notes that are also marks on the page: the ones with words and a colour.
   *
   * A note without a colour is a note the reader wrote; only a highlight asks to
   * be painted back onto the paragraph it came from.
   */
  const highlights = useMemo(
    () => notes.filter((row) => row.quote && row.colour),
    [notes],
  )

  /*
   * ## In-book search (WP-14)
   *
   * Three moving parts, and the reason they are separate is that they change at
   * three different rates: what the reader has typed (every keystroke), the
   * book's text (once, and expensively), and the answer (a moment after typing
   * stops).
   */

  /**
   * The whole book's prose, fetched the first time search is opened and kept for
   * the life of the screen.
   *
   * A ref rather than state: nothing renders it, and putting a book's entire
   * text in state would re-render the reading screen when it arrived. `null`
   * means "not fetched yet", which the panel shows as *Looking…* rather than as
   * *Nothing found* — the difference between a slow answer and a wrong one.
   *
   * Not fetched on open, deliberately. A reader who never searches never pays
   * for it, and the cost is the one call in the repository that loads every
   * section of a book at once.
   */
  const bookText = useRef<Section[] | null>(null)
  const [textLoaded, setTextLoaded] = useState(false)

  const [query, setQuery] = useState('')
  /**
   * The query the results below actually answer.
   *
   * Held apart from `query` so the field stays responsive while the scan is
   * debounced — typing "breath" would otherwise scan the book six times, five of
   * them for prefixes nobody asked about.
   */
  const [settledQuery, setSettledQuery] = useState('')

  useEffect(() => {
    if (!searchOpen || !id || bookText.current !== null) return
    let cancelled = false

    void repository
      .listSections(id)
      .then((sections) => {
        if (cancelled) return
        bookText.current = sections
        // Only to wake the render that reads the ref — the text itself is not
        // state, but "it has arrived" has to be.
        setTextLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          bookText.current = []
          setTextLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [searchOpen, id])

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query), SEARCH_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [query])

  /**
   * The answer, or `null` while the book's text is still on its way.
   *
   * Recomputed only when the settled query or the loaded text changes — not on
   * every keystroke, and not on every page turn, which is why it is a memo and
   * not a plain call in the render body.
   */
  const results = useMemo(() => {
    if (!searchOpen) return null
    // `textLoaded` is read so this recomputes when the prose lands; the text
    // itself lives in a ref and would not trigger anything on its own.
    if (!textLoaded || bookText.current === null) return null
    return searchBook(bookText.current, settledQuery)
  }, [searchOpen, textLoaded, settledQuery])

  /** Going to a result closes the panel — the reader asked to be taken there. */
  const jumpToHit = useCallback(
    (anchor: Anchor) => {
      setSearchOpen(false)
      jumpToAnchor(anchor)
    },
    [jumpToAnchor],
  )

  /*
   * The selection menu.
   *
   * Two states, not one. `selected` is the words the reader is holding, and it
   * is dropped the moment the selection goes; `composing` is the note being
   * written *about* those words, and it has to outlive them — opening a text
   * box takes the selection away, and the note would lose the sentence it is
   * about halfway through being written.
   */
  const [selected, setSelected] = useState<ReaderSelection | null>(null)
  const [composing, setComposing] = useState<ReaderSelection | null>(null)

  /**
   * The one-line "not built yet" note.
   *
   * Define, Translate and the four Ask Claude actions all need something this
   * app does not have — a dictionary, a translator, and the tutor loop itself
   * (WP-17 onward). The menu still lists them, because the menu is the design
   * and hiding half of it would settle a question that is not settled. Tapping
   * one says so plainly instead of doing nothing.
   */
  const [unbuilt, setUnbuilt] = useState<string | null>(null)

  useEffect(() => {
    if (!unbuilt) return
    const timer = window.setTimeout(() => setUnbuilt(null), 2600)
    return () => window.clearTimeout(timer)
  }, [unbuilt])

  useEffect(() => {
    /*
     * Read on `pointerup`, not on `selectionchange`: the latter fires for every
     * character as a handle is dragged, and a card that follows the drag covers
     * the words being chosen. Until the finger is off, the reader is still
     * choosing.
     *
     * Then the selection is *let go*. A browser shows its own text menu the
     * moment a selection exists, and there is no way to ask it not to.
     * Dropping the selection takes that menu away, and the words are drawn
     * again by `SelectionMenu` so nothing looks lost.
     *
     * The browser's drag handles go with it, so the app draws its own — see
     * `stretchSelection` and the handles in `SelectionMenu`.
     *
     * On a touch screen none of this runs any more: `.page` turns selection
     * off there, so the phone never holds one, and the long-press listener
     * below chooses the first word instead. That closed the last gap — the
     * menu used to flash in the moment between the phone selecting and this
     * code dropping it. What is left here is the mouse path.
     */
    const capture = () => {
      const found = selectionInReader(strip.current)
      if (!found) return
      setSelected(found)
      window.getSelection()?.removeAllRanges()
    }

    /*
     * Why `selectionchange` as well as `pointerup`.
     *
     * A long press on Android is how a phone selects a word, and the gesture is
     * taken over by the system's own selection UI — the release never reaches
     * the page as a `pointerup`. So the first selection of a reading session
     * raised the phone's menu and not ours, and only a later stray tap, which
     * *did* deliver a `pointerup`, brought ours up over a selection made a
     * minute earlier. That was the whole of the report.
     *
     * `selectionchange` always fires. It fires on every character too, so the
     * capture waits for it to go quiet, and waits again while a finger is still
     * down — a reader dragging a handle has not finished choosing.
     */
    let timer = 0
    const holding = { down: false }

    const settle = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (holding.down) {
          settle()
          return
        }
        capture()
      }, 300)
    }

    const onDown = () => {
      holding.down = true
    }
    const onUp = () => {
      holding.down = false
      capture()
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    document.addEventListener('selectionchange', settle)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.removeEventListener('selectionchange', settle)
    }
  }, [])

  /**
   * Choose a word by long press, without the phone choosing it.
   *
   * ## Why this exists at all
   *
   * A phone selects a word on long press, and the moment it holds a selection
   * it raises its own text menu. Nothing on the page can stop it. The effect
   * above answered that by taking the selection away once it had read it, and
   * the menu went with it — but the reader still saw it flash first, and on a
   * slow frame the flash was long enough to read.
   *
   * So on a touch screen the app does not let the phone select anything at all:
   * `.page` turns selection off there (`Reader.module.css`), and this listener
   * finds the word under the finger itself. Everything after the first word was
   * already the app's own — its own highlight, its own handles, its own menu —
   * so this is the last piece that was borrowed.
   *
   * A mouse keeps the browser's own selection. Dragging across text is how a
   * desktop selects, there is no menu to hide there, and taking it away would
   * cost something for nothing.
   *
   * ## Why it is not simply a timer
   *
   * The same press that chooses a word is also the start of a page turn, so the
   * two have to be told apart. A finger that has moved more than `WANDER` is
   * turning a page and never chooses; a finger that has held still for `HOLD`
   * is choosing and never turns, which the drag reads back through `held`.
   */
  useEffect(() => {
    const page = strip.current
    if (!page || typeof window === 'undefined') return
    // Coarse pointers only. See above.
    if (!window.matchMedia?.('(pointer: coarse)').matches) return

    /** How long a finger must hold still to mean "this word". */
    const HOLD = 420
    /** How far it may drift and still be holding still, in pixels. */
    const WANDER = 10

    let timer = 0
    let from: { x: number; y: number } | null = null

    const stop = () => {
      window.clearTimeout(timer)
      timer = 0
      from = null
    }

    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === 'mouse') return
      from = { x: event.clientX, y: event.clientY }
      timer = window.setTimeout(() => {
        if (!from) return
        const found = wordAt(from.x, from.y, strip.current)
        stop()
        if (!found) return
        // The turn must not also happen. A finger that has chosen a word is not
        // a finger that is turning the page, and both the threshold swipe and
        // the dragged sheet read the gesture back through `touchStart`.
        touchStart.current = null
        setSelected(found)
      }, HOLD)
    }

    const onMove = (event: PointerEvent) => {
      if (!from) return
      if (Math.abs(event.clientX - from.x) > WANDER || Math.abs(event.clientY - from.y) > WANDER) {
        stop()
      }
    }

    page.addEventListener('pointerdown', onDown)
    page.addEventListener('pointermove', onMove)
    page.addEventListener('pointerup', stop)
    page.addEventListener('pointercancel', stop)
    return () => {
      stop()
      page.removeEventListener('pointerdown', onDown)
      page.removeEventListener('pointermove', onMove)
      page.removeEventListener('pointerup', stop)
      page.removeEventListener('pointercancel', stop)
    }
  }, [])

  /**
   * The tap that put the menu away, remembered for one beat.
   *
   * A tap outside the menu closes it on `pointerdown`, and the `click` that
   * follows lands on the page — which would raise the toolbar in the same
   * gesture. This is what tells that click it has already done its job.
   */
  const dismissed = useRef(false)

  /**
   * A handle dragged to a point. Keep what we had if it lands off the text.
   *
   * The app owns the selection now, so stretching it is arithmetic on a range
   * rather than anything the browser does for us.
   */
  /**
   * While our menu is up, the phone's own menu stays down.
   *
   * `capture` lets the selection go once, and that is enough for the ordinary
   * path. It is not enough for every path: a long press that the system handles
   * itself can put the selection back after we have dropped it, and the phone
   * draws its Copy / Share / Select all bar over the top of ours. There is no
   * way to ask it not to, so the answer is the same one, kept up: as long as the
   * menu is open, a live selection is let go the moment it appears.
   *
   * Safe because nothing in the reader reads the live selection while the menu
   * is open — the words are held in `selected`, and dragging a handle asks the
   * page where the finger is, not what is selected.
   */
  useEffect(() => {
    if (!selected) return

    const letGo = () => {
      const live = window.getSelection()
      if (live && !live.isCollapsed) live.removeAllRanges()
    }

    letGo()
    document.addEventListener('selectionchange', letGo)
    return () => document.removeEventListener('selectionchange', letGo)
  }, [selected])

  /*
   * The selection is measured again when the page under it moves.
   *
   * A selection can start on one page and end on the next, and the reader has to
   * be able to turn to the far end of it — to reach the chevron there, or simply
   * to read what they picked. The words themselves are safe: `selected.range`
   * points into the page, so a turn moves it with the text. What goes stale is
   * everything drawn from it, because the marks, the two handles and the card are
   * placed in screen coordinates, and after the turn those describe the page the
   * reader has just left.
   *
   * The range object itself cannot be trusted across a turn. The strip holds only
   * a few paragraphs at a time, and a turn takes some of them out. A DOM range
   * whose end node is removed does not fail — it quietly re-points to the end of
   * the container, and the selection then runs to the foot of the page and
   * swallows every paragraph after the one the reader chose.
   *
   * So the words are found again from what does not move: the words themselves,
   * looked up across the page, with the anchor as a tie-breaker.
   *
   * The trigger is the movement itself, watched frame by frame. Two likelier
   * triggers were tried first and neither one fires:
   *
   *  - The page *number*. It is worked out from the reading position, and it can
   *    hold still across a move the reader plainly sees.
   *  - The strip's `scroll` event. The strip carries `overflow: hidden`, and an
   *    element that does not scroll for the user raises no scroll event when its
   *    `scrollLeft` is set. Measured in the page: zero events for a move of 200
   *    pixels that carried the words with it.
   *
   * So nothing is trusted to announce the turn. The paragraph the selection
   * starts in is asked where it is, once a frame, and the selection is measured
   * again when the answer changes. This holds for every way a page can move — a
   * swipe, an edge tap, a link, a sheet landing at the end of its flight — because
   * it watches the thing all of them have in common.
   *
   * One rect read per frame, and only while something is selected. A rect read on
   * a clean layout costs about a tenth of a millisecond; nothing is written here,
   * so the layout stays clean and it never turns into the thrash that made the
   * highlight painter slow.
   */
  /**
   * How often the page under a live selection is asked whether it has moved, in
   * milliseconds. One rect read, and only while something is selected.
   */
  const WATCH = 80

  /** Whether two measured sets of line boxes describe the same place on screen. */
  const same = (
    a: readonly { top: number; left: number; width: number; height: number }[],
    b: readonly { top: number; left: number; width: number; height: number }[],
  ) =>
    a.length === b.length &&
    a.every((box, i) => {
      const was = b[i]!
      return (
        Math.abs(box.top - was.top) < 0.5 &&
        Math.abs(box.left - was.left) < 0.5 &&
        Math.abs(box.width - was.width) < 0.5 &&
        Math.abs(box.height - was.height) < 0.5
      )
    })

  useEffect(() => {
    const root = strip.current
    if (!selected || !root) return

    const remeasure = () => {
      setSelected((at) => {
        if (!at) return at
        // The browser's own selection is let go at the first turn. It is a thing
        // the engine may scroll back into view whenever the strip is touched, and
        // a reader who turns a page and lands somewhere else has met exactly that.
        // Nothing here needs it: the marks are drawn by the app, the handles work
        // from coordinates, and the text was taken when the selection was made.
        window.getSelection()?.removeAllRanges()
        const fresh = rangeOfSelection(root, at.text, at.anchor)
        const now = fresh ? describeRange(fresh, root) : null
        if (!now) {
          setUnit(null)
          return null
        }
        // The same answer must not become a new object, or this would set state
        // on every scroll and re-place the card for nothing.
        return same(now.rects, at.rects) ? at : now
      })
    }

    // The paragraph the selection starts in is the witness. It is one element,
    // it is on the page whenever the selection is, and it moves with the page.
    const home = root.querySelector(`[id="${selected.anchor.replace(/[[\]]/g, '')}"]`)
    if (!home) return

    let last = home.getBoundingClientRect()

    const watch = () => {
      const now = home.getBoundingClientRect()
      if (Math.abs(now.left - last.left) < 0.5 && Math.abs(now.top - last.top) < 0.5) return
      // Not while a sheet is in the air. Looking the words up walks the whole
      // page, which is not work for a turn that is still drawing, and the answer
      // would be stale again a moment later. The marks and the card are hidden for
      // exactly this stretch, so nothing is seen out of place.
      if (document.querySelector('[data-page-sheet]')) return
      last = now
      remeasure()
    }

    /*
     * A timer, not `requestAnimationFrame`.
     *
     * A frame callback is the tidier tool and it is the wrong one here: it is not
     * called at all while the page is not being drawn — a backgrounded tab, a
     * phone with the screen off, a window behind another. The watch would then be
     * asleep at the moment the reader comes back, and the selection would be
     * standing in the old place again. A timer keeps running.
     *
     * `WATCH` is well under the length of a turn, so the marks and the card are
     * already in the right place by the time the sheet lifts and they are shown.
     */
    const timer = window.setInterval(watch, WATCH)
    return () => window.clearInterval(timer)
    // Keyed on the anchor, not on the whole selection: the watch has to be rebuilt
    // when the selection moves to another paragraph, and not once per re-measure —
    // which is what depending on the object itself would do.
  }, [selected?.anchor])

  const stretchSelection = useCallback((pivot: SelectionPivot, x: number, y: number) => {
    setSelected((at) => (at ? (selectionBetween(pivot, x, y, strip.current) ?? at) : at))
  }, [])

  /**
   * The reading column as a *value*, so the highlights can react to it.
   *
   * `strip` is a ref, and a ref changing tells React nothing. A callback ref
   * rather than a mount effect: the article is not on screen while the book is
   * still loading, so on the first render there is nothing to read. This fires
   * the moment the element does arrive, and again if it is ever replaced.
   */
  const [column, setColumn] = useState<HTMLElement | null>(null)
  const holdStrip = useCallback((element: HTMLElement | null) => {
    strip.current = element
    setColumn(element)
  }, [])

  /*
   * The same, for the two understudies — because they are read pages too.
   *
   * A turn at a section seam does not copy the strip: it brings the understudy
   * out and turns *that*. So a highlight on the first page of the next section
   * was painted on the real strip, which was not what the reader was looking at,
   * and the colour only appeared once the turn finished and the section loaded.
   * That was the fault reported over and over. Every page a reader can see needs
   * its own ink.
   */
  const [beforeColumn, setBeforeColumn] = useState<HTMLElement | null>(null)
  const holdBefore = useCallback((element: HTMLElement | null) => {
    beforeStrip.current = element
    setBeforeColumn(element)
  }, [])
  const [afterColumn, setAfterColumn] = useState<HTMLElement | null>(null)
  const holdAfter = useCallback((element: HTMLElement | null) => {
    afterStrip.current = element
    setAfterColumn(element)
  }, [])

  /**
   * A tap on a highlight opens the menu over it.
   *
   * Before this, that tap fell through to the page and showed the overlay — the
   * reader was asking about the words they had marked and got a page slider.
   *
   * The browser paints highlights as ink now, not as elements, so there is
   * nothing under the finger to receive the tap. `highlightAt` works backwards
   * from the point instead. Returns whether it caught the tap.
   */
  const pickHighlight = useCallback(
    (x: number, y: number) => {
      const hit = highlightAt(x, y, highlights)
      if (!hit) return false

      const found = describeRange(hit.range, strip.current)
      if (!found) return false

      setSelected(found)
      return true
    },
    [highlights],
  )

  /**
   * The highlight the open menu is sitting on, if it is sitting on one.
   *
   * Worked out from the words rather than remembered, so it is right however
   * the selection was made: tapped on the highlight, or selected by hand over
   * the same sentence. It is what turns a second highlight of one passage into
   * a recolour of the first, and what puts "Remove" in the menu.
   */
  const touched = useMemo(() => {
    if (!selected) return null
    const found = highlights.find(
      (row) => row.anchor === selected.anchor && row.quote === selected.text,
    )
    return found ? { id: found.id, colour: found.colour ?? '' } : null
  }, [selected, highlights])

  /**
   * The unit the selection is snapped to, once the reader has asked for one.
   *
   * Off until Sentence or Paragraph is tapped, and off again the moment the
   * selection is dismissed. It is what turns the two drag handles into chevrons,
   * and what decides how big a step each chevron takes.
   */
  const [unit, setUnit] = useState<SelectionGrain | null>(null)

  /**
   * Whether each chevron has another unit to take.
   *
   * Asked once per selection, not once per render: it reads every paragraph on
   * the page and cuts them into sentences, which is not work to repeat while a
   * handle is under a finger. A chevron with nowhere to go is not drawn at all.
   */
  const canGrow = useMemo(() => {
    if (!selected || !unit) return { start: false, end: false }
    return {
      start: unitBeyond(selected.range, unit, 'start', strip.current) !== null,
      end: unitBeyond(selected.range, unit, 'end', strip.current) !== null,
    }
  }, [selected, unit])

  /** One more unit at one end. The menu stays open; the reader is still aiming. */
  const growSelection = useCallback(
    (side: 'start' | 'end') => {
      if (!selected || !unit) return
      const wider = unitBeyond(selected.range, unit, side, strip.current)
      if (!wider) return
      const grown = describeRange(wider, strip.current)
      if (grown) setSelected(grown)
    },
    [selected, unit],
  )

  /** Put the menu away and let go of the words. */
  const dropSelection = useCallback(() => {
    setSelected(null)
    setUnit(null)
    dismissed.current = true
    window.getSelection()?.removeAllRanges()
  }, [])

  /** Write a note or a highlight against the selection, and show it at once. */
  const keepNote = useCallback(
    async (note: { text: string; quote: string; anchor: Anchor; colour?: string }) => {
      if (!id) return
      const row = await noteStore.addNote(id, {
        anchor: note.anchor,
        author: 'you',
        text: note.text,
        quote: note.quote,
        colour: note.colour,
      })
      setNotes((rows) => [...rows, row])
    },
    [id],
  )

  /** Change the colour of a highlight already on the page. */
  const recolour = useCallback(
    (noteId: string, colour: string) => {
      if (!id) return
      void noteStore.setNoteColour(id, noteId, colour)
      setNotes((rows) => rows.map((row) => (row.id === noteId ? { ...row, colour } : row)))
    },
    [id],
  )

  /** Take a highlight off the page, and its row out of Quotes with it. */
  const dropNote = useCallback(
    (noteId: string) => {
      if (!id) return
      void noteStore.deleteNote(id, noteId)
      setNotes((rows) => rows.filter((row) => row.id !== noteId))
    },
    [id],
  )

  const onSelectionAction = useCallback(
    (action: SelectionAction) => {
      const at = selected
      if (!at) return

      switch (action.kind) {
        case 'highlight':
          if (touched) {
            // Already highlighted: this is a change of colour, not a second
            // highlight. Without this the same sentence could be marked over
            // and over, once per tap, each one its own row under Quotes.
            recolour(touched.id, action.colour)
          } else {
            // The text *is* the highlight: the Quotes tab lists the book's own
            // words, and the colour rides along beside them.
            void keepNote({
              text: at.text,
              quote: at.text,
              anchor: at.anchor,
              colour: action.colour,
            })
          }
          break

        case 'unhighlight':
          if (touched) dropNote(touched.id)
          break

        case 'select': {
          // The one action that leaves the menu open: the reader asked for more
          // words, not for something to happen to them.
          //
          // It also arms the chevrons. Tapping the *other* unit re-snaps what is
          // already selected to that unit, so a reader who grew three sentences
          // and then tapped Paragraph gets the paragraphs those sentences are
          // in — never less than they had.
          setUnit(action.grain)
          const wider = unitAround(at.range, action.grain, strip.current)
          const grown = wider ? describeRange(wider, strip.current) : null
          if (grown) setSelected(grown)
          return
        }

        case 'note':
          setComposing(at)
          break

        case 'copy':
          void navigator.clipboard?.writeText(at.text)
          break

        case 'save':
          if (id) void repository.addQuote(id, at.text)
          break

        case 'share':
          // A quotation, not the whole passage dressed up as a post — the share
          // sheet is the phone's, and what it is handed is one sentence.
          void navigator.share?.({ text: at.text }).catch(() => {})
          break

        case 'search':
          setQuery(at.text)
          openSearch()
          break

        case 'speak': {
          const speech = window.speechSynthesis
          if (speech) {
            speech.cancel()
            speech.speak(new SpeechSynthesisUtterance(at.text))
          }
          break
        }

        case 'define':
        case 'translate':
        case 'ask':
          // Nothing to open yet — see `unbuilt` above.
          setUnbuilt(
            action.kind === 'define'
              ? 'Define'
              : action.kind === 'translate'
                ? 'Translate'
                : 'Ask Claude',
          )
          break
      }

      if (action.kind !== 'note') dropSelection()
      else setSelected(null)
    },
    [selected, touched, keepNote, recolour, dropNote, id, openSearch, dropSelection],
  )

  const title =
    frame.status === 'ready' ? chapterTitle(frame.manifest, here.chapter) : undefined

  /** The same, for a chapter that is not the one on screen. */
  const titleOfChapter = (chapter: number) =>
    frame.status === 'ready' ? chapterTitle(frame.manifest, chapter) : undefined

  /**
   * One section's markup: its opening, then its paragraphs.
   *
   * Written once and used three times — the page on screen and the two
   * understudies either side of it — and that sharing carries weight rather than
   * saving typing. The strip's page breaks are decided by the browser from the
   * markup in the box, so an understudy built from *nearly* the same markup
   * breaks its pages in nearly the same places. The reader would drag onto a
   * page and then watch the text shift as the real section arrived. The chapter
   * opening is almost the whole of that risk: it is the tallest thing in a
   * section and it appears on the first one only.
   *
   * Figures were the hole in that. Their pictures used to be fetched for the
   * section on screen alone, so an understudy drew every figure at no height,
   * and a section with a picture in it broke its columns in the wrong places —
   * the reader landed and then watched the words drop. `shownParagraphs` now
   * fetches all three sections' pictures together, so the three strips agree.
   */
  const sectionBody = (section: Section, at: SectionRef, chapter?: string) => (
    <>
      {/*
        The chapter line only appears on a chapter's *first* section. Repeating
        "Part Three" over each of its nine sections would turn a title page into
        a running header.
      */}
      <header className={`${styles.header} ${at.section === 1 ? styles.opening : ''}`}>
        {/*
          A chapter's first section gets the designed opening — see
          `reader/ChapterOpening.tsx`. Which of the four settings it takes is the
          book's subject headings and the chapter's own title, decided in
          `reader/chapterHeading.ts`.

          Its own left alignment, so the header's centring does not fight the two
          settings that are set left.
        */}
        {at.section === 1 && (chapter || section.title) ? (
          <div className={styles.openingHeading}>
            <ChapterOpening
              chapterTitle={chapter}
              sectionTitle={section.title}
              subjects={frame.status === 'ready' ? frame.book.subjects : undefined}
            />
          </div>
        ) : chapterNumber(section.title) ? (
          /*
            A numbered section opens like a chapter, because it *is* one. Where a
            book is cut into parts, the part becomes the division and "Chapter 1"
            lands here as a section — the same words print gives a full opening
            to. Setting it as a plain line while the part above it got the
            numeral put the design on the wrong one.

            Only when the title carries a number: an unnumbered section is a
            subdivision, and a full opening on each would be relentless.
          */
          <div className={styles.openingHeading}>
            <ChapterOpening
              chapterTitle={section.title}
              subjects={frame.status === 'ready' ? frame.book.subjects : undefined}
            />
          </div>
        ) : (
          <>
            {section.title && <h2 className={styles.sectionTitle}>{section.title}</h2>}

            {/* A hairline instead of a blank gap: it says "the chapter starts
                below this" without spending a word on it. */}
            <span className={styles.openingRule} aria-hidden="true" />
          </>
        )}
      </header>

      {section.paragraphs.map((block) => (
        <Block
          key={block.anchor}
          block={block}
          onFollowLink={jumpToAnchor as FollowLink}
          images={figureImages}
        />
      ))}
    </>
  )

  return (
    /* `data-page-frame` marks the unscaled box a page turn measures itself
       against — see `FRAME` in `reader/pageTurn.ts`. */
    <div className={styles.reader} style={readingVars} data-page-frame="">
      {/* Only while there's no book to hang the overlay on — once there is,
          the overlay owns the way back. */}
      {frame.status !== 'ready' && (
        <Link to="/" className={styles.back}>
          ← Library
        </Link>
      )}

      {/*
        No "Opening…" any more. The two waits that word covered — the manifest,
        then the section — are both behind the cover below, and a line of text
        that appears and is replaced by another line of text is the flicker this
        screen keeps being reported for. What is left here is the silence Home
        already uses for the same moment.
      */}

      {/*
        The cover, held over everything until there is a page underneath.

        `book` prefers the loaded copy and falls back to what the shelves
        already knew, so the cover is drawn on this screen's *first* frame
        rather than after the first read returns — the read is exactly what the
        cover is standing in front of. See `app/shelvesAhead.ts`.
      */}
      {id && (
        <Opening
          /*
            Keyed, so a different book gets a fresh cover.

            The route is `/book/:bookId` and React Router keeps the same
            `Reader` element across a change of parameter — which means this
            component is *not* remounted when one book is followed by another.
            Its whole state is a clock that starts on mount and a phase that
            only ever moves forwards, so without the key the second book opens
            onto a cover that has already finished leaving: no cover at all, and
            worse, none ever again for the life of the screen.
          */
          key={id}
          id={id}
          book={frame.status === 'ready' ? frame.book : knownBook(id)}
          ready={page.status === 'ready'}
          abandon={
            frame.status === 'missing' ||
            frame.status === 'failed' ||
            page.status === 'failed'
          }
        />
      )}

      {frame.status === 'missing' && (
        <p className={styles.note} role="alert">
          That book isn’t in your library.
        </p>
      )}

      {frame.status === 'failed' && (
        <p className={styles.note} role="alert">
          Couldn’t open that book. {frame.message}
        </p>
      )}

      {frame.status === 'ready' && (
        <>
          <Chrome
            bookTitle={frame.book.title}
            bookId={frame.book.id}
            manifest={frame.manifest}
            here={here}
            pages={pages}
            outline={outline}
            shown={chromeShown}
            focusMode={focusMode}
            sheetOpen={sheetOpen}
            sheetTab={sheetTab}
            settings={settings}
            onToggleFocus={toggleFocus}
            onOpenSheet={openSheet}
            onCloseSheet={closeSheet}
            onJumpTo={(chapter, section) => goTo({ chapter, section })}
            onJumpToPage={jumpToPage}
            onSettingsChange={changeSettings}
            highlighter={highlighter}
            onHighlighterChange={changeHighlighter}
            bookmarks={bookmarkRows}
            onJumpToBookmark={jumpToAnchor}
            onRenameBookmark={renameBookmark}
            onDeleteBookmark={deleteBookmark}
            notes={noteRows}
            onJumpToNote={jumpToAnchor}
            searchOpen={searchOpen}
            query={query}
            results={results}
            onOpenSearch={openSearch}
            onCloseSearch={closeSearch}
            onQueryChange={setQuery}
            onJumpToHit={jumpToHit}
          />

          {/*
            The sheet of paper: the text and the page number printed at its
            foot, held in one box so the two can be moved as one thing. It is
            what shrinks out of the toolbar's way — see `.stage` in
            `Reader.module.css`, which is where the reasoning lives.

            The scale is handed to the stylesheet rather than written in it, so
            the number the arithmetic above divides by and the number the page
            is actually drawn at cannot come apart.
          */}
          <div
            className={styles.stage}
            data-shrunk={chromeShown}
            style={{ '--page-scale': PAGE_SCALE } as React.CSSProperties}
          >
          {/*
            Tapping the text shows or hides the overlay — the Books-style
            gesture. It sits on the article rather than the whole page so the
            pager underneath keeps working while the overlay is hidden.

            WP-17 will want this tap for the selection menu; it will need to
            distinguish a tap on a selection from a tap on bare text, which is
            a decision best made once there's a selection to test against.
          */}
          <article
            ref={holdStrip}
            className={styles.page}
            /*
              The page follows the thumb.

              Pointer events rather than touch events, so one set of handlers
              covers a finger, a stylus and a mouse drag — and so `setPointerCapture`
              can guarantee the release arrives even if the finger leaves the
              article, which a turn dragged right off the edge of the screen
              always does.

              A drag in flight is *not* a layer and owes `dismissTopLayer`
              nothing: it is ended by the finger coming off or by
              `pointercancel`, never by Back. Said here because everything else
              drawn over this page is a layer, and the next reader of this file
              will be looking for the registration.
            */
            onPointerDown={(event) => {
              if (!event.isPrimary) return

              // Nothing of ours should be on the page when a gesture starts. If
              // something is — a turn whose animation was never given the frames
              // to finish, most likely because the app was backgrounded
              // mid-turn — the reader is looking at a still photograph of an old
              // page and the book appears frozen. Sweeping here means that state
              // cannot survive being touched, whatever put it there.
              if (!drag.current && !held.current) clearSheets(strip.current)

              touchStart.current = { x: event.clientX, y: event.clientY }
              dragSpeed.current = 0
              // Asked here and nowhere else. See `dimZone`.
              dimZone.current = inDimZone(event.clientX, window.innerWidth)
              // Asked here and nowhere else. See `edgeZone`.
              edgeZone.current = inEdgeBand(event.clientX, window.innerWidth)
            }}
            onPointerMove={(event) => {
              if (!event.isPrimary) return

              if (drag.current) {
                moveDrag(event.clientX)
                return
              }

              if (dimDrag.current) {
                const { y, from: was } = dimDrag.current
                showDim(dimAfterDrag(was, y - event.clientY, window.innerHeight))
                return
              }

              const from = touchStart.current
              if (!from) return

              const across = event.clientX - from.x
              const down = event.clientY - from.y

              // The brightness gesture, claimed before the page turn gets a
              // look in. It needs both halves of the gate: the stroke started
              // on the deck's band, and it is going up or down rather than
              // across. Clearing `touchStart` is what stops the page from
              // turning for the rest of the stroke — the turn has no other way
              // in — and the capture is what guarantees the release arrives
              // when the finger slides off the edge of the screen, which a
              // gesture on the last 44 px does constantly.
              if (dimZone.current && Math.abs(down) >= DIM_FROM && Math.abs(down) > Math.abs(across)) {
                dimDrag.current = { y: event.clientY, from: settings.dim }
                touchStart.current = null
                swiped.current = true
                event.currentTarget.setPointerCapture(event.pointerId)
                return
              }

              // A horizontal stroke that began at an edge belongs to the system,
              // not to the book — it is how the reader leaves. Clearing
              // `touchStart` closes the page turn's only way in for the rest of
              // the stroke, the same way the brightness gate does. It is asked
              // after the brightness gate on purpose: a vertical stroke on the
              // right-hand deck is still a brightness drag, even at the very
              // edge, because the two gestures differ in direction.
              if (edgeZone.current && Math.abs(across) >= DRAG_FROM) {
                touchStart.current = null
                return
              }

              if (Math.abs(across) < DRAG_FROM) return

              // A finger that is mostly going up or down is not turning a page.
              // It gets one chance: once the gesture is claimed here it stays
              // claimed, and once it is rejected the rest of the stroke is left
              // alone rather than being re-tested every few pixels.
              if (Math.abs(down) > Math.abs(across)) {
                touchStart.current = null
                return
              }

              // Pushing the page leftwards moves forwards, as pushing a sheet
              // of paper aside would.
              const by = across < 0 ? 1 : -1
              // Reckoned from here, not from the touch-down point, so the first
              // frame of the curl is the first pixel past the threshold and the
              // sheet does not appear already part-turned.
              if (startDrag(by, event.clientX)) {
                swiped.current = true
                event.currentTarget.setPointerCapture(event.pointerId)
              }
              // No sheet means a section boundary, or a reader who has asked for
              // less movement, and `onPointerUp` falls back to the threshold
              // swipe — which is what `touchStart` is still being kept for.
              // Deliberately *not* setting `swiped` on that path: this fires on
              // eight pixels of horizontal movement, which a tap on a moving bus
              // easily has, and marking the gesture swiped here swallowed the
              // click that would have turned the page or shown the toolbar.
              // Whoever actually turns a page sets it.
            }}
            onPointerUp={(event) => {
              if (!event.isPrimary) return

              if (dimDrag.current) {
                const { y, from: was } = dimDrag.current
                dimDrag.current = null
                // Committed once, here. The screen already shows this number —
                // `showDim` has been writing it all along — so the only thing
                // the state change does is save it.
                const value = dimAfterDrag(was, y - event.clientY, window.innerHeight)
                showDim(value)
                setSettings((current) => ({ ...current, dim: value }))
                return
              }

              if (drag.current) {
                touchStart.current = null
                // The release point is a real reading and the last one there
                // will be. A flick can be over in a single move — the browser
                // coalesces the rest — and without this the sheet was settled
                // from a position and a speed taken before the fastest part of
                // the stroke had happened.
                moveDrag(event.clientX)
                endDrag()
                return
              }

              const from = touchStart.current
              touchStart.current = null
              if (!from) return

              // The fallback: a section-crossing turn, or reduced motion. The
              // old threshold swipe, unchanged, still handing the seam to
              // `turnPage`'s two-copy handoff.
              const swipe = swipeOf(from, { x: event.clientX, y: event.clientY })
              if (!swipe) return
              swiped.current = true
              turnPage(swipe === 'left' ? 1 : -1)
            }}
            onPointerCancel={() => {
              touchStart.current = null
              // The system took the gesture mid-drag — a call, an edge swipe. A
              // stroke that was interrupted is not a decision, so the page goes
              // back to the darkness that is actually saved. Left as it stood,
              // it would show a value nothing holds and would jump the next
              // time anything re-rendered.
              if (dimDrag.current) {
                dimDrag.current = null
                showDim(settings.dim)
              }
              // The system has taken the gesture — a phone call, an edge swipe,
              // a second finger. There is no release coming, so the sheet is
              // settled from where it stands rather than left over the page.
              if (drag.current) endDrag()
            }}
            onClick={(event) => {
              if (swiped.current) {
                swiped.current = false
                return
              }

              // The tap that finished a selection is not a tap on the page. It
              // has already raised the selection menu, and toggling the toolbar
              // under it would move the words the menu is pointing at. Nor is
              // the tap that put the menu away again.
              if (selected) return
              if (dismissed.current) {
                dismissed.current = false
                return
              }

              // A tap on the reader's own highlight belongs to that highlight,
              // wherever on the page it falls. It is tried before the edges,
              // because a highlight in the margin third is still a highlight.
              if (pickHighlight(event.clientX, event.clientY)) return

              // The outer thirds turn a page; the middle shows the overlay.
              // Edge taps are what a reader's thumb already rests on, and they
              // are the one control that works with the overlay hidden.
              const box = event.currentTarget.getBoundingClientRect()
              const across = box.width > 0 ? (event.clientX - box.left) / box.width : 0.5

              if (across < EDGE_TAP) {
                turnPage(-1)
                return
              }
              if (across > 1 - EDGE_TAP) {
                turnPage(1)
                return
              }

              setChromeShown((shown) => !shown)
              closeLayers()
              // The note has done its job the moment reading is touched.
              setResumed(false)
            }}
          >
            {/*
              A chapter should open like a chapter.

              The book's own title used to sit here, above every section — but
              it is already in the bar at the top of the screen, so it was
              saying the same thing twice, and on a book whose title came from
              a filename it said it at length. What a reader wants at the top
              of a chapter is what print gives them: which chapter this is, in
              a quiet line, then its name, given room.

              The chapter line only appears on a chapter's *first* section.
              Repeating "Part Three" over each of its nine sections would turn
              a title page into a running header.
            */}
            {page.status === 'ready' && sectionBody(page.section, here, title)}

            {/* Only for a place saved a while ago. Opening a book you were
                reading a minute ago somewhere other than the first page is
                expected; opening last month's book on page 190 without a word
                looks like the app lost your place rather than kept it.

                Outside `sectionBody` on purpose: it is about this reader's last
                visit, not about the section, and an understudy that carried it
                would break its pages in a place the real page will not. */}
            {resumed && <p className={styles.resumed}>Picked up where you left off.</p>}

            {page.status === 'loading' && <p className={styles.note}>Loading…</p>}

            {page.status === 'failed' && (
              <p className={styles.note} role="alert">
                {page.message}
              </p>
            )}
          </article>

          {/*
            The two sections either side, laid out and waiting to be turned onto.
            See `.understudy` in `Reader.module.css` for what they are for, and
            `startSeamDrag` for what brings them out.

            Hidden from assistive technology and from find-in-page: they are the
            same words as a page the reader has not reached yet, and a screen
            reader meeting the next chapter in the middle of this one would be
            reading the book out of order.
          */}
          <article
            ref={holdBefore}
            className={`${styles.page} ${styles.understudy}`}
            data-showing="false"
            aria-hidden="true"
            inert={!beside.previous ? true : undefined}
          >
            {beside.previous &&
              neighbours.previous &&
              sectionBody(beside.previous, neighbours.previous, titleOfChapter(neighbours.previous.chapter))}
          </article>

          <article
            ref={holdAfter}
            className={`${styles.page} ${styles.understudy}`}
            data-showing="false"
            aria-hidden="true"
            inert={!beside.next ? true : undefined}
          >
            {beside.next &&
              neighbours.next &&
              sectionBody(beside.next, neighbours.next, titleOfChapter(neighbours.next.chapter))}
          </article>

          </div>

          {/*
            The page number, at the foot of the screen and outside the sheet
            that shrinks — so it holds its size and its place when the toolbar
            comes up. It still turns with the page: that is
            `data-page-furniture` and the copy `pageTurn.ts` makes of it, not
            where it sits.
          */}
          {/*
            And its opposite number at the head of the page: the book's title,
            printed small across the top margin. How much room it gets is one
            token rather than a condition here — see `--running-head`.
          */}
          <RunningHead title={frame.book.title} />

          {/*
            The book around the page: the two stacks of paper at the side edges,
            and the shadow of this sheet curving down into the binding. They
            look like one object and behave like two — the decks hold still
            because a binding does, and the gutter flips because it belongs to
            the sheet. `PageSpine.tsx` has the reasoning.
          */}
          <PageDecks percent={pages?.percent ?? null} />
          <PageSpine />

          {/*
            The selection menu, and the note it can open.

            Both live out here rather than inside `<article>`: the article is
            the thing that slides when a page turns, and a menu that slid with
            it would leave the words it points at. The composer outlives the
            selection on purpose — see `composing` above.
          */}
          {/* The reader's own marks, found again in the page and painted. */}
          <Highlights
            highlights={highlights}
            root={column}
            watch={here.section}
            style={resolveHighlighter(highlighter, settings.theme)}
          />

          {/*
            And the same again for the two understudies.

            A seam turn does not flip a copy of this strip — it flips the
            understudy itself. So the understudy is a page the reader looks at,
            and it needs its own ink, or a highlight on the first page of the
            next section stays invisible for the whole turn and only appears
            after the section lands. Each painter only paints paragraphs its own
            root contains, and the two sections have different anchor ids, so
            the three never fight over the same paragraph.
          */}
          <Highlights
            highlights={highlights}
            root={beforeColumn}
            watch={beside.previous}
            style={resolveHighlighter(highlighter, settings.theme)}
          />
          <Highlights
            highlights={highlights}
            root={afterColumn}
            watch={beside.next}
            style={resolveHighlighter(highlighter, settings.theme)}
          />

          {selected && !composing && (
            <SelectionMenu
              selection={selected}
              onAction={onSelectionAction}
              onDismiss={dropSelection}
              onExtend={stretchSelection}
              highlighted={touched}
              unit={unit}
              onGrow={growSelection}
              canGrow={canGrow}
            />
          )}

          {composing && (
            <NoteComposer
              quote={composing.text}
              onSave={(text) => {
                void keepNote({
                  text,
                  quote: composing.text,
                  anchor: composing.anchor,
                })
                setComposing(null)
                dropSelection()
              }}
              onCancel={() => {
                setComposing(null)
                dropSelection()
              }}
            />
          )}

          {unbuilt && (
            <p className={styles.unbuilt} role="status">
              {unbuilt} is not built yet.
            </p>
          )}


          <StatusLine
            manifest={frame.manifest}
            here={here}
            pages={pages}
            barState={barState}
            onBarStateChange={setBarState}
          />

          {/*
            The bookmark, as a corner of the paper rather than a button in a bar.

            This used to be a ribbon glyph up in the toolbar, which meant marking
            a page cost two taps — one to raise the toolbar, one to hit the
            ribbon — and put a control for *this page* in the strip of controls
            for *the book*. Now the top right corner of the page is the mark, the
            way the corner of a paper page is: tap it and it folds down, tap it
            again and it lifts. Nothing is drawn there until it is marked, so an
            unmarked page is bare paper, which is the point.

            It sits outside the pager rather than inside `<article>` so it holds
            still while pages slide under it, and outside the overlay so it is
            reachable without raising anything. The corner overlaps the strip
            that turns a page forward, and it wins there deliberately: it is a
            small, deliberate target in a corner, and the rest of that edge —
            the other ninety per cent of it — still turns the page.
          */}
          <button
            type="button"
            className={styles.ribbon}
            data-marked={bookmarkHere !== undefined}
            aria-pressed={bookmarkHere !== undefined}
            aria-label={bookmarkHere ? 'Remove bookmark' : 'Bookmark this page'}
            onClick={(event) => {
              event.stopPropagation()
              toggleBookmark()
            }}
          >
            {/* The fold itself: a tab of colour with a notch cut out of its
                foot, which is the shape every reader already reads as a
                bookmark. Hidden from assistive tech — the button's label
                already says both what it is and what tapping it will do. */}
            <span className={styles.ribbonMark} aria-hidden="true" />
          </button>

          {/*
            The lamp turned down. Above the page, the decks, the spine, the
            running head and the bookmark — everything that is the book — and
            below the overlay and the status line, which are controls you have
            deliberately called up and should be able to read while you use
            them.

            Last of the things at `z-index: 9`, and that is why it is written
            here rather than up beside the decks where it belongs by subject.
            Layers at the same level are painted in document order, and a
            bookmark left glowing on a page turned right down looks like a
            fault rather than a bookmark.

            A veil rather than `filter: brightness()` on the page: a filter
            makes a containing block, and everything on this screen that is
            `position: fixed` is fixed to the screen on purpose.
          */}
          <div className={styles.veil} aria-hidden="true" />

          {/*
            The way back from a followed link. Shown only after one has been
            followed, and outside the pager because it is not a page turn —
            it undoes a jump. Disappears once used, since there is then nothing
            to go back to.
          */}
          {returnTo && (
            <button
              type="button"
              className={styles.returnTo}
              onClick={(event) => {
                event.stopPropagation()
                const back = returnTo.anchor
                const within = returnTo.within
                setReturnTo(undefined)
                jumpToAnchor(back, within)
                // `jumpToAnchor` sets a new return point; going back is not
                // itself somewhere to come back from.
                setReturnTo(undefined)
              }}
            >
              {returnTo.page ? `↩ Back to page ${returnTo.page}` : '↩ Back to where you were'}
            </button>
          )}

          {/*
            There were Previous and Next buttons here. They are gone: a phone is
            read by swiping and by tapping the edge of the page, and two labelled
            controls under every page of the book were furniture nobody used.
            The keyboard route above replaces them for anyone not using a touch
            screen, which is the only thing they were still owed for.
          */}
        </>
      )}
    </div>
  )
}
