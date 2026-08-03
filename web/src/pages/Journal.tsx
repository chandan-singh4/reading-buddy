import styles from './page.module.css'

/**
 * Placeholder, like `Settings.tsx` before it — honest about what's not built
 * yet rather than shipping an empty screen that looks broken. Saving a quote
 * from the reading screen is the next piece; once it exists this screen stops
 * being empty on its own.
 */
export default function Journal() {
  return (
    <>
      <h1 className={styles.title}>Journal</h1>
      <p className={styles.lede}>
        Save a quote while reading, and find it again here, filed by book.
      </p>

      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No quotes saved yet</p>
        <p>Saving a passage while you read is coming next.</p>
      </div>
    </>
  )
}
