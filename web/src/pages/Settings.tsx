import styles from './page.module.css'

/**
 * Placeholder. Each item below is owned by a later waypoint; listing them keeps
 * the route honest rather than shipping an empty screen that looks broken.
 */
export default function Settings() {
  return (
    <>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.lede}>
        Nothing to configure yet. The app follows your device’s light or dark
        setting for now.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Coming</h2>
        <div className={styles.card}>
          <ul>
            <li>Appearance — day/night and reading type size (WP-14)</li>
            <li>Read-aloud voice (WP-16)</li>
            <li>Cost and usage (WP-27)</li>
            <li>Google Drive backup, off by default (WP-33)</li>
          </ul>
        </div>
      </section>
    </>
  )
}
