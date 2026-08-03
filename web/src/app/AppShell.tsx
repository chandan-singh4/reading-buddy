import { NavLink, Outlet } from 'react-router'

import styles from './AppShell.module.css'

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/library', label: 'All Books' },
  { to: '/stats', label: 'Stats' },
  { to: '/settings', label: 'Settings' },
]

/**
 * The chrome around Home, All Books, Stats and Settings: a scrolling content
 * area plus a bottom tab bar, which is where thumbs actually reach on a
 * phone. Home's "See all books" link still points at the same `/library`
 * route this tab does — both reach the full catalogue, one from the curated
 * front door and one directly.
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
