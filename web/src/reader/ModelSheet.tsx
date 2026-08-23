/**
 * Which model answers, chosen from a grid inside the sheet.
 *
 * This file is the joint between two things that each know half the job:
 * `Sheet` owns the furniture — the scrim, the escape key, the dark card, the
 * Cancel button — and `ModelGrid` owns the three columns and the dragging. All
 * that is left here is the one line of explanation above the grid, which earns
 * its place because the grid is doing something no picker usually does.
 *
 * The hint is short on purpose. It says what the layout *means* rather than how
 * to work it: a reader who does not know they can drag still gets a working
 * picker, and one who wonders why the models are in boxes gets an answer.
 */

import { Sheet } from './Sheet.tsx'
import { ModelGrid } from './ModelGrid.tsx'
import type { Column } from './models.ts'
import styles from './ModelSheet.module.css'

export interface ModelSheetProps {
  columns: readonly Column[]
  /** The current choice. Absent means none is. */
  pick?: string
  onPick: (id: string) => void
  /** Called with the whole new layout whenever the reader moves something. */
  onArrange: (columns: Column[]) => void
  onClose: () => void
}

export function ModelSheet({ columns, pick, onPick, onArrange, onClose }: ModelSheetProps) {
  return (
    <Sheet title="Which model answers" onClose={onClose}>
      <p className={styles.hint}>
        Your pick is tried first, then across the columns. Hold a model to move it.
      </p>
      <ModelGrid columns={columns} pick={pick} onPick={onPick} onArrange={onArrange} />
    </Sheet>
  )
}
