import { useCallback, useEffect, useRef, useState } from 'react'
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
  type FollowLink,
  useBackDismiss,
  writeFocusMode,
  type BarState,
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
  return {
    scrollWidth: element.scrollWidth,
    pageWidth: element.clientWidth,
    scrollLeft: element.scrollLeft,
  }
}

/** Which page of the strip a paragraph sits on, 1-based. */
function columnOf(element: HTMLElement, pageWidth: number): number {
  if (pageWidth <= 0) return 1
  return Math.floor(element.offsetLeft / pageWidth) + 1
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

  const [focusMode, setFocusMode] = useState(readFocusMode)
  // Focus Mode decides only what's showing when you arrive. A tap still brings
  // everything back, which is the difference between hiding and removing.
  const [chromeShown, setChromeShown] = useState(() => !readFocusMode())
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

  /**
   * Whether there are pages left in this section either way. Previous and Next
   * now turn *pages*, so "is there anywhere to go?" is no longer answered by
   * the neighbouring sections alone — mid-section, both are always available.
   */
  const [ends, setEnds] = useState({ atStart: true, atEnd: true })

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
  const [returnTo, setReturnTo] = useState<{ anchor: Anchor; page?: number } | undefined>(
    undefined,
  )

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

  /** The section already landed on, so arriving somewhere happens once. */
  const landedOn = useRef<SectionPath | undefined>(undefined)

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

  /** Scroll the strip so that `page` is the one showing. */
  const showPage = useCallback((page: number) => {
    const element = strip.current
    if (!element) return
    element.scrollLeft = offsetOfPage(measure(element), page)
  }, [])

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
          showPage(columnOf(node, measure(strip.current).pageWidth))
          setAnchorHere(anchor)
        }
        return
      }

      // A different section: it has to load before a paragraph inside it can be
      // named, so hand the page to the effect that runs once it has.
      pendingPage.current = wanted
      setHere(ref)
    },
    [spine, here, page, showPage],
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
    (anchor: Anchor) => {
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
      if (from) setReturnTo(pages ? { anchor: from, page: pages.page } : { anchor: from })
      setSheetOpen(false)

      // A jump is the one move where a reader genuinely doesn't know where they
      // have landed — every other one they made a page at a time. So the bar
      // comes back to say so, unless they've explicitly asked for a bare page.
      if (!focusMode) setChromeShown(true)

      if (parts.chapter === here.chapter && parts.section === here.section) {
        const node = document.getElementById(elementIdOf(anchor))
        if (node) {
          showPage(columnOf(node, measure(strip.current).pageWidth))
          setAnchorHere(anchor)
        }
        return
      }

      pendingAnchor.current = anchor
      setHere({ chapter: parts.chapter, section: parts.section })
    },
    [here, anchorHere, page, showPage, pages, focusMode],
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
      const next = turn(measure(strip.current), by)
      if (next !== null) {
        showPage(next)
        return
      }

      // Off the end of this section: fall through to the next or previous one,
      // remembering which end of it to arrive at.
      const target = by === 1 ? neighbours.next : neighbours.previous
      if (!target) return
      landOn.current = by === 1 ? 'start' : 'end'
      goTo(target)
    },
    [neighbours, showPage, goTo],
  )

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
    pendingPage.current = undefined
    pendingAnchor.current = undefined

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

    if (asked && target) {
      showPage(columnOf(target, measure(strip.current).pageWidth))
      setAnchorHere(asked)
      return
    }

    // Turning *back* into a section lands on its last page, not its first —
    // otherwise going back a page and forward again arrives somewhere the
    // reader has never been.
    showPage(end ? pageCountOf(measure(strip.current)) : 1)
    setAnchorHere(
      end
        ? page.section.paragraphs[page.section.paragraphs.length - 1]?.anchor
        : page.section.paragraphs[0]?.anchor,
    )
  }, [page, here, spine, showPage])

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
      const count = pageCountOf(measure(element))
      setEnds({ atStart: showing <= 1, atEnd: showing >= count })

      if (pageWidth > 0 && element) {
        const found = anchors.find((anchor) => {
          const node = document.getElementById(elementIdOf(anchor))
          return node ? columnOf(node, pageWidth) >= showing : false
        })
        if (found) setAnchorHere(found)
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

    // Once immediately: a freshly laid-out section has to report its own ends
    // before anything has scrolled, or Previous and Next start out wrong.
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

    const timer = window.setTimeout(() => {
      void repository.savePosition(id, anchorHere).catch(() => {
        // Losing a place is a small loss; interrupting reading to report it
        // would be a larger one. The next paragraph tries again anyway.
      })
    }, SAVE_AFTER_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [id, restored, anchorHere])

  const title =
    frame.status === 'ready' ? chapterTitle(frame.manifest, here.chapter) : undefined

  return (
    <div className={styles.reader}>
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
            onToggleFocus={toggleFocus}
            onToggleSheet={() => setSheetOpen((open) => !open)}
            onSelectTab={setSheetTab}
            onBarStateChange={setBarState}
            onJumpToChapter={(chapter) => goTo({ chapter, section: 1 })}
            onJumpToPage={jumpToPage}
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
            <header className={styles.header}>
              <p className={styles.context}>
                {frame.book.title}
                {title ? ` · ${title}` : ''}
              </p>
              {/* Only for a place saved a while ago. Opening a book you were
                  reading a minute ago somewhere other than the first page is
                  expected; opening last month's book on page 190 without a word
                  looks like the app lost your place rather than kept it. */}
              {resumed && (
                <p className={styles.resumed}>Picked up where you left off.</p>
              )}

              {page.status === 'ready' && page.section.title && (
                <h2 className={styles.sectionTitle}>{page.section.title}</h2>
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
                setReturnTo(undefined)
                jumpToAnchor(back)
                // `jumpToAnchor` sets a new return point; going back is not
                // itself somewhere to come back from.
                setReturnTo(undefined)
              }}
            >
              {returnTo.page ? `↩ Back to page ${returnTo.page}` : '↩ Back to where you were'}
            </button>
          )}

          <nav className={styles.pager} aria-label="Move through the book">
            <button
              type="button"
              className={styles.pagerButton}
              disabled={!neighbours.previous && ends.atStart}
              onClick={() => {
                turnPage(-1)
              }}
            >
              Previous
            </button>

            <button
              type="button"
              className={styles.pagerButton}
              disabled={!neighbours.next && ends.atEnd}
              onClick={() => {
                turnPage(1)
              }}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  )
}
