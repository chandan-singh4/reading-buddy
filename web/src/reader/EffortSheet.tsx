/**
 * How hard the model thinks, chosen from a sheet.
 *
 * ## Why this exists at all
 *
 * A reasoning model can be told how much of its budget to spend thinking before
 * it answers. OpenRouter takes seven words — `none` through `max` — and
 * translates each into whatever the provider underneath calls it. The list and
 * the shares behind it are in `effort.ts`, which cites the documentation.
 *
 * The default is `max` everywhere, which is the opposite of the usual advice.
 * The usual advice is about money: thinking is billed as output tokens. Every
 * model this app offers by default is free, so the reason to ration it is not
 * there — and a reader asking what a paragraph of Jung means is better served
 * by a model that thinks first.
 *
 * The control is drawn anyway, and for two reasons. A paid model spends the
 * reader's own money and they should be able to turn it down. And thinking is
 * slow: `none` is the setting for a reader who wants a definition now, not a
 * considered essay in forty seconds.
 */

import { Sheet } from './Sheet.tsx'
import { EFFORTS, effortLabel, type Effort } from './effort.ts'

export interface EffortSheetProps {
  pick: Effort
  /** True when the current model charges. It changes what the note says. */
  paid?: boolean
  onPick: (effort: Effort) => void
  onClose: () => void
}

/**
 * What each level means, in the reader's terms rather than in percentages.
 *
 * The share of the budget is the true description, and it is useless here: a
 * reader choosing a setting wants to know how long they will wait and how
 * careful the answer will be.
 */
const NOTES: Record<Effort, string> = {
  none: 'No thinking first. The fastest answer.',
  minimal: 'A moment of thought, then an answer.',
  low: 'Answers fast. It thinks only a little.',
  medium: 'A middle setting.',
  high: 'Thinks hard before it answers.',
  xhigh: 'Nearly all its budget goes to thinking.',
  max: 'The most thinking it will do. The slowest.',
}

/** The levels where a paid model spends noticeably more of the reader's money. */
const DEAR: readonly Effort[] = ['high', 'xhigh', 'max']

export function EffortSheet({ pick, paid, onPick, onClose }: EffortSheetProps) {
  return (
    <Sheet
      title="How hard it thinks"
      rows={EFFORTS.map((effort) => ({
        id: effort,
        name: effortLabel(effort),
        // Only worth saying where it is true. On a free model the top setting
        // costs nothing, and telling the reader otherwise would be a lie.
        ...(paid && DEAR.includes(effort) ? { tag: 'costs more' } : {}),
        note: NOTES[effort],
      }))}
      pick={pick}
      onPick={(id) => onPick(id as Effort)}
      onClose={onClose}
    />
  )
}
