/**
 * How hard the model thinks, and where that choice is kept.
 *
 * ## The seven levels are OpenRouter's, checked against its documentation
 *
 * `reasoning.effort` accepts `none`, `minimal`, `low`, `medium`, `high`,
 * `xhigh` and `max` — see
 * https://openrouter.ai/docs/use-cases/reasoning-tokens. Each one is a share of
 * the model's token budget: `max` and `xhigh` about 95%, `high` about 80%,
 * `medium` about 50%, `low` about 20%, `minimal` about 10%, and `none` turns
 * thinking off.
 *
 * An earlier version of this file offered three levels and said in its comment
 * that nothing existed above `high`. That was wrong, and it was wrong because
 * it was written from memory instead of from the documentation.
 *
 * Not every model honours every level. A provider that does not understand one
 * maps it to the nearest level it does have, so sending `max` to a model with
 * three settings is safe.
 *
 * The choice is remembered the same way the model pick is — in `localStorage`,
 * per reader, not per thread. It is a preference about how the tutor works, not
 * a property of one conversation.
 */

export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** In the order a sheet should offer them: least first, as a slider reads. */
export const EFFORTS: readonly Effort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/**
 * The default, and why it is the top one.
 *
 * Thinking is charged as output tokens, and every model offered by default is
 * free — so the usual reason to ration it does not apply. The relay defaults to
 * the same value, so a client that sends nothing still gets a thinking model.
 */
export const DEFAULT_EFFORT: Effort = 'max'

const EFFORT_KEY = 'reading-buddy:tutor-effort'

export function isEffort(value: unknown): value is Effort {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value)
}

/** What the reader last chose, or the default. */
export function storedEffort(): Effort {
  try {
    const said = localStorage.getItem(EFFORT_KEY)
    return isEffort(said) ? said : DEFAULT_EFFORT
  } catch {
    // Private mode, or storage disabled. A forgotten preference is a smaller
    // problem than a lamp that will not open.
    return DEFAULT_EFFORT
  }
}

export function rememberEffort(effort: Effort): void {
  try {
    localStorage.setItem(EFFORT_KEY, effort)
  } catch {
    /* see above */
  }
}

/**
 * The word as the composer shows it: "Max", "XHigh".
 *
 * `xhigh` is the one that does not simply capitalise — "Xhigh" reads as a typo,
 * and the wire value stays lower-case either way.
 */
export function effortLabel(effort: Effort): string {
  if (effort === 'xhigh') return 'XHigh'
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}
