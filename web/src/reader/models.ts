/**
 * Which models the reader is offered, how they are arranged, and which one is
 * picked.
 *
 * `api/models.ts` hands back everything that answers, tagged with the provider
 * that served it. The choosing and the ordering happen here, because both are
 * judgments and judgments need tests — `api/` is built separately from `web/`
 * and nothing in it can have one.
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
 *
 * ## The picker is the chain, drawn
 *
 * The three columns of the picker are not decoration. They are the fallback
 * order, laid out so it can be read rather than explained: the chain takes the
 * top of each column, left to right, then the second of each, and so on. A
 * reader who picks Google's best and gets an answer from Groq can look at the
 * grid and see exactly which two models declined on the way.
 *
 * That is why the reader can rearrange it. Dragging a model up its column, or
 * dragging a whole column left, is not a display preference — it *is* editing
 * the fallback chain. `arrange` applies what they chose and `chainFrom` reads
 * the chain back out of it.
 */

import { accessToken } from '../storage/cloud/client.ts'

/** Who serves a model. One column of the picker per provider. */
export type Provider = 'gemini' | 'openrouter' | 'groq'

/** The columns as they ship, before the reader moves any. */
export const PROVIDERS: readonly Provider[] = ['gemini', 'openrouter', 'groq']

/** What each column is called above the reader's head. */
export const PROVIDER_NAME: Record<Provider, string> = {
  gemini: 'Google',
  openrouter: 'OpenRouter',
  groq: 'Groq',
}

