/**
 * The tutor's vocabulary — what a passage is, what a message is, and how the
 * app talks to the model.
 *
 * ## The anchor is a quote, not a pair of offsets
 *
 * The design brief describes a passage as `locationId + startOffset +
 * endOffset`. This app deliberately does not store offsets anywhere, and the
 * tutor follows the house rule rather than the brief's sketch: a passage is
 * the paragraph's anchor plus the exact words (`excerpt`), re-found on the
 * page with `rangeOfQuote` whenever it has to be drawn. Offsets die the first
 * time the parser re-runs or the font changes; the words survive both. The
 * brief allows exactly this — "adapt to the app's own selection model".
 *
 * ## The AI call is one function
 *
 * `askTutor` is the only place the network is touched. It posts to
 * `api/tutor.ts`, which holds both the key and every word of the system
 * prompt — nothing about the tutor's voice is in this bundle, and nothing
 * above this file knows which provider answered.
 *
 * When the relay cannot be reached, the reply is a canned line that *says it
 * is canned*. It never guesses at the passage. A plausible invented answer is
 * the one failure mode a reading tutor must not have: the reader would carry
 * it away as something the book said.
 */

import { accessToken } from '../storage/cloud/client.ts'
import type { PassageContext } from './context.ts'
import type { Effort } from './effort.ts'
import type { Anchor } from '../structure/index.ts'

/** How much of the page the reader pinned under the lamp. */
export type PassageKind = 'sentence' | 'paragraph'

/** The words the conversation is about, and where they live. */
export interface PassageAnchor {
  /** The paragraph the passage starts in — `[ch02-s03-p013]`. */
  anchor: Anchor
  /** The exact words, copied. This is what finds them again. */
  excerpt: string
  kind: PassageKind
}

/**
 * The eight ways in.
 *
 * These name **task modules in the relay's prompt library**, not labels. The
 * earlier set (`explain`, `quiz`) was invented before the prompt file existed
 * and matched nothing in it; `quiz` in particular is now the explain-back
 * probe, which fires on its own after an explanation rather than as a chip the
 * reader has to remember to press.
 *
 * The first four suit any book and the lamp always offers them. The last four
 * are genre-conditional: `genre.ts` decides which of them a book has earned,
 * and a novel never sees "Still true?". Two of them can search the web —
 * see `search` on `AskTutorRequest`.
 */
export type TutorIntent =
  | 'simply'
  | 'friend'
  | 'discuss'
  | 'define'
  | 'stilltrue'
  | 'historical'
  | 'happening'
  | 'interpret'

export const INTENT_LABELS: Record<TutorIntent, string> = {
  simply: 'Explain simply',
  friend: 'Explain to a friend',
  discuss: 'Discuss & ask questions',
  define: 'Define a term',
  stilltrue: 'Still true?',
  historical: 'Historical context',
  happening: 'What’s happening here?',
  interpret: 'Interpret this',
}

/** What one exchange cost, in tokens. */
export interface TutorUsage {
  input: number
  output: number
  total: number
}

/**
 * One page a searched answer leaned on.
 *
 * Kept with the message rather than shown and dropped. A claim checked against
 * the web is only as good as where the check came from, and a reader who opens
 * the thread again next week is owed the same links they had at the time.
 */
export interface TutorSource {
  url: string
  title?: string
}

/** One turn of the conversation. */
export interface TutorMessage {
  role: 'you' | 'claude'
  text: string
  /** A Socratic question back, drawn warmer and in italic. */
  isProbe?: boolean
  /**
   * The model's working-out, when it published one.
   *
   * Stored with the message rather than shown and thrown away: a reader who
   * reopens a thread a week later is entitled to the same thing they could have
   * opened at the time. It is drawn folded, above the answer.
   */
  reasoning?: string
  /** What this exchange cost. Only on the tutor's side, and only if reported. */
  usage?: TutorUsage
  /** Where a searched answer looked. Absent when no search ran. */
  sources?: TutorSource[]
  /**
   * The model that actually wrote this. Absent means unknown — either the
   * reader's own words, or a message stored before the app recorded it.
   */
  model?: string
  /** Epoch milliseconds. */
  ts: number
}

/**
 * A model slug as a caption the reader can read.
 *
 * `z-ai/glm-5.2:free` becomes `GLM 5.2`. The vendor prefix and the `:free`
 * suffix are ours to worry about, not the reader's — the label sits above a
 * bubble in a quiet room and has to read like a name, not a package id.
 *
 * The `name` from the roster is preferred when the caller has it. This is the
 * fallback, and it is needed often: a failover reports a slug we never asked
 * for and so may never have seen in the roster at all.
 */
