/**
 * Looking a word up: cache first, then the relay, then the parser.
 *
 * ## The order is the feature
 *
 * A word that has been looked up before opens instantly and works with no
 * signal, because what is kept is the *parsed* entry rather than MW's JSON.
 * Everything expensive — the network, the etymology chain — happens once per
 * word, ever. A reader who taps the same word in a second book gets the copy
 * they already have.
 *
 * ## What the failures mean
 *
 * Four different things go wrong here and they have four different remedies, so
 * they are four different results rather than one `error` string. "No entry"
 * means the dictionary genuinely has no such word and the reader should ask
 * Veda instead. "Offline" means try again with a signal. "Busy" means the
 * day's thousand lookups are spent. "Failed" is everything else. A panel that
 * flattened them would leave the reader tapping the same button for a different
 * outcome.
 */

import { accessToken } from '../storage/cloud/client.ts'
import { wordStore, type WordStore } from '../storage/words.ts'
import {
  etymologyTextOf,
  isNotFound,
  normalize,
  suggestionsOf,
  type DefineEntry,
} from './dictionary.ts'
import { parseEtymology } from './etymology.ts'

export const DEFINE_URL: string =
  (import.meta.env.VITE_DEFINE_URL as string | undefined)?.trim() || '/api/define'

/** How a lookup ended. Exactly one of these, never a string to match on. */
export type Lookup =
  | { state: 'entry'; entry: DefineEntry; fromCache: boolean }
  /** MW has no such word. `suggestions` are its own spellings, where it offered any. */
  | { state: 'none'; word: string; suggestions: string[] }
  | { state: 'offline'; word: string }
  /** The day's lookups are spent, or MW is rate-limiting us. */
  | { state: 'busy'; word: string }
  | { state: 'failed'; word: string }

/** Two tries. A third would keep a reader waiting for an answer that is not coming. */
const TRIES = 2

/** Long enough for one hiccup to pass, short enough not to feel like a hang. */
const BACKOFF_MS = 700

/** A word, not a phrase. What the panel is handed may be a whole selection. */
const MAX_WORD = 60

/**
 * The one word to look up, out of whatever the reader had selected.
 *
 * Define is offered on any selection, and a reader who has a sentence
 * highlighted and taps it means the word they were looking at. Taking the first
 * word is the only honest guess available, and it beats refusing.
 *
 * Punctuation goes, and so do the quotation marks a book puts round a word.
 * Apostrophes and hyphens stay: "don't" and "self-evident" are words.
 */
export function wordFrom(selected: string): string {
  const first = selected.trim().split(/\s+/)[0] ?? ''
  return first
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .slice(0, MAX_WORD)
}

/** Whether the browser is sure it has no connection. */
function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

const wait = (ms: number) => new Promise((go) => setTimeout(go, ms))

/**
 * Ask the relay once. The status is the answer as much as the body is.
 *
 * A 429 and an empty result are opposite things that look alike from here, and
 * telling the reader "there is no such word" when the truth is "we are out of
 * lookups until midnight" would send them looking for a spelling mistake that
 * does not exist.
 */
async function askRelay(word: string): Promise<{ status: number; body: unknown }> {
  const token = await accessToken()
  const response = await fetch(DEFINE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ word }),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

/**
 * Both responses, parsed and cached.
 *
 * `store` is a parameter so tests can hand in a scratch database, in the same
 * shape as everything else that touches storage in this app.
 */
export async function lookUpWord(selected: string, store: WordStore = wordStore): Promise<Lookup> {
  const word = wordFrom(selected)
  if (!word) return { state: 'none', word: selected.trim(), suggestions: [] }

  const kept = await store.cachedDefinition(word)
  if (kept?.entry) return { state: 'entry', entry: kept.entry as DefineEntry, fromCache: true }

  // Checked after the cache, never before it: a word already looked up is a
  // word this app can define on a train with no signal, and asking the network
  // first would be the one thing that breaks that.
  if (offline()) return { state: 'offline', word }

  let last: { status: number; body: unknown } | undefined
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    try {
      last = await askRelay(word)
    } catch {
      // A thrown fetch is the network, not the dictionary.
      if (attempt + 1 < TRIES) {
        await wait(BACKOFF_MS)
        continue
      }
      return { state: 'offline', word }
    }

    if (last.status === 200) break
    // A spent quota does not un-spend itself in seven hundred milliseconds.
    if (last.status === 429) return { state: 'busy', word }
    if (attempt + 1 < TRIES) await wait(BACKOFF_MS)
  }

  if (!last || last.status !== 200) return { state: 'failed', word }

  const answered = last.body as { collegiate?: unknown; thesaurus?: unknown } | null
  const collegiate = answered?.collegiate
  if (isNotFound(collegiate)) {
    return { state: 'none', word, suggestions: suggestionsOf(collegiate) }
  }

  const found = etymologyTextOf(collegiate, word)
  const etymology = found.et ? parseEtymology(found.et, word, found.date) : undefined
  const entry = normalize(word, collegiate, answered?.thesaurus, etymology)
  if (!entry) return { state: 'none', word, suggestions: suggestionsOf(collegiate) }

  // Kept before it is returned, so a panel that fails to draw has still paid
  // for the lookup only once.
  await store.cacheDefinition(word, entry)
  return { state: 'entry', entry, fromCache: false }
}
