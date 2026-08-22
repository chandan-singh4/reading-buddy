/**
 * Which model answers, chosen from a sheet.
 *
 * The sheet itself is `Sheet.tsx`. This file knows only what a model is: its
 * name, the fallback name when the roster gave none, and the one thing the
 * reader must see before they tap rather than after — that a choice costs
 * money.
 */

import { Sheet } from './Sheet.tsx'
import { modelLabel } from './tutor.ts'
import type { TutorModel } from './models.ts'

export interface ModelSheetProps {
  models: readonly TutorModel[]
  /** The current choice, ticked. Absent means none is. */
  pick?: string
  onPick: (id: string) => void
  onClose: () => void
}

export function ModelSheet({ models, pick, onPick, onClose }: ModelSheetProps) {
  return (
    <Sheet
      title="Which model answers"
      rows={models.map((row) => ({
        id: row.id,
        name: row.name || modelLabel(row.id),
        ...(row.paid ? { tag: 'paid' } : {}),
      }))}
      pick={pick}
      onPick={onPick}
      onClose={onClose}
    />
  )
}