export function modelLabel(slug: string): string {
  const tail = (slug.split('/').pop() ?? slug).replace(/:free$/, '').trim()
  if (!tail) return slug

  return tail
    .split('-')
    .map((part) => {
      // Anything starting with a digit is a version or a size — `5.2`, `31b`,
      // `a12b` — and reads correctly as it was written.
      if (/^\d/.test(part)) return part
      // Short all-letter runs are acronyms: glm, it, vl.
      if (part.length <= 3) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

/**
 * A long passage in one line: the first three words, the last four.
 *
 * The pinned bar has one line to spend, and the two ends of a passage carry
 * more identity than its middle. Short passages come back whole.
 */
export function elide(text: string): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= 8) return words.join(' ')
  return `${words.slice(0, 3).join(' ')} … ${words.slice(-4).join(' ')}`
}

/**
 * Which anchor state a passage gets under the lamp.
 *
 * The selection's own grain wins when the reader chose one. Otherwise length
 * decides: past this, the passage cannot be centred whole and takes the
 * fade-to-shadow treatment instead.
 */
export function passageKindOf(text: string, unit?: PassageKind | null): PassageKind {
  if (unit) return unit
  return text.length > 160 ? 'paragraph' : 'sentence'
}

export interface AskTutorRequest {
  anchor: PassageAnchor
  /**
   * Where the passage sits in the book — title, author, chapter, section, and
   * the text either side of it. Built by `context.ts`. Left out only when the
   * caller genuinely does not know, which is rare.
   */
  context?: PassageContext
  /** 'fresh' on a first exchange, 'reopen' when the thread already exists. */
  mode: 'fresh' | 'reopen'
  /** The entry chip that started it, when one did. */
  intent?: TutorIntent
  history: TutorMessage[]
  userMessage: string
  /**
   * How hard the model should think. Left out, the relay uses its own default,
   * which is the same as this client's.
   */
  effort?: Effort
  /**
   * Whether to search the web for this one question.
   *
   * The reader's own choice, made with the globe in the composer, and it is
   * about *this* question only — a search costs money, so it is never left
   * switched on behind their back. Two task modules ask for search on their
   * own, and the relay honours either.
   */
  search?: boolean
  /**
   * Which models to try, in order, after the reader's own pick. Built by
   * `stepsFrom`. Left out, the relay falls back to its own list.
   *
   * A chain rather than one slug because a free model refusing is the normal
   * case, not the exception — and when it happens, *which* model catches the
   * question is the difference between a good answer and a poor one.
   *
   * Each rung carries its provider as well as its id. The relay needs it to
   * choose a URL and a key, and an id alone no longer says who serves it —
   * Gemma 4 31B is on both Gemini and OpenRouter and they are different rungs.
   */
  models?: { id: string; source: string }[]
}

export interface AskTutorReply {
  text: string
  isProbe?: boolean
  /** The model's working-out, when it published one. */
  reasoning?: string
  /** What the exchange cost, when OpenRouter reported it. */
  usage?: TutorUsage
  /** The pages a web search fed in, when one ran. */
  sources?: TutorSource[]
  /**
   * True when `text` is our own canned line rather than a model's words.
   *
   * The caller needs this to keep the failure *out* of the thread. A failure
   * that is stored as a message stacks up one bubble per attempt, survives a
   * reopen, and — worst of the three — gets replayed to the model as its own
   * previous turn, so the tutor reads "The tutor could not be reached" as
   * something it once said.
   */
  failed?: true
  /**
   * The model that **actually** produced this text, as the relay read it off
   * the response — not the one that was asked for. During a failover the two
   * differ, which is exactly when the label matters.
   */
  model?: string
  /**
   * The gentle check that the explanation landed, when the task module carries
   * one. A whole second turn, drawn as its own bubble with `isProbe`.
   */
  probe?: string
  probeModel?: string
}

/**
 * Where the relay lives. The default is a path on our own origin, which is
 * where every other server bit of this app sits (`api/`). Overridable for a
 * dev box pointing at a deployed relay.
 */
/**
 * Where the relay lives. Exported because the memory layer posts to the same
 * endpoint with a different task module — see `tutor/digest.ts`.
 */
export const TUTOR_URL: string =
  (import.meta.env.VITE_TUTOR_URL as string | undefined) ?? '/api/tutor'

/**
 * What the lamp says when the tutor cannot be reached.
 *
 * Honest about the failure, and never dressed as the model. It says *which*
 * failure, because the three have three different remedies: sign in, wait for
 * a signal, or tell someone the server is misconfigured. "Something went
 * wrong" would leave the reader pressing the same button forever.
 */
function cannedReply(reason: string): AskTutorReply {
  return { text: reason, failed: true }
}

/** The failure, in words that suggest what to do about it. */
function reasonFor(status: number): string {
  switch (status) {
    case 401:
      return 'The tutor needs you signed in. Sign in from Settings, then ask again — nothing you typed is lost.'
    case 429:
      return 'The free model is busy right now — that is the free tier, not you. Give it a minute, or pick a different model below and ask again.'
    case 500:
      return 'The tutor relay has no key set, so it cannot reach a model. This one needs fixing on the server, not here.'
    case 502:
      return 'No model would answer that just now. Pick a different one below and ask again — I would rather say nothing than guess at the passage.'
    default:
      return 'The tutor could not be reached just now. Ask again in a moment — I would rather say nothing than guess at the passage.'
  }
}

/**
 * The token counts, if the relay sent three real numbers.
 *
 * All-zero counts are treated as no answer. A provider that reports nothing
 * sends zeroes, and "0 tokens" under a paragraph of explanation reads as a bug
 * rather than as a missing figure.
 */
function usageOf(value: unknown): TutorUsage | undefined {
  const spent = value as Partial<TutorUsage> | null
  if (!spent || typeof spent !== 'object') return undefined
  const input = Number(spent.input) || 0
  const output = Number(spent.output) || 0
  const total = Number(spent.total) || input + output
  return total > 0 ? { input, output, total } : undefined
}

/**
 * The pages behind a searched answer, kept only if each has a real address.
 *
 * A citation with no `url` is nothing a reader can follow, and printing its
 * title alone would look like a source while being none.
 */
function sourcesOf(value: unknown): TutorSource[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => entry as { url?: unknown; title?: unknown })
    .filter((entry) => typeof entry?.url === 'string' && entry.url.length > 0)
    .map((entry) => ({
      url: entry.url as string,
      ...(typeof entry.title === 'string' && entry.title.length > 0
        ? { title: entry.title }
        : {}),
    }))
}

