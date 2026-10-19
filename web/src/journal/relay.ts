/**
 * The one call the journal makes to a model.
 *
 * Extracted from `shape.ts` when the Counsel arrived (WP-67): two callers were
 * about to hold two copies of the same stream reader, the same failover rule
 * and the same five failure sentences, and the second copy is the one that
 * goes stale.
 *
 * ## Why this is not `askMemory` or `askTutor`
 *
 * `askTutor` is built around a passage the reader selected — an anchor, a
 * mode, a conversation history — and none of the three exists here. `askMemory`
 * is closer, but it is typed to the four digest modules and its failures are
 * worded for a digest. The wire is the same wire; only the shape of the call
 * differs, so this borrows `readEvents` and `TUTOR_URL` rather than the
 * function around them.
 */

import { accessToken } from '../storage/cloud/client.ts'
import { readEvents, TUTOR_URL } from '../reader/tutor.ts'

export interface Answered {
  text: string
  /** The model that actually answered, as the relay read it off the response. */
  model: string
}

/**
 * Ask one of the journal's modules about the reader's own words.
 *
 * Rejects rather than returning a canned line. A journal is not the tutor's
 * lamp: there is no bubble that must always have something in it, and an
 * apology stored as the shape of an entry — or as an opinion on it — would be
 * worse than nothing, because the reader would open it a month later and read
 * it as something they wrote.
 */
export async function askJournal(intent: string, raw: string, ask: string): Promise<Answered> {
  const words = raw.trim()
  if (!words) throw new Error('there are no words to work from')

  const token = await accessToken()
  const response = await fetch(TUTOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      excerpt: words,
      intent,
      history: [],
      userMessage: ask,
      /*
       * Streamed although nobody watches it write, for the reason the digests
       * are: the host gives an edge function about twenty-five seconds to send
       * its first byte, and a long entry written whole before a single byte
       * leaves runs past that. A stream answers at once and holds the line.
       */
      stream: true,
    }),
  })
  if (!response.ok) throw new Error(trouble(response.status))

  const answer = response.body
    ? await collected(response.body)
    : fromJson(await response.json())

  const body = answer.text.trim()
  if (!body) throw new Error('the model sent nothing back')
  return { text: body, model: answer.model || 'a free model' }
}

/**
 * The failure, in words that suggest what to do about it.
 *
 * Worded for the journal rather than the lamp: here there is nothing to lose
 * by waiting, because the reader's own words are already saved. Every one of
 * these says so, because the fear a failure raises is that the thought is gone.
 */
function trouble(status: number): string {
  switch (status) {
    case 401:
      return 'This needs you signed in. Sign in from Settings — your words are already saved.'
    case 429:
      return 'The free models are busy. Try again in a minute — your words are already saved.'
    case 500:
      return 'The relay has no key set, so it cannot reach a model. That needs fixing on the server.'
    default:
      return 'No model would answer just now. Try again in a moment — your words are already saved.'
  }
}

/** The finished text and the model that wrote it, read off the stream. */
async function collected(body: ReadableStream<Uint8Array>): Promise<Answered> {
  let running = ''
  let finished: string | undefined
  let model = ''
  let refused: string | undefined

  await readEvents(body, (piece) => {
    switch (piece.t) {
      case 'open':
        // A second `open` is the relay moving to the next model after this one
        // failed part-way. The stump it left goes with it, and the name of the
        // rung that actually answers is the one that is kept.
        running = ''
        refused = undefined
        if (typeof piece.model === 'string') model = piece.model
        break
      case 'text':
        if (typeof piece.d === 'string') running += piece.d
        break
      case 'done': {
        const reply = (piece.reply ?? {}) as { text?: unknown; model?: unknown }
        if (typeof reply.text === 'string') finished = reply.text
        if (typeof reply.model === 'string') model = reply.model
        break
      }
      case 'error':
        if (typeof piece.message === 'string') refused = piece.message
        break
      default:
        break
    }
  })

  if (refused) throw new Error(refused)
  return { text: finished ?? running, model }
}

/** The same answer, where the host sent it whole instead of streaming it. */
function fromJson(value: unknown): Answered {
  const reply = (value ?? {}) as { text?: unknown; model?: unknown }
  return {
    text: typeof reply.text === 'string' ? reply.text : '',
    model: typeof reply.model === 'string' ? reply.model : '',
  }
}

/**
 * The first line of an answer, when the model opened with an H1.
 *
 * Read rather than demanded: a module that writes none simply has no heading,
 * and a model that disobeys costs the reader nothing.
 */
export function headingOf(text: string): string | undefined {
  const first = text.trimStart().split('\n', 1)[0] ?? ''
  const heading = /^#\s+(.+?)\s*$/.exec(first)
  const found = heading?.[1]?.trim()
  return found ? found : undefined
}

/** The same text with that opening H1 removed, so it is not shown twice. */
export function withoutHeading(text: string): string {
  const trimmed = text.trimStart()
  const cut = trimmed.indexOf('\n')
  return cut === -1 ? '' : trimmed.slice(cut + 1).trim()
}
