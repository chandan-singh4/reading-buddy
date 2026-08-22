/**
 * How hard the model thinks, and where that choice is kept.
 *
 * The value is one of three words OpenRouter understands. It is remembered the
 * same way the model pick is — in `localStorage`, per reader, not per thread:
 * it is a preference about how the tutor works, not a property of one
 * conversation.
 */

export type Effort = 'low' | 'medium' | 'high'

/** In the order a sheet should offer them: least first, as a slider reads. */
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high']

/**
 * The default, and why it is the top one.
 *
 * Thinking is charged as output tokens, and every model offered by default is
 * free — so the usual reason to ration it does not apply. The relay defaults to
 * the same value, so a client that sends nothing still gets a thinking model.
 */
export const DEFAULT_EFFORT: Effort = 'high'

const EFFORT_KEY = 'reading-buddy:tutor-effort'

export function isEffort(value: unknown): value is Effort {
  return value === 'low' || value === 'medium' || value === 'high'
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

/** The word as the composer shows it: "Effort: high". */
export function effortLabel(effort: Effort): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}
