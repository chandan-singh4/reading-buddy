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

/**
 * The other half of the problem: a running head that is *glued to the prose*.
 *
 * `isRunningHead` above only recognises one that stands alone as its own
 * paragraph. In a real conversion, only half of them do. On the recto page the
 * head sits above a paragraph break and survives as its own paragraph
 * ("Introduction | 7"). On the verso page it sits above a sentence *continuing*
 * from the page before, and the converter, seeing one unbroken run of text,
 * emits one paragraph:
 *
 *     "8 | You Are the One You've Been Waiting For or distract from the pain
 *      and emptiness enough to stay with the original one..."
 *
 * There is no block to drop here. The paragraph is real, and most of it is the
 * author's; the damage is a prefix. So this strips the prefix instead.
 *
 * ## Finding where the prefix ends
 *
 * That is the whole difficulty: nothing marks the boundary between "Waiting
 * For" and "or distract". Guessing at it from one paragraph is hopeless.
 *
 * But these repeat. A book has one running head and prints it on every other
 * page, so the text after the page number is *the same every time*. Pool the
 * candidates, take the longest run of words they all begin with, and that run
 * is the running head — established by repetition rather than assumed. Two
 * paragraphs that merely both start with a number and a bar share nothing after
 * it, produce an empty common prefix, and are left alone.
 *
 * This is why it takes the whole book at once rather than a paragraph at a
 * time, and why a single occurrence is never touched: one is a coincidence.
 */

/** `8 | `, `x | ` — a page number opening a paragraph, and the bar after it. */
const OPENS_WITH_PAGE = new RegExp(`^(?:\\d{1,4}|[ivxlcdm]{1,7})\\s*${BAR.source}\\s*`, 'i')

/** A running head is a title, not a paragraph. Longer than this is prose. */
const LONGEST_PREFIX_WORDS = 12

function commonWordPrefix(texts: readonly string[]): string[] {
  const wordLists = texts.map((text) => text.split(' '))
  const shortest = Math.min(...wordLists.map((words) => words.length))
  const prefix: string[] = []
  for (let i = 0; i < shortest && i < LONGEST_PREFIX_WORDS; i += 1) {
    const word = wordLists[0]![i]!
    if (!wordLists.every((words) => words[i] === word)) break
    prefix.push(word)
  }
  return prefix
}

/**
 * Remove the running head from the front of the paragraphs it was glued to.
 *
 * Returns the blocks unchanged unless at least two of them open with a page
 * number and a bar *and* agree on what follows it. A block whose whole text is
 * the head is left alone rather than emptied — `isRunningHead` has already had
 * its chance at those, and blanking one here would move the page break that a
 * format may have marked on it.
 */
export function stripRunningHeads<T extends { kind: string; text: string }>(
  blocks: readonly T[],
): T[] {
  const candidates = blocks.filter(
    (block) => block.kind === 'prose' && OPENS_WITH_PAGE.test(block.text),
  )
  if (candidates.length < 2) return [...blocks]

  const tails = candidates.map((block) => block.text.replace(OPENS_WITH_PAGE, ''))
  const prefix = commonWordPrefix(tails)
  // One shared word is a coincidence ("the", "and"); a running head is a title.
  if (prefix.length < 2) return [...blocks]

  const head = `${prefix.join(' ')} `
  return blocks.map((block) => {
    if (block.kind !== 'prose' || !OPENS_WITH_PAGE.test(block.text)) return block
    const tail = block.text.replace(OPENS_WITH_PAGE, '')
    if (!tail.startsWith(head)) return block
    const rest = tail.slice(head.length).trim()
    return rest === '' ? block : { ...block, text: rest }
  })
}
