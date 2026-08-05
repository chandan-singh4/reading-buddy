import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import styles from './AppShell.module.css'

const DRAWER_LINKS: { to: string; label: string; icon: string }[] = [
  { to: '/library', label: 'All Books', icon: '▤' },
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
          <Outlet />
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
