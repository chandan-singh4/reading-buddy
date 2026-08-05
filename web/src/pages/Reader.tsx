import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  Block,
  Chrome,
  anchorAtPage,
  buildSpine,
  chapterTitle,
  elementIdOf,
  pagesAt,
  refAtPage,
  wordsAt,
  cancelTurn,
  fadeIn,
  holdOutgoing,
  playTurn,
  scrollStrip,
  type Cancel,
  type HeldPage,
  firstSection,
  isFresh,
  offsetOfPage,
  pageAt,
  pageCountOf,
  turn,
  swipeOf,
  nextSection,
  pathOf,
  placeOf,
  previousSection,
  readFocusMode,
  applyStoredTheme,
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
} from '../reader/index.ts'
import { repository } from '../storage/index.ts'
import { tryParseAnchor } from '../structure/index.ts'
import type {
  Anchor,
  BookId,
  BookMeta,
  Manifest,
  Paragraph,
  Section,
  SectionPath,
} from '../structure/index.ts'
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
    pageWidth: element.getBoundingClientRect().width + gap,
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

  const from = node.getBoundingClientRect().left - strip.getBoundingClientRect().left
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
  const figureImages = useFigureImages(
    page.status === 'ready' ? page.section.paragraphs : EMPTY_PARAGRAPHS,
    loadAssets,
  )

  const [focusMode, setFocusMode] = useState(readFocusMode)

  /** Theme, font, text size, line spacing, margins — the Aa tab's settings. */
  const [settings, setSettings] = useState<ReaderSettings>(readReaderSettings)

  const changeSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }, [])

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
   * The paragraph currently at the top of the screen. Sections run to a dozen
   * pages in a real book, so without this the page number would freeze at the
   * start of a section and only jump when you left it.
   */
  const [anchorHere, setAnchorHere] = useState<Anchor | undefined>(undefined)

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
   * So the answer is checked again on the next two frames and corrected in place
   * if the layout has moved under it. Silent when nothing changed, which is most
   * of the time, and abandoned if the reader has moved on meanwhile.
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

      requestAnimationFrame(() => {
        correct()
        requestAnimationFrame(correct)
      })
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
        wordsAt(spine, here, page.status === 'ready' ? page.section : undefined, anchorHere),
      )
    : null

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
        showPage(next)
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
      held.current = holdOutgoing(strip.current, by)
      goTo(target)
    },
    [neighbours, showPage, goTo],
  )

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

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
  }, [])

  // A back swipe with the sheet open used to leave the book entirely. Now it
  // closes the sheet — the gesture people actually mean by it.
  useBackDismiss(sheetOpen, closeSheet)

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
      }) as unknown as React.CSSProperties,
    [settings.textStep, settings.spacing, settings.margins],
  )

  // The frame: book + manifest, once per book.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    void (async () => {
      try {
        const [book, manifest] = await Promise.all([
          repository.getBook(id),
          repository.getManifest(id),
        ])
        if (cancelled) return

        if (!book || !manifest) {
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
        if (!cancelled) setNeighbours({ previous, next })
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
    if (page.status !== 'ready') return
    if (landedOn.current === page.section.path) return
    landedOn.current = page.section.path

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
    const arriving = () => {
      if (turn) playTurn(turn, strip.current, measure(strip.current).pageWidth)
      else if (landedBefore.current) fadeIn(strip.current)
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
  // book mid-turn would otherwise leave the copy in the document.
  useEffect(() => {
    return () => {
      cancelTurn(held.current)
      held.current = null
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
        let after: Anchor | undefined
        for (const anchor of anchors) {
          const node = document.getElementById(elementIdOf(anchor))
          if (!node) continue

          const column = columnOf(node, element)
          if (column <= showing) found = anchor
          else {
            after = anchor
            break
          }
        }
        // The fallback covers the one case the rule above can't: a page whose
        // every paragraph begins later, which is what a section's opening page
        // looks like before anything has been laid out.
        const settled = found ?? after
        if (settled) setAnchorHere(settled)
        return
      }

      const found = anchorOnScreen(anchors)
      if (found) setAnchorHere(found)
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
      void repository.savePosition(id, anchorHere, percent).catch(() => {
        // Losing a place is a small loss; interrupting reading to report it
        // would be a larger one. The next paragraph tries again anyway.
      })
    }, SAVE_AFTER_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [id, restored, anchorHere, pages?.percent])

  const title =
    frame.status === 'ready' ? chapterTitle(frame.manifest, here.chapter) : undefined

  return (
    <div className={styles.reader} style={readingVars}>
      {/* Only while there's no book to hang the overlay on — once there is,
          the overlay owns the way back. */}
      {frame.status !== 'ready' && (
        <Link to="/" className={styles.back}>
          ← Library
        </Link>
      )}

      {frame.status === 'loading' && <p className={styles.note}>Opening…</p>}

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
            manifest={frame.manifest}
            here={here}
            pages={pages}
            shown={chromeShown}
            focusMode={focusMode}
            sheetOpen={sheetOpen}
            sheetTab={sheetTab}
            barState={barState}
            settings={settings}
            onToggleFocus={toggleFocus}
            onToggleSheet={() => setSheetOpen((open) => !open)}
            onSelectTab={setSheetTab}
            onBarStateChange={setBarState}
            onJumpToChapter={(chapter) => goTo({ chapter, section: 1 })}
            onJumpToPage={jumpToPage}
            onSettingsChange={changeSettings}
          />

          {/*
            Tapping the text shows or hides the overlay — the Books-style
            gesture. It sits on the article rather than the whole page so the
            pager underneath keeps working while the overlay is hidden.

            WP-17 will want this tap for the selection menu; it will need to
            distinguish a tap on a selection from a tap on bare text, which is
            a decision best made once there's a selection to test against.
          */}
          <article
            ref={strip}
            className={styles.page}
            onTouchStart={(event) => {
              const point = event.touches[0]
              touchStart.current = point ? { x: point.clientX, y: point.clientY } : null
            }}
            onTouchEnd={(event) => {
              const from = touchStart.current
              const point = event.changedTouches[0]
              touchStart.current = null
              if (!from || !point) return

              const swipe = swipeOf(from, { x: point.clientX, y: point.clientY })
              if (!swipe) return

              // A swipe is a gesture in its own right, so it must not also be
              // read as the tap below that shows the overlay.
              swiped.current = true
              // Pushing the page leftwards moves forwards, as pushing a sheet
              // of paper aside would.
              turnPage(swipe === 'left' ? 1 : -1)
            }}
            onClick={(event) => {
              if (swiped.current) {
                swiped.current = false
                return
              }

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
              setSheetOpen(false)
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
            <header
              className={`${styles.header} ${here.section === 1 ? styles.opening : ''}`}
            >
              {title && here.section === 1 && (
                <p className={styles.chapterName}>{title}</p>
              )}

              {page.status === 'ready' && page.section.title && (
                <h2 className={styles.sectionTitle}>{page.section.title}</h2>
              )}

              {/* A hairline instead of a blank gap: it says "the chapter starts
                  below this" without spending a word on it. */}
              <span className={styles.openingRule} aria-hidden="true" />

              {/* Only for a place saved a while ago. Opening a book you were
                  reading a minute ago somewhere other than the first page is
                  expected; opening last month's book on page 190 without a word
                  looks like the app lost your place rather than kept it. */}
              {resumed && (
                <p className={styles.resumed}>Picked up where you left off.</p>
              )}
            </header>

            {page.status === 'loading' && <p className={styles.note}>Loading…</p>}

            {page.status === 'failed' && (
              <p className={styles.note} role="alert">
                {page.message}
              </p>
            )}

            {page.status === 'ready' &&
              page.section.paragraphs.map((block) => (
                <Block
                  key={block.anchor}
                  block={block}
                  onFollowLink={jumpToAnchor as FollowLink}
                  images={figureImages}
                />
              ))}
          </article>

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
