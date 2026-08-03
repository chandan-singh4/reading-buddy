import { NavLink, Outlet } from 'react-router'

import styles from './AppShell.module.css'

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/stats', label: 'Stats' },
  { to: '/journal', label: 'Journal' },
  { to: '/settings', label: 'Settings' },
]

/**
 * The chrome around Home, Stats, Journal and Settings: a scrolling content
 * area plus a bottom tab bar, which is where thumbs actually reach on a
 * phone. The full catalogue (`/library` — search, import, delete) is reached
 * from Home rather than from its own tab; it's a destination, not a place a
 * reader starts from.
 *
 * The Reader deliberately renders outside this shell — reading should be
 * full-bleed, with navigation appearing only on tap (WP-13).
 */
export default function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>

      <nav className={styles.tabs} aria-label="Main">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
