import { NavLink, Outlet } from 'react-router'

import styles from './AppShell.module.css'

/**
 * The chrome around Library and Settings: a scrolling content area plus a
 * bottom tab bar, which is where thumbs actually reach on a phone.
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
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
          }
        >
          Library
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
          }
        >
          Settings
        </NavLink>
      </nav>
    </div>
  )
}
