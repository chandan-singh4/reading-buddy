/**
 * The recap, read out of a JSON answer that is still being written.
 *
 * ## Why this exists
 *
 * The lamp streams prose, so watching it arrive is free: every delta is a word
 * the reader can read. The Librarian does not answer in prose. It answers with
 * a JSON object — `{"recap": "...", "concepts": [...]}` — because the page
 * needs the concepts as data, not as a sentence about concepts.
 *
 * Streamed straight to the screen, that is a reader watching punctuation
 * arrive. So the deltas are collected and this pulls the recap out of the
 * half-written object as it grows: the reader sees the paragraph being typed,
 * and never the braces around it.
 *
 * ## Why not `JSON.parse`
 *
 * A half-written object is not JSON and never parses. Every delta would throw
 * until the last one, which is the same as not streaming at all. This walks the
 * string instead, which is the one job that has to survive a cut at any
 * character — including in the middle of an escape.
 */

/**
 * The recap so far, or an empty string until one starts.
 *
 * Returns text, not JSON: the escapes are undone, so what comes back is what
 * the reader should see. An unfinished escape at the very end of the buffer is
 * dropped rather than shown — `\u00e` is not a character yet, and printing the
 * backslash for one frame is a flicker the reader would notice.
 */
export function recapSoFar(partial: string): string {
  const start = openingQuote(partial)
  if (start < 0) return ''

  let out = ''
  for (let at = start; at < partial.length; at += 1) {
    const ch = partial[at]
    if (ch === '"') break // The recap is finished; the rest is concepts.
    if (ch !== '\\') {
      out += ch
      continue
    }

    const next = partial[at + 1]
    if (next === undefined) break // Cut mid-escape. Wait for the next delta.
    if (next === 'u') {
      const code = partial.slice(at + 2, at + 6)
      if (code.length < 4) break
      out += String.fromCharCode(parseInt(code, 16))
      at += 5
      continue
    }
    out += UNESCAPED[next] ?? next
    at += 1
  }

  return out
}

/** What a backslash makes of the character after it. */
const UNESCAPED: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '"': '"',
  '\\': '\\',
  '/': '/',
}

/**
 * Where the recap's own text begins, or -1 if it has not begun.
 *
 * The key is found by name rather than by position, because a model may put
 * `concepts` first — both orders are valid JSON and the schema does not bind
 * one. Whitespace between the key, the colon and the quote is allowed for the
 * same reason: the model chooses the formatting, and a pretty-printed answer
 * must stream exactly as a compact one does.
 */
function openingQuote(partial: string): number {
  const key = partial.indexOf('"recap"')
  if (key < 0) return -1

  let at = key + '"recap"'.length
  while (at < partial.length && /\s/.test(partial[at])) at += 1
  if (partial[at] !== ':') return -1
  at += 1
  while (at < partial.length && /\s/.test(partial[at])) at += 1
  if (partial[at] !== '"') return -1
  return at + 1
}