export interface TutorModel {
  id: string
  name: string
  description: string
  contextLength: number
  source: Provider
  /**
   * The relay probed it and it was alive but unwilling — rate-limited, or its
   * upstream was having a bad minute. Kept, because a single refusal is not
   * proof of death: probing the same roster twice, minutes apart, disagreed on
   * three models. Ranked last within its column, and shown as busy, so the
   * reader is not surprised when the chain steps past it.
   */
  busy?: boolean
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
 * reason it is written as a search rather than an assignment — the roster
 * churns and this name will eventually stop existing.
 *
 * It is Gemini's fastest current Flash. Two earlier defaults taught what to
 * avoid: `z-ai/glm-5.2:free` is rate-limited upstream most of the time, and it
 * is a reasoning model that can spend its whole budget thinking and return
 * `content: null` with the working-out in `reasoning`. An empty bubble is not
 * an answer.
 */
export const PREFERRED_MODEL = 'gemini-3.7-flash'

const PICK_KEY = 'reading-buddy:tutor-model'
const ORDER_KEY = 'reading-buddy:tutor-order'
const ROSTER_KEY = 'reading-buddy:tutor-roster'

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
 * How big a model says it is, in billions of parameters.
 *
 * ## What the rosters actually give us
 *
 * Not a benchmark score. None of the three providers publishes a field that
 * ranks one model against another on knowledge or reasoning. There is nothing
 * to sort by, so an order has to be inferred.
 *
 * The one real signal is the **parameter count in the model's own name**:
 * `nemotron-3-super-120b-a12b`, `gemma-4-31b-it`, `gpt-oss-120b`. Size is a
 * coarse proxy for how much a model knows, and knowing things is most of what
 * a reading tutor does.
 *
 * Two rules, both from how vendors name things:
 *
 *   - The **largest** number wins. A mixture-of-experts model writes both its
 *     total and its active size (`120b-a12b`); the total is the one that tracks
 *     what it has read.
 *   - `k` and `m` suffixes are ignored. They are context windows and token
 *     counts, never parameter counts.
 */
export function sizeOf(model: TutorModel): number {
  const said = `${model.id} ${model.name}`.toLowerCase()
  let largest = 0
  for (const [, digits] of said.matchAll(/(\d+(?:\.\d+)?)\s?b(?![a-z0-9])/g)) {
    largest = Math.max(largest, Number(digits))
  }
  return largest
}

/**
 * What a model with no size in its name is assumed to be worth.
 *
 * Plenty of good models never state a size — every Gemini, `glm-5.2`,
 * `deepseek-chat`. Three shabby options and one reasonable one: rank them last
 * (which would bury Gemini's whole column under any 8B that happens to say so),
 * rank them first (which would do the reverse), or give them a middle value and
 * let the ones that *do* announce themselves as large sort above them. This is
 * that middle value.
 *
 * Deliberately not tuned. It is a placeholder for a missing fact, and the day a
 * provider publishes a real quality signal it should be deleted, not adjusted.
 */
export const ASSUMED_SIZE = 70

/**
 * What a family name is worth when the number is missing.
 *
 * Gemini names a tier rather than a size, and the tiers are genuinely ordered —
 * a Flash outranks a Flash-Lite, and a newer generation outranks an older one.
 * Throwing that away and giving the whole column `ASSUMED_SIZE` would leave the
 * order inside it arbitrary, which is the one thing the grid must not be: the
 * reader is meant to read the chain off it.
 *
 * These are nudges around `ASSUMED_SIZE`, not claims about parameter counts.
 * They only ever decide ties between models that state no size at all.
 */
const TIERS: [RegExp, number][] = [
  [/\bpro\b/, 30],
  [/flash-lite|flash lite/, -20],
  [/\blite\b/, -20],
  [/\bmini\b|\bnano\b|\bsmall\b/, -15],
  [/\bflash\b/, 0],
]

function tier(model: TutorModel): number {
  const said = `${model.id} ${model.name}`.toLowerCase()
  // Generation, where the name carries one: Gemini 3.7 should sit above 3.5,
  // and both above 2.5. A tenth of a point per version keeps this smaller than
  // any tier gap, so a newer Lite never outranks an older full Flash.
  const [, version] = said.match(/\b(\d+(?:\.\d+)?)\b/) ?? []
  const age = Number(version) || 0

  for (const [mark, weight] of TIERS) {
    if (mark.test(said)) return weight + age / 10
  }
  return age / 10
}

/**
 * How a model ranks inside its own column. Bigger sorts first.
 *
 * Busy models drop below everything else regardless of size. A 550B that will
 * not answer is worth less to the reader than a 9B that will, and burying it is
 * the whole reason it was kept rather than dropped.
 */
export function strength(model: TutorModel): number {
  if (model.paid) return Number.POSITIVE_INFINITY
  const stated = sizeOf(model)
  const rank = stated > 0 ? stated : ASSUMED_SIZE + tier(model)
  return model.busy ? rank - 10_000 : rank
}

/**
 * The roster, filtered and ranked, before the reader has moved anything.
 *
 * The sort is **stable**, which is the point of using one sort rather than
 * bucketing: models of equal stated size keep the provider's own order, which
 * puts newer first. So the ordering reads as "biggest, and newest among
 * equals" — and never as an alphabet nobody chose.
 */
export function offerable(rows: readonly TutorModel[]): TutorModel[] {
  return rows.filter(fitForReading).sort((a, b) => strength(b) - strength(a))
}

/**
 * How the reader has arranged the picker.
 *
 * Stored as ids and provider names rather than as whole models, because the
 * roster changes underneath it. An arrangement is a set of preferences about
 * things that may or may not still exist, and `arrange` is what reconciles the
 * two.
 */
export interface Arrangement {
  /** The column order, left to right. */
  columns: Provider[]
  /** Within each column, the reader's own ranking, best first. */
  rows: Partial<Record<Provider, string[]>>
}

export const DEFAULT_ARRANGEMENT: Arrangement = { columns: [...PROVIDERS], rows: {} }

/** The picker's columns: a provider, and the models under it in order. */
export interface Column {
  source: Provider
  models: TutorModel[]
}

/**
 * Today's roster, laid out the way the reader left it.
 *
 * ## Reconciling a saved order with a roster that moved
 *
 * Both halves of the arrangement name things that can vanish or appear, so both
 * are treated the same way: what the reader ranked keeps the rank they gave it,
 * and everything else falls in behind in the ranking this file would have
 * chosen anyway.
 *
 * This matters more than it sounds. A reader who drags one model to the top of
 * a column has expressed an opinion about *that model*, not about the eleven
 * below it — so a new model appearing next week must not be silently promoted
 * above it, and must not be hidden either. Appending unranked models in
 * `strength` order does both.
 *
 * A saved column that no provider serves any more is dropped, and a provider
 * the arrangement never heard of is appended. That is what happens the first
 * time a fourth provider is added, and it must not need a migration.
 */
export function arrange(
  rows: readonly TutorModel[],
  order: Arrangement = DEFAULT_ARRANGEMENT,
): Column[] {
  const ranked = offerable(rows)

  const named = order.columns.filter((source) => PROVIDERS.includes(source))
  const columns = [...named, ...PROVIDERS.filter((source) => !named.includes(source))]

  return columns
    .map((source) => {
      const mine = ranked.filter((row) => row.source === source)
      const wanted = order.rows[source] ?? []

      const chosen = wanted
        .map((id) => mine.find((row) => row.id === id))
        .filter((row): row is TutorModel => row !== undefined)

      const rest = mine.filter((row) => !chosen.includes(row))
      return { source, models: [...chosen, ...rest] }
    })
    .filter((column) => column.models.length > 0)
}

/**
 * The models to try, in order: the reader's pick, then across the columns.
 *
 * ## The complaint this answers, and the one after it
 *
 * The reader chose GLM 5.2 and kept being answered by Nemotron. The pick was
 * being honoured — GLM was simply refusing, and the relay fell through to a
 * **fixed list** written into the server, which had nothing to do with the
 * roster in front of the reader. So the fallback was arbitrary.
 *
 * Making it "the strongest others" fixed that and left a subtler problem: the
 * strongest others were often the *same provider's* other models. When a
 * provider is rate-limited, its whole column is rate-limited, so a chain that
 * stays in one column can burn every rung on one bad minute at one company.
 *
 * So the chain goes **across** the columns rather than down one. Pick first,
 * then the top of each other column in turn, then the second of each, and so
 * on. One provider having a bad minute now costs one rung, not all of them.
 *
 * It is also the reason the picker is a grid: this order is exactly what the
 * grid looks like, read left to right and then down. The reader does not have
 * to be told what the fallback is — they can see it.
 */
export const MAX_CHAIN = 6

export function chainFrom(columns: readonly Column[], pick: string | undefined): TutorModel[] {
  const chain: TutorModel[] = []

  const picked = columns.flatMap((column) => column.models).find((row) => row.id === pick)
  if (picked) chain.push(picked)

  /*
   * The rotation starts at the pick's own column, not at the one after it.
   *
   * That looks wrong for a moment and is the only order that reads correctly
   * off the grid. The pick is skipped wherever it appears, so starting on its
   * column still sends the first fallback to a different provider — but it
   * keeps every later pass in the grid's own left-to-right order, so the second
   * rung of the pick's column comes round in its proper place. Starting one
   * column later instead pushes it to the end of every pass, and the reader
   * looking at the grid would count the chain wrongly.
   */
  const from = picked ? columns.findIndex((column) => column.source === picked.source) : 0
  const rotated = columns.map((_, at) => columns[(from + at) % columns.length])

  const deepest = Math.max(0, ...rotated.map((column) => column.models.length))
  for (let rank = 0; rank < deepest && chain.length < MAX_CHAIN; rank += 1) {
    for (const column of rotated) {
      const row = column.models[rank]
      if (!row || row.id === pick) continue
      chain.push(row)
      if (chain.length >= MAX_CHAIN) break
    }
  }

  return chain
}

/** The chain as the relay wants it: id and provider, nothing else. */
export function stepsFrom(
  columns: readonly Column[],
  pick: string | undefined,
): { id: string; source: Provider }[] {
  return chainFrom(columns, pick).map((row) => ({ id: row.id, source: row.source }))
}

/**
 * Which model to open on, given today's roster and what the reader last chose.
 *
 * The stored pick wins, but only if it is still on the roster. A delisted
 * favourite must not be sent to the relay — it would fail every request until
 * the reader thought to change a setting they do not remember setting.
 *
 * With no stored pick it is the preferred model, and failing that the head of
 * the chain — which, now that the reader arranges the grid, is whatever they
 * put in the top-left corner.
 */
export function chosenFrom(columns: readonly Column[], stored: string | null): string | undefined {
  const all = columns.flatMap((column) => column.models)
  if (stored && all.some((row) => row.id === stored)) return stored
  if (all.some((row) => row.id === PREFERRED_MODEL)) return PREFERRED_MODEL
  return columns[0]?.models[0]?.id
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
 * The arrangement the reader last left, or the default.
 *
 * Parsed defensively. This is the one stored value that is a structure rather
 * than a string, so a half-written or hand-edited entry is possible, and the
 * cost of trusting one is a picker that throws on open.
 */
export function storedArrangement(): Arrangement {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return DEFAULT_ARRANGEMENT

    const said = JSON.parse(raw) as Partial<Arrangement>
    const columns = Array.isArray(said.columns)
      ? said.columns.filter((source): source is Provider => PROVIDERS.includes(source))
      : []

    const rows: Arrangement['rows'] = {}
    for (const source of PROVIDERS) {
      const ids = said.rows?.[source]
      if (Array.isArray(ids)) rows[source] = ids.filter((id) => typeof id === 'string')
    }

    return { columns: columns.length > 0 ? columns : [...PROVIDERS], rows }
  } catch {
    return DEFAULT_ARRANGEMENT
  }
}

export function rememberArrangement(order: Arrangement): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    /* see above */
  }
}