/**
 * One question to the tutor. Resolves to the reply; never rejects — the lamp
 * always gets something it can print.
 */
export async function askTutor(request: AskTutorRequest): Promise<AskTutorReply> {
  try {
    const token = await accessToken()
    const response = await fetch(TUTOR_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        anchor: request.anchor.anchor,
        excerpt: request.anchor.excerpt,
        kind: request.anchor.kind,
        ...(request.context ? { context: request.context } : {}),
        mode: request.mode,
        intent: request.intent,
        history: request.history.map(({ role, text, isProbe }) => ({ role, text, isProbe })),
        userMessage: request.userMessage,
        ...(request.effort ? { effort: request.effort } : {}),
        ...(request.search ? { search: true } : {}),
        ...(request.models && request.models.length > 0 ? { models: request.models } : {}),
      }),
    })
    if (!response.ok) return cannedReply(reasonFor(response.status))

    const data = (await response.json()) as {
      text?: unknown
      isProbe?: unknown
      model?: unknown
      reasoning?: unknown
      usage?: unknown
      sources?: unknown
      probe?: unknown
      probeModel?: unknown
    }
    if (typeof data.text !== 'string' || data.text.length === 0) {
      return cannedReply(reasonFor(0))
    }

    return {
      text: data.text,
      ...(data.isProbe === true ? { isProbe: true } : {}),
      ...(typeof data.model === 'string' ? { model: data.model } : {}),
      ...(typeof data.probe === 'string' && data.probe.length > 0
        ? { probe: data.probe }
        : {}),
      ...(typeof data.probeModel === 'string' ? { probeModel: data.probeModel } : {}),
      ...(typeof data.reasoning === 'string' && data.reasoning.length > 0
        ? { reasoning: data.reasoning }
        : {}),
      ...(usageOf(data.usage) ? { usage: usageOf(data.usage)! } : {}),
      ...(sourcesOf(data.sources).length > 0 ? { sources: sourcesOf(data.sources) } : {}),
    }
  } catch {
    // `fetch` rejects with a bare "Failed to fetch" for every network-level
    // problem, which on a phone means one thing far more often than not.
    return cannedReply('You’re offline, so the tutor can’t answer yet. Your question stays here — ask again when you have a signal.')
  }
}
