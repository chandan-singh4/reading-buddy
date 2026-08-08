import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useOutlet } from 'react-router'

import { prefersReducedMotion } from '../reader/motion.ts'
import { useViewLocation } from './routeTransition.tsx'
import { ScreenActiveProvider } from './screenActive.tsx'
import { recallScroll, rememberScroll } from './scrollMemory.ts'
import { useTabHistory } from './tabHistory.ts'
import { PAGE_ORDER, useSwipeNav } from './useSwipeNav.ts'
import styles from './AppShell.module.css'

/** Whether a path is one of the four screens this shell holds. */
function isTabPath(pathname: string): boolean {
  return PAGE_ORDER.includes(pathname)
}

/**
 * The drawer, in the same order a swipe moves through them.
 *
 * Home is in the list now. It was deliberately left out when the drawer was
 * built — the reasoning being that Home is the screen the ☰ is sitting on — but
 * that stopped being true the moment swiping made Home one page among four. A
 * reader who swipes to Settings and opens the drawer to go back needs Home to
 * be *in* it; "swipe right three times" is not a way home.
 */
/*
 * The page slide borrows the drawer's curve and very nearly its duration, on
 * purpose. A swipe between the four screens and a tap in the drawer are the
 * *same move* by two routes, so if they were timed differently the app would
 * feel like two apps depending on which one the reader reached for.
 *
 * 300 ms rather than the 260 this once ran at: the old timing was short enough
 * that the slide read as a cut with a flicker on it — the screen was already
 * still by the time the eye found it. Long enough to be followed, short enough
 * that a reader flicking through all four never queues.
 *
 * 5% rather than a full screen width, and no fade at all. See `.page` in the
 * stylesheet for what happens when either of those changes.
 */
const SLIDE_MS = 300
const SLIDE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'
const SLIDE_FROM = 5

/**
 * How far the screen being left drifts as it goes, against the arriving one.
 *
 * Deliberately smaller than `SLIDE_FROM`. Two layers moving the same distance
 * read as one picture sliding; the arriving screen travelling further than the
 * one it replaces is what gives the move its depth — the old page settling back
 * as the new one comes over it, like turning from one section of a book to the
 * next.
 */
const SLIDE_TO = 2.5