/** The arrangement that the columns as drawn represent. */
export function arrangementOf(columns: readonly Column[]): Arrangement {
  const rows: Arrangement['rows'] = {}
  for (const column of columns) rows[column.source] = column.models.map((row) => row.id)
  return { columns: columns.map((column) => column.source), rows }
}

/**
 * The roster the reader saw last time, ready before the network answers.
 *
 * The fetch takes three or four seconds behind a sign-in, and for all of that
 * time the model and effort controls were simply absent — the lamp opened
 * without them and they appeared later, moving everything under the reader's
 * thumb. A menu is exactly the kind of thing worth keeping: the reader's own
 * pick has always been remembered, so remembering what it was picked *from*
 * costs nothing new.
 *
 * Only ever a first draft. The live roster replaces it the moment it lands, so
 * a model that has since been delisted is offered for a few seconds at most —
 * and asking for one the relay no longer has walks to the next rung anyway.
 */
export function lastRoster(): TutorModel[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY)
    if (!raw) return []
    const rows: unknown = JSON.parse(raw)
    if (!Array.isArray(rows)) return []
    // Enough of a check to keep hand-edited or half-written storage from
    // reaching `arrange`. Everything else it needs, it filters for itself.
    return rows.filter(
      (row): row is TutorModel =>
        typeof row === 'object' && row !== null && typeof (row as TutorModel).id === 'string',
    )
  } catch {
    return []
  }
}

export function rememberRoster(rows: readonly TutorModel[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(rows))
  } catch {
    /* Private mode, or full. The lamp works without it, one wait longer. */
  }
}

/**
 * The roster, fetched once and kept for the session.
 *
 * In memory rather than in the database: it is a menu, not the reader's work,
 * and a stale menu offering a delisted model is worse than one refetch on the
 * next launch. `lastRoster` above is what fills the gap while this runs.
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
    const rows = (data.models ?? []).filter(fitForReading)
    // Kept for the next launch, so the controls are there from the first paint.
    rememberRoster(rows)
    return rows
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
