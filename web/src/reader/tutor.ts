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
 * `askTutor` is the only place the network is touched. It posts to a relay —
 * the Anthropic key lives server-side, never in this bundle — and when no
 * relay answers it falls back to a canned line that *says it is canned*. The
 * UI cannot tell the difference and does not need to: swap the relay in and
 * nothing above this file changes.
 */

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

/** The four ways in, in the order the lamp offers them. */
export type TutorIntent = 'explain' | 'simply' | 'quiz' | 'discuss'

export const INTENT_LABELS: Record<TutorIntent, string> = {
  explain: 'Explain this passage',
  simply: 'Explain simply',
  quiz: 'Quiz me on this',
  discuss: 'Discuss & ask questions',
}

/** One turn of the conversation. */
export interface TutorMessage {
  role: 'you' | 'claude'
  text: string
  /** A Socratic question back, drawn warmer and in italic. */
  isProbe?: boolean
  /** Epoch milliseconds. */
  ts: number
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
  /** 'fresh' on a first exchange, 'reopen' when the thread already exists. */
  mode: 'fresh' | 'reopen'
  /** The entry chip that started it, when one did. */
  intent?: TutorIntent
  history: TutorMessage[]
  userMessage: string
}

export interface AskTutorReply {
  text: string
  isProbe?: boolean
}

/**
 * Where the relay lives. The default is a path on our own origin, which is
 * where every other server bit of this app sits (`api/`). Overridable for a
 * dev box pointing at a deployed relay.
 */
const TUTOR_URL: string =
  (import.meta.env.VITE_TUTOR_URL as string | undefined) ?? '/api/tutor'

/**
 * What the lamp says when no relay answers.
 *
 * Honest about being offline, and never dressed as the model: an invented
 * "answer" would put words in the tutor's mouth. It still varies by intent so
 * the lamp is exercisable end to end without a server.
 */
function cannedReply(request: AskTutorRequest): AskTutorReply {
  const opening: Record<TutorIntent, string> = {
    explain: 'I can’t reach the tutor right now, so here is no real reading of the passage — only this placeholder.',
    simply: 'The tutor is offline, so no simple version yet — this is a placeholder.',
    quiz: 'The tutor is offline, so no quiz yet — this is a placeholder.',
    discuss: 'The tutor is offline, so no discussion yet — this is a placeholder.',
  }
  const first = request.history.length === 0
  return {
    text: first
      ? `${opening[request.intent ?? 'discuss']} When the connection returns, ask again and the passage will get a real answer.`
      : 'Still offline — your message is on screen but the tutor cannot answer it yet. Try again when the connection returns.',
  }
}

/**
 * One question to the tutor. Resolves to the reply; never rejects — the lamp
 * always gets something it can print.
 */
export async function askTutor(request: AskTutorRequest): Promise<AskTutorReply> {
  try {
    const response = await fetch(TUTOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        anchor: request.anchor.anchor,
        excerpt: request.anchor.excerpt,
        kind: request.anchor.kind,
        mode: request.mode,
        intent: request.intent,
        history: request.history.map(({ role, text, isProbe }) => ({ role, text, isProbe })),
        userMessage: request.userMessage,
      }),
    })
    if (!response.ok) throw new Error(`tutor relay answered ${response.status}`)
    const data = (await response.json()) as { text?: unknown; isProbe?: unknown }
    if (typeof data.text !== 'string' || data.text.length === 0) {
      throw new Error('tutor relay answered without text')
    }
    return { text: data.text, ...(data.isProbe === true ? { isProbe: true } : {}) }
  } catch {
    return cannedReply(request)
  }
}
