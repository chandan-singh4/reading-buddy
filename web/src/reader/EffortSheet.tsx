/**
 * How hard the model thinks, chosen from a sheet.
 *
 * ## Why this exists at all
 *
 * A reasoning model can be told how much of its budget to spend thinking before
 * it answers. OpenRouter takes `low`, `medium` or `high` and translates each
 * into whatever the provider underneath calls it. There is no level above
 * `high`, so `high` is what "as much as it will give" means.
 *
 * The default is `high` everywhere, which is the opposite of the usual advice.
 * The usual advice is about money: thinking is billed as output tokens. Every
 * model this app offers by default is free, so the reason to ration it is not
 * there — and a reader asking what a paragraph of Jung means is better served
 * by a model that thinks first.
 *
 * The control is drawn anyway, and for two reasons. A paid model spends the
 * reader's own money and they should be able to turn it down. And thinking is
 * slow: `low` is the setting for a reader who wants a definition now, not a
 * considered essay in forty seconds.
 */

import { Sheet } from './Sheet.tsx'
import { EFFORTS, type Effort } from './effort.ts'

export interface EffortSheetProps {
  pick: Effort
  /** True when the current model charges. It changes what the note says. */
  paid?: boolean
  onPick: (effort: Effort) => void
  onClose: () => void
}

const NOTES: Record<Effort, string> = {
  low: 'Answers fastest. Little or no thinking first.',
  medium: 'A middle setting.',
  high: 'Thinks the longest before it answers.',
}

export function EffortSheet({ pick, paid, onPick, onClose }: EffortSheetProps) {
  return (
    <Sheet
      title="How hard it thinks"
      rows={EFFORTS.map((effort) => ({
        id: effort,
        name: effort.charAt(0).toUpperCase() + effort.slice(1),
        // Only worth saying where it is true. On a free model the top setting
        // costs nothing, and telling the reader otherwise would be a lie.
        ...(effort === 'high' && paid ? { tag: 'costs more' } : {}),
        note: NOTES[effort],
      }))}
      pick={pick}
      onPick={(id) => onPick(id as Effort)}
      onClose={onClose}
    />
  )
}
