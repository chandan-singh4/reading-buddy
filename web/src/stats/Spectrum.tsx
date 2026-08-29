import { hourName, windowName, type Circadian } from './circadian.ts'
import styles from './stats.module.css'

/**
 * The hours of the day, and how much reading fell in each.
 *
 * Twenty-four bars, midnight to midnight. It answers a question none of the
 * other cards do: not how much the reader read, but *when* — which is the part
 * of a reading habit a person can actually move.
 *
 * Bars are drawn against the busiest hour, not against the target. The shape of
 * a night reader and the shape of a morning reader should look the same at
 * their own scale; this card is about the shape, not the size.
 */
export default function Spectrum({ data }: { data: Circadian }) {
  const busiest = Math.max(...data.hours.map((h) => h.minutes), 1)

  return (
    <div className={styles.spectrum}>
      <div className={styles.specTop}>
        <span className={styles.cardLabel}>Focus window</span>
        {data.peak !== undefined && (
          <span className={styles.specPeak}>
            {windowName(data.peak.from, data.peak.to)}
          </span>
        )}
      </div>

      <div className={styles.specBars}>
        {data.hours.map((hour) => (
          <div className={styles.specCol} key={hour.hour}>
            <i
              className={styles[hour.level]}
              style={{
                // A floor of 2%, so an hour with no reading is still a tick on
                // the axis rather than a gap in it.
                height: `${Math.max((hour.minutes / busiest) * 100, 2)}%`,
              }}
              aria-label={`${hourName(hour.hour)}, ${hour.minutes} minutes`}
            />
          </div>
        ))}
      </div>

      <div className={styles.specAxis} aria-hidden="true">
        <span>12 am</span>
        <span>6 am</span>
        <span>12 pm</span>
        <span>6 pm</span>
        <span>11 pm</span>
      </div>

      <div className={styles.specNote}>
        {data.peak === undefined ? (
          'No reading in this period yet.'
        ) : (
          <>
            <b>{data.peak.percent}%</b> of this period’s reading happened between{' '}
            {windowName(data.peak.from, data.peak.to)}.
          </>
        )}
      </div>
    </div>
  )
}
