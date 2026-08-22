/**
 * Which models the reader is offered, and which one is picked.
 *
 * `api/models.ts` hands back everything free and tool-capable. The choosing
 * happens here, because choosing is a judgment and judgments need tests —
 * `api/` is built separately from `web/` and nothing in it can have one.
 *
 * ## Why anything gets hidden at all
 *
 * "Free and tool-capable" is not the same as "can be a reading tutor". The
 * free roster is full of models built for one narrow job, and a narrow model
 * does not fail when you ask it something else — it answers confidently in the
 * wrong genre. Two real examples, both met while proving this out:
 *
 *   - `cohere/north-mini-code:free`, a coding agent, offered as a tutor.
 *   - `nvidia/nemotron-3.5-content-safety:free`, a safety classifier, which
 *     answered the prompt "say the word: ok" with "User Safety: safe".
 *
 * Neither returns an error. Both would put something in the tutor's bubble
 * that is not an explanation, and a reader who did not understand the passage
 * has no way to tell. So the picker hides them, and the hiding is tested.
 *
 * The filter is deliberately conservative. It removes models that *announce*
 * themselves as single-purpose, and keeps everything else. A general model
 * that happens to be poor at teaching is the reader's problem to notice and
 * switch away from; a classifier is not, because it does not look like a
 * failure.
 */

import { accessToken } from '../storage/cloud/client.ts'

export interface TutorModel {
  id: string
  name: string
  description: string
  contextLength: number
  /** True for Claude. The picker says so — the reader should know it costs. */
  paid?: boolean
}

/** Where the roster comes from. Overridable for a dev box, as with the relay. */
const MODELS_URL: string =
  (import.meta.env.VITE_MODELS_URL as string | undefined) ?? '/api/models'

/**
 * The model the lamp opens on when the reader has never chosen.
 *
 * A *preference*, not a constant: if this slug is not in today's roster the
 * picker falls through to the first fit model instead. That is the whole
 * reason it is written as a search rather than an assignment — the free roster
 * churns weekly and this name will eventually stop existing.
 *
 * It was `z-ai/glm-5.2:free`, which turned out to be a poor default twice
 * over: it is rate-limited upstream most of the time, and it is a reasoning
 * model that spends its token budget thinking and can return `content: null`
 * with the working-out in `reasoning`. An empty bubble is not an answer.
 */
export const PREFERRED_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free'

const PICK_KEY = 'reading-buddy:tutor-model'

/**
 * Words that mark a model as built for one job that is not this one.
 *
 * Matched against the name and description, not the slug — a slug is a product
 * name and can say anything, while the description is where a model says what
 * it is for.
 */
const NARROW = [
  'coding agent',
  'agentic coding',
  'code model',
  'content safety',
  'safety classifier',
  'guard model',
  'moderation',
  'embedding',
  'reranker',
  'text-to-speech',
  'speech recognition',
  'transcription',
]

/**
 * Whether a model is worth offering as a reading tutor.
 *
 * Exported for its tests, and read once per roster.
 */
export function fitForReading(model: TutorModel): boolean {
  // Claude is added by hand and is the one model we already know about.
  if (model.paid) return true

  const said = `${model.name} ${model.description}`.toLowerCase()
  if (NARROW.some((mark) => said.includes(mark))) return false

  // A tutor is handed a passage, a task module and the whole conversation so
  // far. Anything this small will start dropping the beginning of a thread
  // mid-explanation, which reads as the tutor losing the thread.
  return model.contextLength === 0 || model.contextLength >= 16_000
}

/**
 * The roster, filtered and ordered for the dropdown.
 *
 * Paid first because it is the deliberate choice and belongs where a reader
 * looking for it will find it. The rest keep OpenRouter's own order, which
 * puts newer models first — the closest thing to a quality signal the roster
 * carries, and better than sorting by a name nobody chose.
 */
export function offerable(rows: readonly TutorModel[]): TutorModel[] {
  const fit = rows.filter(fitForReading)
  return [...fit.filter((row) => row.paid), ...fit.filter((row) => !row.paid)]
}

/**
 * Which model to open on, given today's roster and what the reader last chose.
 *
 * The stored pick wins, but only if it is still on the roster. A delisted
 * favourite must not be sent to the relay — it would fail every request until
 * the reader thought to change a setting they do not remember setting.
 */
export function chosenFrom(rows: readonly TutorModel[], stored: string | null): string | undefined {
  if (stored && rows.some((row) => row.id === stored)) return stored
  if (rows.some((row) => row.id === PREFERRED_MODEL)) return PREFERRED_MODEL
  return rows[0]?.id
}

/** What the reader last picked, or nothing. */
export function storedPick(): string | null {
  try {
    return localStorage.getItem(PICK_KEY)
  } catch {
    // Private mode, or storage disabled. A forgotten preference is a smaller
    // problem than a lamp that will not open.
    return null
  }
}

export function rememberPick(id: string): void {
  try {
    localStorage.setItem(PICK_KEY, id)
  } catch {
    /* see above */
  }
}

/**
 * The roster, fetched once and kept for the session.
 *
 * In memory rather than in the database: it is a menu, not the reader's work,
 * and a stale menu offering a delisted model is worse than one refetch on the
 * next launch.
 */
let cached: Promise<TutorModel[]> | undefined

export async function loadModels(): Promise<TutorModel[]> {
  cached ??= (async () => {
    const token = await accessToken()
    const response = await fetch(MODELS_URL, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error(`the model list answered ${response.status}`)
    const data = (await response.json()) as { models?: TutorModel[] }
    return offerable(data.models ?? [])
  })().catch((error: unknown) => {
    // A failed fetch must not poison the cache — the reader may simply have
    // been offline when the lamp first opened, and the next try should work.
    cached = undefined
    throw error
  })

  return cached
}

/** For tests, which must not inherit one another's roster. */
export function forgetModels(): void {
  cached = undefined
}
