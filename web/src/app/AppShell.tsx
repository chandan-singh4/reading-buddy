import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { PAGE_ORDER, useSwipeNav } from './useSwipeNav.ts'
import styles from './AppShell.module.css'

/**
 * The drawer, in the same order a swipe moves through them.
 *
 * Home is in the list now. It was deliberately left out when the drawer was
 * built — the reasoning being that Home is the screen the ☰ is sitting on — but
 * that stopped being true the moment swiping made Home one page among four. A
 * reader who swipes to Settings and opens the drawer to go back needs Home to
 * be *in* it; "swipe right three times" is not a way home.
 */
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
  const location = useLocation()
  const drawerRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useSwipeNav()

  /**
   * Which way the last move went, so the arriving screen slides in from the
   * side it came from.
   *
   * Held in a ref rather than state: it is read during render to pick a class
   * and is never itself a reason to re-render. `previous` starts as the current
   * path, so the first paint of a session has no direction and doesn't animate
   * — a screen sliding in when the app opens looks like a glitch, not a
   * transition.
   */
  const previous = useRef(location.pathname)
  const from = PAGE_ORDER.indexOf(previous.current)
  const to = PAGE_ORDER.indexOf(location.pathname)
  const direction = from === -1 || to === -1 || from === to ? 0 : Math.sign(to - from)
  previous.current = location.pathname

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

        <main className={styles.content}>
          {/*
            Keyed on the path so React rebuilds the subtree on every move,
            which is what restarts the animation — without the key the same
            element is reused and the CSS never re-runs. It also means each
            screen mounts fresh, so the library isn't holding cover blobs open
            while the reader is on Settings.
          */}
          <div
            key={location.pathname}
            className={
              direction === 0
                ? styles.page
                : `${styles.page} ${direction > 0 ? styles.pageFromRight : styles.pageFromLeft}`
            }
          >
            <Outlet />
          </div>
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
                // The drawer and the swipe must not disagree about what kind of
                // move this is: both cross *within* one level, so neither adds
                // a history entry. See "why a swipe replaces" in
                // `useSwipeNav.ts` — Back has to mean "leave these four", not
                // "undo the last one of them I looked at".
                replace
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