const DRAWER_LINKS: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/library', label: 'Library', icon: '▤' },
  { to: '/stats', label: 'Stats', icon: '◔' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

/**
 * The chrome around Home, All Books, Stats and Settings: a slim top bar with a
 * hamburger, a scrolling content area, and a left drawer holding the three
 * destinations that aren't Home.
 *
 * A drawer rather than a tab bar because Home is the front door and the other
 * three are occasional: they don't each deserve a permanent quarter of the
 * screen's bottom edge. Tapping ☰ slides the drawer in and pushes the content
 * behind frosted glass, so it reads as "still there, just not the subject".
 *
 * The Reader deliberately renders outside this shell — reading should be
 * full-bleed, with navigation appearing only on tap (WP-13).
 */
export default function AppShell() {
  const [open, setOpen] = useState(false)
  /**
   * The location this shell *renders* from.
   *
   * Lagged while a book is opening or closing, so the shelf isn't torn down and
   * rebuilt in the one frame it is being photographed in — see
   * `routeTransition.tsx`. Identical to `useLocation()` the rest of the time,
   * which is all of the time a reader is on these four screens.
   */
  const location = useViewLocation()
  const drawerRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  /**
   * The one way to move between the four screens.
   *
   * Held here, at the single place both routes to it can reach: the swipe below
   * and the drawer links further down. It also owns the Back handling, which is
   * why it is a hook called once rather than a function called twice.
   */
  const moveToTab = useTabHistory(isTabPath)

  useSwipeNav(moveToTab)

  /*
   * ## Every screen the reader has visited, kept alive
   *
   * This is the root cause of the flash, and it is the one thing three rounds
   * of caching could not reach.
   *
   * The page used to be keyed on the path, so a tab change **destroyed the
   * whole screen and built a new one**. The caches made the *data* instant —
   * the shelf, the covers, the object URLs are all there on the first frame
   * now — but they cannot help with what happens next, because every `<img>` is
   * a brand-new element that the browser has to decode again before it can
   * paint. That decode is asynchronous, so there is at least one frame with
   * empty boxes where the covers were, and on a shelf of a dozen they resolve
   * a few milliseconds apart. Which is precisely the report, every time: "the
   * covers flash, it looks like the page is refreshing".
   *
   * Nothing about it was an animation, and nothing about it was the data. It
   * was the screen genuinely being rebuilt.
   *
   * So screens are no longer thrown away. `useOutlet` hands us the element for
   * the matched route; we keep each one and go on rendering it, with everything
   * but the current screen `hidden`. Coming back is then not a rebuild at all —
   * the same DOM, the same decoded images, the same scroll position, the same
   * typed-in search. There is nothing left to flash, because nothing is
   * happening.
   *
   * Only screens actually visited are held, and only these four can be: Reader
   * and BookInfo render outside this shell.
   *
   * The elements kept for inactive screens are from the render that last showed
   * them, which is safe because none of these pages take props — React sees the
   * same component in the same slot and leaves its state alone. That is the
   * whole point.
   */
  const outlet = useOutlet()
  const screens = useRef(new Map<string, ReactNode>())
  if (outlet && isTabPath(location.pathname)) screens.current.set(location.pathname, outlet)

  const contentRef = useRef<HTMLElement>(null)

  /*
   * ## Each screen keeps its own place in the document
   *
   * The four screens share one scroller — the document — because a hidden screen
   * is `display: none` and so the document is only ever as tall as the screen on
   * show. Move from a long Library to a short Home and the browser has no choice
   * but to clamp `scrollY` to Home's last pixel, which is the "Home opens at the
   * bottom and looks like it refreshed" report; Library then comes back to
   * whatever Home left behind, because there was only ever one number.
   *
   * So the number is kept per screen. The full reasoning, and why a pixel offset
   * is the right answer here where `useRowMemory` decided it was the wrong one
   * for coming back from a book, is in `scrollMemory.ts`.
   */

  /**
   * The screen the scroll position currently belongs to.
   *
   * `null` until the first arrival, so a fresh mount restores rather than
   * skipping — `AppShell` unmounts while a book is open, and coming back out of
   * one is an arrival like any other.
   */
  const scrolled = useRef<string | null>(null)

  useEffect(() => {
    // Saved continuously rather than read at the moment of departure: by the
    // time any effect runs the swap has already happened and the browser has
    // already clamped, so the honest value is the last one seen *before* it.
    const onScroll = () => {
      if (scrolled.current !== null) rememberScroll(scrolled.current, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  useLayoutEffect(() => {
    if (scrolled.current === location.pathname) return
    scrolled.current = location.pathname

    // A layout effect, and therefore before the browser paints: the arriving
    // screen is already laid out at its full height by now, so this scroll is
    // never clamped, and the reader never sees the frame in between. In an
    // ordinary effect the wrong position paints first, which is the jump.
    window.scrollTo(0, recallScroll(location.pathname))
  }, [location.pathname])

  /*
   * ## Both screens move, and only the one leaving fades
   *
   * The arriving screen used to slide in alone, which reads as a cut with a
   * movement stuck on the end of it: the screen being left simply ceased to
   * exist in the frame the new one started travelling. Now the outgoing screen
   * is held on screen for the length of the move, drifting a little the other
   * way and fading out over the arriving one — the gentler, book-like crossing
   * of two sections rather than a swap.
   *
   * **Which layer carries the fade is not a stylistic choice.** Both screens are
   * transparent; what is behind them is the page background. Fade the *arriving*
   * one up and there is a stretch where both are partly transparent at once and
   * the background shows through the seam — the camera-shutter flash this
   * project has now met four times, recorded in `decisions.md` and in
   * `styles/transitions.css`, which solves the identical problem for opening a
   * book by the identical rule. With the fade on the layer that is leaving, and
   * that layer on top, something opaque covers the background on every frame.
   * There is nothing to flash.
   *
   * The old note here said "movement only, no opacity" — that was right while
   * only one screen was ever rendered, which is the condition this changes.
   *
   * ## Why the leaving screen is state rather than a hidden node un-hidden
   *
   * Reaching into the DOM to clear `hidden` works right up until React
   * re-renders for some unrelated reason mid-animation, reconciles `hidden`
   * back to `true`, and the outgoing screen vanishes half way through its fade.
   * Naming it in state means React renders it visible on purpose and keeps
   * rendering it that way until the animation says it is done.
   */
  const previous = useRef(location.pathname)
  const [leaving, setLeaving] = useState<string | null>(null)
  const direction = useRef(0)

  /**
   * How far to slide the outgoing screen so it fades out showing the part of
   * itself the reader was actually looking at.
   *
   * Needed only because the two screens now keep separate scroll positions. The
   * leaving screen is taken out of the flow and pinned to the top of the content
   * box, which was harmless while both screens shared one offset — the document
   * did not move, so "the top of the content box" *was* where the reader was.
   * With Library at 1200px and Home at 0 it stops being harmless: Library would
   * spend its 300 ms fade showing its first row rather than the row that was
   * under the reader's thumb, which reads as the shelf jumping just as it goes.
   *
   * Arriving offset minus leaving offset puts the leaving screen's old viewport
   * line back under the new one.
   */
  const leavingShift = useRef(0)

  useLayoutEffect(() => {
    const from = PAGE_ORDER.indexOf(previous.current)
    const to = PAGE_ORDER.indexOf(location.pathname)
    const was = previous.current
    previous.current = location.pathname

    // No direction to show: the first paint of a session, or arriving from a
    // book. A screen sliding in at launch reads as a glitch, not a transition.
    if (from === -1 || to === -1 || from === to) return
    if (prefersReducedMotion()) return
    // Nothing to animate on a platform without the Web Animations API — jsdom
    // is the one that matters. Checked before the screen is revealed, so it is
    // never left visible waiting for an animation that cannot run.
    if (typeof Element.prototype.animate !== 'function') return

    direction.current = to > from ? 1 : -1
    // Both still hold: the arriving screen's position was restored by the effect
    // above, and the leaving screen's was saved by the scroll listener before
    // the swap could clamp it.
    leavingShift.current = recallScroll(location.pathname) - recallScroll(was)
    // A layout effect, so this extra render lands before the browser paints and
    // the two screens are on screen together from the very first frame of the
    // move. In an ordinary effect the new screen paints alone first, which is
    // the cut this is removing.
    setLeaving(was)
  }, [location.pathname])

  /**
   * Run the crossing, once both screens are on screen to be crossed.
   *
   * A second layout effect rather than part of the first: the outgoing screen is
   * `hidden` at the moment the move is decided, and animating a hidden element
   * achieves nothing. This runs after the render that reveals it.
   */
  useLayoutEffect(() => {
    if (leaving === null) return

    const content = contentRef.current
    const arriving = content?.querySelector<HTMLElement>('[data-active="true"]')
    const going = content?.querySelector<HTMLElement>('[data-leaving="true"]')

    const done = () => setLeaving(null)
    if (!arriving || !going) {
      done()
      return
    }

    const away = direction.current === 1 ? -SLIDE_TO : SLIDE_TO
    const towards = direction.current === 1 ? SLIDE_FROM : -SLIDE_FROM

    // Opaque for every frame, and travelling the further of the two.
    arriving.animate([{ transform: `translateX(${towards}%)` }, { transform: 'none' }], {
      duration: SLIDE_MS,
      easing: SLIDE_EASING,
    })

    const fading = going.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translateX(${away}%)`, opacity: 0 },
      ],
      { duration: SLIDE_MS, easing: SLIDE_EASING, fill: 'both' },
    )

    // Hidden again when the fade ends *or* fails. An animation can be cancelled
    // by a second navigation landing on top of this one, and a screen left
    // visible would sit over the one the reader actually asked for.
    fading.finished.then(done, done)

    return () => {
      fading.cancel()
    }
  }, [leaving])

  // Navigating is the drawer's whole purpose, so arriving somewhere new is the
  // signal to close it — no link needs to remember to do it itself.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Escape closes; while open the page behind must not scroll under the
  // drawer, which on a phone is what makes an overlay feel like a stray layer
  // rather than a mode.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus moves into the drawer so a keyboard or screen-reader user lands on
    // it, and returns to the ☰ button on close rather than to the top of the
    // document.
    drawerRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <div className={styles.shell}>
      {/* Everything the drawer blurs sits inside this one wrapper. It has to
          be a sibling of the drawer, not its ancestor: a CSS `filter` makes an
          element a containing block for fixed-position descendants, so a
          drawer nested inside would be blurred along with the page. */}
      <div className={open ? `${styles.frame} ${styles.frameBlurred}` : styles.frame}>
        <header className={styles.topBar}>
          <button
            ref={triggerRef}
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="app-drawer"
            onClick={() => setOpen(true)}
          >
            <span className={styles.menuIcon} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>

          <span className={styles.brand}>Reading Buddy</span>

          {/* Balances the hamburger so the brand sits truly centred. */}
          <span className={styles.topBarSpacer} aria-hidden="true" />
        </header>

        <main className={styles.content} ref={contentRef}>
          {/*
            One wrapper per screen the reader has been to, all but one hidden.
            `hidden` rather than unmounting: the DOM, the decoded cover images
            and each screen's own state all survive, which is what makes coming
            back feel like coming back rather than like a reload. It also takes
            the hidden screens out of the accessibility tree and the tab order,
            so a screen reader sees exactly one page, as before.
          */}
          {[...screens.current].map(([path, screen]) => {
            const active = path === location.pathname
            // On screen but on its way out. Taken out of the flow so it can
            // cross over the arriving screen without the two stacking into a
            // page twice as long, and out of the accessibility tree and the tab
            // order because a screen reader has already been moved on.
            const going = !active && path === leaving
            return (
              <div
                key={path}
                // Which screen this is. Nothing in the app reads it; it is how
                // a test names a screen that is deliberately mid-transition and
                // therefore cannot be found by what is written on it.
                data-path={path}
                className={going ? `${styles.page} ${styles.pageLeaving}` : styles.page}
                // Only ever set on the screen on its way out, and only because
                // the two screens no longer share a scroll position — see
                // `leavingShift`.
                style={going ? { top: `calc(var(--space-5) + ${leavingShift.current}px)` } : undefined}
                hidden={!active && !going}
                data-active={active}
                data-leaving={going || undefined}
                aria-hidden={going || undefined}
                inert={going || undefined}
              >
                {/* So a kept screen can still tell when the reader has come
                    back to it, and re-read what it shows. Without this it would
                    hold its first answer for the life of the session — see
                    `screenActive.tsx`. */}
                <ScreenActiveProvider value={active}>{screen}</ScreenActiveProvider>
              </div>
            )
          })}
        </main>
      </div>

      <div
        className={open ? `${styles.scrim} ${styles.scrimOpen}` : styles.scrim}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <nav
        ref={drawerRef}
        id="app-drawer"
        className={open ? `${styles.drawer} ${styles.drawerOpen}` : styles.drawer}
        aria-label="Main"
        aria-hidden={!open}
        // Hidden from the tab order when closed, so a keyboard user doesn't
        // tab into links sitting off-screen.
        inert={!open}
        tabIndex={-1}
        // A drag inside the drawer belongs to the drawer, not to the page
        // behind it — see `useSwipeNav`.
        data-no-swipe=""
      >
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>Reading Buddy</span>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <ul className={styles.drawerList}>
          {DRAWER_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                // Without `end`, "/" matches every route and Home would be
                // highlighted while the reader is on Settings.
                end={link.to === '/'}
                // Still a real link — it keeps its `href`, so it is announced,
                // focused and activated as one. The click is taken over so the
                // move goes through the same `moveToTab` a swipe does: the
                // drawer and the swipe are one move by two routes, and Back must
                // not depend on which the reader reached for.
                onClick={(event) => {
                  // A modified click is a request to open it somewhere else,
                  // and that belongs to the browser.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  event.preventDefault()
                  moveToTab(link.to)
                }}
                className={({ isActive }) =>
                  isActive ? `${styles.drawerLink} ${styles.drawerLinkActive}` : styles.drawerLink
                }
              >
                <span className={styles.drawerIcon} aria-hidden="true">
                  {link.icon}
                </span>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
