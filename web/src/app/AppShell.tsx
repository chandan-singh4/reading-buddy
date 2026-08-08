import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useOutlet } from 'react-router'

import { prefersReducedMotion } from '../reader/motion.ts'
import { useViewLocation } from './routeTransition.tsx'
import { ScreenActiveProvider } from './screenActive.tsx'
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

  /**
   * The arriving screen slides in from the side it came from.
   *
   * Driven from JavaScript rather than a CSS class now, and that follows
   * directly from the change above: a CSS animation restarts when its element
   * is created, and these elements are no longer created — they are revealed.
   * `animate()` runs on demand, which is what "revealed" needs.
   *
   * A layout effect, so the move starts in the same frame the screen appears
   * in; in an ordinary effect the screen paints in place first and then jumps
   * back to start sliding.
   */
  const previous = useRef(location.pathname)
  useLayoutEffect(() => {
    const from = PAGE_ORDER.indexOf(previous.current)
    const to = PAGE_ORDER.indexOf(location.pathname)
    previous.current = location.pathname

    // No direction to show: the first paint of a session, or arriving from a
    // book. A screen sliding in at launch reads as a glitch, not a transition.
    if (from === -1 || to === -1 || from === to) return
    if (prefersReducedMotion()) return

    const node = contentRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    // Absent in jsdom, which has no Web Animations API. The navigation itself
    // does not depend on this, so there is nothing to fall back to.
    if (!node || typeof node.animate !== 'function') return

    node.animate(
      [{ transform: `translateX(${to > from ? SLIDE_FROM : -SLIDE_FROM}%)` }, { transform: 'none' }],
      { duration: SLIDE_MS, easing: SLIDE_EASING },
    )
  }, [location.pathname])

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
            return (
              <div key={path} className={styles.page} hidden={!active} data-active={active}>
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
