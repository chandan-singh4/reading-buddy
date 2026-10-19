/**
 * Giving a spoken entry a shape (WP-62).
 *
 * The recogniser hands back a ribbon: no punctuation, no capitals, no breaks.
 * These three calls give it a form at three strengths — Tidy, Shape, Unpack —
 * and `decisions.md` settles what each is allowed to do.
 *
 * ## The raw words are never touched
 *
 * Nothing here writes to `raw`. A shape is a second copy, stored beside the
 * reader's own words, and the entry screen shows the two as an equal pair.
 * The reader can make a shape again or delete it; the ribbon stays either way.
 * That is the whole decision this module exists to keep.
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

/** The three strengths, weakest first. Also the ids the relay keys on. */
export type ShapeLevel = 'tidy' | 'shape' | 'unpack'

export const SHAPE_LEVELS: readonly ShapeLevel[] = ['tidy', 'shape', 'unpack']

/** What the button says, and what the entry screen calls the result. */
export const SHAPE_LABEL: Record<ShapeLevel, string> = {
  tidy: 'Tidy',
  shape: 'Shape',
  unpack: 'Unpack',
}

/** One line under each button, so the reader knows what they are choosing. */
export const SHAPE_BLURB: Record<ShapeLevel, string> = {
  tidy: 'Punctuation, paragraphs, and the grammar speaking breaks. Your words, your order.',
  shape: 'A title, and your ideas grouped into paragraphs.',
  unpack: 'Headings, anything you said you would do, and questions to sit with.',
}

export interface Shaping {
  text: string
  /** The model that actually answered, as the relay read it off the response. */
  model: string
  /** Lifted from a leading H1, when the level writes one. */
  title?: string
}

/**
 * Ask a free model for one shape of one entry.
 *
 * Rejects rather than returning a canned line. A journal is not the tutor's
 * lamp: there is no bubble that must always have something in it, and an
 * apology stored as the shape of an entry would be worse than no shape — the
 * reader would open it a month later and read it as something they wrote.
 */
export async function shapeEntry(level: ShapeLevel, raw: string): Promise<Shaping> {
  const words = raw.trim()
  if (!words) throw new Error('there are no words to shape')

  const token = await accessToken()
  const response = await fetch(TUTOR_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      excerpt: words,
      intent: level,
      history: [],
      userMessage: 'Give these words their shape.',
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

  const shaped = response.body
    ? await collected(response.body)
    : fromJson(await response.json())

  const body = shaped.text.trim()
  if (!body) throw new Error('the model sent nothing back')

  /*
   * The title is lifted only when something is left after it. A reply that is
   * nothing but a heading is a model that misread the job, and taking its one
   * line away as a title would store an entry with no words in it.
   */
  const title = titleOf(body)
  const rest = title ? withoutTitle(body) : ''
  if (title && rest) return { text: rest, model: shaped.model || 'a free model', title }
  return { text: body, model: shaped.model || 'a free model' }
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
      return 'Shaping needs you signed in. Sign in from Settings — your words are already saved.'
    case 429:
      return 'The free models are busy. Try again in a minute — your words are already saved.'
    case 500:
      return 'The relay has no key set, so it cannot reach a model. That needs fixing on the server.'
    default:
      return 'No model would answer just now. Try again in a moment — your words are already saved.'
  }
}

/** The finished text and the model that wrote it, read off the stream. */
async function collected(body: ReadableStream<Uint8Array>): Promise<Shaping> {
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
function fromJson(value: unknown): Shaping {
  const reply = (value ?? {}) as { text?: unknown; model?: unknown }
  return {
    text: typeof reply.text === 'string' ? reply.text : '',
    model: typeof reply.model === 'string' ? reply.model : '',
  }
}

/**
 * The entry's title, when the model opened with an H1.
 *
 * Tidy is told to write no title and the other two are told to write exactly
 * one, so an H1 is read rather than demanded: a level that writes none simply
 * has no title, and a model that disobeys costs the reader nothing.
 */
export function titleOf(text: string): string | undefined {
  const first = text.trimStart().split('\n', 1)[0] ?? ''
  const heading = /^#\s+(.+?)\s*$/.exec(first)
  const title = heading?.[1]?.trim()
  return title ? title : undefined
}

/** The same text with that opening H1 removed, so it is not shown twice. */
function withoutTitle(text: string): string {
  const trimmed = text.trimStart()
  const cut = trimmed.indexOf('\n')
  return cut === -1 ? '' : trimmed.slice(cut + 1).trim()
}
