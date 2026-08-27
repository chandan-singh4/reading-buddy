import type { StoredChapterSummary } from '../storage/db.ts'

/**
 * Reading what the two models sent back.
 *
 * Both golden prompts end with "return only valid structured data in the exact
 * schema requested by the application". Most of the time that is exactly what
 * arrives. Sometimes it arrives wrapped in a fenced code block, or with a line
 * of throat-clearing in front of it, because that is what models do.
 *
 * Kept apart from `engine.ts` and free of any I/O, because this is the part
 * most likely to be wrong and the only part that can be checked cheaply. A
 * summary built from a misread response is worse than no summary: it is stored,
 * it looks finished, and nothing ever rebuilds it.
 */

/** What the Librarian is asked for. */
export type LibrarianResult = Pick<StoredChapterSummary, 'recap' | 'concepts'>

/** What the Scribe is asked for. `items` is empty when nothing was worth keeping. */
export interface ScribeResult {
  items: NonNullable<StoredChapterSummary['items']>
}

/**
 * Pull the JSON object out of a model's reply.
 *
 * Three shapes are accepted, in order of how often they turn up: bare JSON, a
 * ```json fence, and JSON with prose around it. The last is found by taking the
 * span between the first `{` and the last `}` — crude, and right for this,
 * because the payload is always one object.
 *
 * Throws rather than returning null. Every caller here stores what it gets, and
 * a silent null becomes an empty summary that looks finished.
 */
export function jsonFrom(reply: string): unknown {
  const text = reply.trim()

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidates = [fenced?.[1], text, spanBetweenBraces(text)]

  for (const candidate of candidates) {
    if (candidate === undefined) continue
    try {
      return JSON.parse(candidate.trim()) as unknown
    } catch {
      // Try the next shape.
    }
  }
  throw new Error('the model did not send readable JSON')
}

function spanBetweenBraces(text: string): string | undefined {
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open === -1 || close <= open) return undefined
  return text.slice(open, close + 1)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('expected an object')
  return value as Record<string, unknown>
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The Librarian's reply.
 *
 * A recap is required — without one there is nothing to show, and storing an
 * empty summary would stop the chapter ever being tried again. Concepts are
 * not: a chapter can honestly raise none, and the vocabulary is allowed to stay
 * where it is.
 *
 * A concept whose status the model did not send is treated as `existing-match`.
 * That is the safe way round. Guessing `new-addition` would add an unvetted
 * name to the controlled vocabulary, which is the one thing both prompts spend
 * their length trying to prevent.
 */
export function librarianResult(reply: string): LibrarianResult {
  const data = asRecord(jsonFrom(reply))

  const recap = trimmedString(data.recap)
  if (recap === '') throw new Error('the Librarian sent no recap')

  const raw = Array.isArray(data.concepts) ? data.concepts : []
  const concepts: LibrarianResult['concepts'] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    const name = trimmedString(typeof entry === 'string' ? entry : asRecord(entry).name)
    if (name === '' || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())

    const status = typeof entry === 'string' ? '' : trimmedString(asRecord(entry).status)
    concepts.push({ name, status: status === 'new-addition' ? 'new-addition' : 'existing-match' })
  }

  return { recap, concepts }
}

/**
 * The Scribe's reply.
 *
 * An item with no claim is dropped — it is the only field the reader will ever
 * read. An item with no concept is kept as a `candidate`: the knowledge is
 * still worth having, and a candidate is exactly the prompt's word for a name
 * that is not ready to join the vocabulary.
 *
 * `status` is only honoured as `linked` when the concept is actually on the
 * supplied list. The prompt forbids inventing an approved concept, and this is
 * where that is enforced rather than trusted — a model that marks its own
 * invention `linked` must not be able to write a new note into the vault.
 */
export function scribeResult(reply: string, canonical: readonly string[]): ScribeResult {
  const data = asRecord(jsonFrom(reply))
  const raw = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []

  const approved = new Set(canonical.map((name) => name.toLowerCase()))
  const items: ScribeResult['items'] = []

  for (const entry of raw) {
    const row = asRecord(entry)
    const claim = trimmedString(row.claim)
    if (claim === '') continue

    const concept = trimmedString(row.concept)
    const linked = concept !== '' && approved.has(concept.toLowerCase())

    items.push({
      claim,
      concept,
      status: linked ? 'linked' : 'candidate',
      anchor: trimmedString(row.anchor),
    })
  }

  return { items }
}
