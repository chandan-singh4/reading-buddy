import type { PeriodGoal } from './goal.ts'
import styles from './stats.module.css'

/**
 * The period's target, drawn as one bar.
 *
 * Green when the target is met, amber while it is in progress — the screen's
 * existing key, where green is a completed thing and amber is time in motion.
 * No red anywhere: a missed reading target is not an error.
 *
 * The bar is clamped at full while the caption keeps the true percent, so a
 * 3-hour day reads "150%" without drawing a bar that leaves the card.
 */
export default function PeriodGoalCard({ goal }: { goal: PeriodGoal }) {
  return (
    <div className={`${styles.goal} ${goal.met ? styles.goalMet : ''}`}>
      <div className={styles.goalTop}>
        <span className={styles.goalTitle}>{goal.title}</span>
        <span className={styles.goalFrac}>{goal.progress}</span>
      </div>
      <div
        className={styles.goalBar}
        role="progressbar"
        aria-valuenow={Math.min(goal.percent, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={goal.title}
      >
        <i style={{ width: `${Math.min(goal.percent, 100)}%` }} />
      </div>
      <div className={styles.goalNote}>
        <b>{goal.percent}%</b> · {goal.status}
      </div>
    </div>
  )
}
