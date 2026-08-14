/**
 * Recognising the running head a print edition left behind.
 *
 * A book converted from print — or from a PDF of print — often carries the
 * furniture from the top and bottom of every paper page down into the text as
 * ordinary paragraphs: "Introduction | 7", "6 | You Are the One You've Been
 * Waiting For". On paper these sit in the margin and the eye never lands on
 * them. In a reflowed book there is no margin, so they arrive mid-sentence,
 * between two halves of a thought, once every few hundred words.
 *
 * Nothing in the markup says what they are — that is the whole problem. The
 * epub's own `epub:type` furniture, which `html.ts` already drops, is furniture
 * the file *admits* to. This is furniture that looks exactly like prose, so it
 * has to be recognised by its shape.
 *
 * ## Deliberately narrow
 *
 * Every rule here can only ever be a guess about a line the author might have
 * written on purpose, and the two mistakes are not equal: a running head left
 * in is a distraction, while a real line thrown away is *gone* — the reader
 * cannot know what they are not being shown. So this errs heavily towards
 * leaving things in.
 *
 * That is why the separator must be a **bar** (`|`, `¦`, `│`, `•`, `·`). A dash
 * or an en-dash would catch far more running heads and would also catch
 * "1962 — a bad year", which is a sentence. Books whose running heads use a
 * dash keep them; that is the deal.
 */

/** The bars a running head is built around. Never a dash — see the note above. */
const BAR = /[|¦│ǀ•·]/

/** How long a running head is allowed to be, in characters. */
const LONGEST = 80

/**
 * Sentence-ending punctuation. A running head is a label, not a statement, so
 * anything that finishes like a sentence is left alone.
 */
const SENTENCE_END = /[.!?]$/

/** `7`, `199` — a page number as a printer sets it. */
const ARABIC = /^\d{1,4}$/

/** `vii`, `xiv` — front matter is numbered this way. */
const ROMAN = /^[ivxlcdm]+$/i

function isPageNumber(part: string): boolean {
  return ARABIC.test(part) || ROMAN.test(part)
}

/**
 * Whether this paragraph is the running head or folio of a printed page rather
 * than something the author wrote.
 *
 * Two shapes, and only these two:
 *
 * - **A page number alone** — `7`. Arabic only. Roman numerals are excluded
 *   here because a paragraph reading "I" or "MIX" is a word far more often than
 *   it is a page.
 * - **A bar with a page number on one side and a short label on the other** —
 *   `Introduction | 7`, `6 | You Are the One You've Been Waiting For`. Both
 *   orders, because a book alternates them between recto and verso.
 *
 * The label side must be short and must not end like a sentence. A page number
 * on *both* sides is a range ("pages 7 | 9"), not a head, and is left alone.
 */
export function isRunningHead(text: string): boolean {
  const line = text.trim()
  if (line.length === 0 || line.length > LONGEST) return false

  if (ARABIC.test(line)) return true
  if (!BAR.test(line)) return false

  const parts = line.split(BAR).map((part) => part.trim())
  // Exactly one bar. Two of them is a table row that lost its table, and this
  // is not the code that should be guessing about that.
  if (parts.length !== 2) return false
  if (parts.some((part) => part.length === 0)) return false

  const numbers = parts.filter(isPageNumber)
  if (numbers.length !== 1) return false

  const label = parts.find((part) => !isPageNumber(part))!
  return !SENTENCE_END.test(label)
}
