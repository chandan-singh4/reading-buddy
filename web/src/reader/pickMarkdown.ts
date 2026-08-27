/**
 * Picked words, turned back into the markdown they were drawn from.
 *
 * ## Why this exists
 *
 * A pick out of one of Veda's answers is a DOM range, and a range's text is
 * plain: `**already** free` comes back as `already free`. Saved that way, a line
 * the reader kept lost its bold, its bullets and its headings the moment it
 * reached the Notes tab — the reader asked for it back.
 *
 * ## Why it reads the drawn words rather than the source
 *
 * The answer's markdown source is right there on the message, so the obvious
 * move is to find the picked words in it and cut that piece out. It does not
 * work. Rendering is not reversible: `#` becomes a heading with the hash gone,
 * a table becomes a run of terms and values in a different order, and a line
 * the reader picked across two paragraphs is one run on screen and two blocks
 * apart in the source. Searching the source for text that is not in the source
 * fails on exactly the answers worth keeping.
 *
 * So this walks what was actually picked and writes the marks back on. It is
 * the renderer read backwards, and it stays honest by only claiming the things
 * the renderer actually draws — see `data-md` in `markdown.tsx`.
 *
 * ## What it does not do
 *
 * Tables. The renderer deliberately draws a table as a stack of terms and
 * values, because a grid on a phone is unreadable — the note at the top of
 * `markdown.tsx` sets that out. Writing `|` rows back would invent a shape the
 * reader never saw. The words are kept as the paragraphs they were drawn as.
 */

import { flatten, rangeOfSpan } from './selection.ts'

/** The marks around one element's children. `null` means "not a block". */
function fenceOf(element: Element): { open: string; close: string } | null {
  const kind = element.getAttribute('data-md')

  if (kind === 'heading') return { open: '## ', close: '' }
  if (kind === 'quote') return { open: '> ', close: '' }
  if (kind === 'block') return { open: '```\n', close: '\n```' }
  if (kind === 'item') {
    // A numbered list keeps its numbers, and the number is the one the reader
    // saw — a pick that starts at the third step should read as the third step.
    const list = element.parentElement
    if (list?.tagName !== 'OL') return { open: '- ', close: '' }
    const at = [...list.children].indexOf(element)
    const from = Number(list.getAttribute('start') ?? 1)
    return { open: `${from + Math.max(at, 0)}. `, close: '' }
  }
  if (kind === 'paragraph') return { open: '', close: '' }
  return null
}

/** The marks around one element's children, for the inline kinds. */
function inlineOf(element: Element): { open: string; close: string } | null {
  switch (element.tagName) {
    case 'STRONG':
      return { open: '**', close: '**' }
    case 'EM':
      return { open: '_', close: '_' }
    case 'DEL':
      return { open: '~~', close: '~~' }
    case 'CODE':
      // Inside a fenced block the backticks are the fence's job, not the
      // code element's. Doubling them would end the block on its first line.
      return element.parentElement?.getAttribute('data-md') === 'block'
        ? { open: '', close: '' }
        : { open: '`', close: '`' }
    case 'HR':
      return { open: '---', close: '' }
    default:
      return null
  }
}

/**
 * The markdown for a picked range.
 *
 * ## Why it walks the page and not a copy
 *
 * `range.cloneContents()` is the obvious way to get the picked nodes, and it is
 * wrong here. The fragment it returns keeps everything *below* the range's
 * common ancestor and nothing above it. Pick from inside the first item of a
 * numbered list to inside the last, and the common ancestor is the `<ol>` — so
 * the fragment holds bare `<li>` elements with no list above them. There is no
 * way left to tell an ordered list from an unordered one, and every numbered
 * step came out as a bullet.
 *
 * The reader hit this on the first real answer they tried to keep, because it
 * is not an edge case: a finger picks *inside* text, never around it. So this
 * walks the live page instead, where an element still knows its parents, and
 * clips each text node to the part the range covers.
 */
export function markdownOfRange(range: Range): string {
  const at = range.commonAncestorContainer
  const from = at.nodeType === Node.ELEMENT_NODE ? at : (at.parentNode ?? at)
  return tidy(write(from, range))
}

/** The same, for a fragment already in hand. Split out so it can be tested. */
export function markdownOfFragment(fragment: DocumentFragment): string {
  const whole = document.createRange()
  whole.selectNodeContents(fragment)
  return tidy(write(fragment, whole))
}

/** Whether any part of a node lies inside the range. */
function touched(node: Node, range: Range): boolean {
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return true
  try {
    return range.intersectsNode(node)
  } catch {
    return true
  }
}

function write(node: Node, range: Range): string {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!touched(node, range)) return ''
    const raw = node.textContent ?? ''
    // Clipped to the part the finger covered. The end nodes are the only ones
    // the range cuts; everything between them is taken whole.
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : raw.length
    // The renderer keeps the model's own line breaks inside a paragraph, and so
    // does this. Everything else is squeezed: the source file's indentation is
    // not something the reader picked.
    return raw.slice(start, end).replace(/[^\S\n]+/g, ' ')
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return ''
  }
  if (!touched(node, range)) return ''

  const inside = [...node.childNodes].map((child) => write(child, range)).join('')

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return inside

  const element = node as Element
  if (element.tagName === 'A') {
    const href = element.getAttribute('href')
    return href ? `[${inside}](${href})` : inside
  }

  const inline = inlineOf(element)
  // An empty pair of marks is not emphasis, it is two asterisks. This happens
  // whenever a pick clips the edge of a bold word and takes none of its letters.
  if (inline) return inside.trim() ? `${inline.open}${inside}${inline.close}` : inside

  const block = fenceOf(element)
  if (block) return `\n\n${block.open}${inside.trim()}${block.close}\n\n`

  return inside
}

/** One blank line between blocks, none at either end, no line left trailing. */
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Find a kept line again, inside one of the answers on screen.
 *
 * This is the other half of the pair. `markdownOfRange` writes the marks back
 * on so the Notes tab can draw the line as the reader saw it; the plain words
 * are stored beside it so this can search for them. The marks are not in the
 * page — the page holds a `<strong>`, not two asterisks — so searching by the
 * markdown would never match anything.
 *
 * `flatten` squeezes runs of whitespace to one space, exactly as the plain
 * words were squeezed when they were picked, so the two strings meet.
 */
export function wordsIn(root: Element | null, words: string): Range | null {
  if (!root) return null
  const wanted = words.replace(/\s+/g, ' ').trim()
  if (wanted.length === 0) return null

  const { flat, from } = flatten(root)

  /*
   * Three tries, each one more forgiving than the last.
   *
   * The first is the plain words, which is what a line kept today stores. The
   * second strips the marks off, because a line kept *before* this existed has
   * only its markdown to search with — and `**not**` is not on the page, `not`
   * is. The third takes the opening of the line, because an answer can be a
   * little different from the note that came out of it, and landing on the
   * first sentence is a great deal better than landing at the top.
   */
  const bare = withoutMarks(wanted)
  for (const whole of [wanted, bare]) {
    // A scrap this short is found by coincidence, not by meaning. "A s" is in
    // half the sentences in the book, and landing on the wrong one is worse
    // than not moving at all.
    if (whole.length < ENOUGH) continue
    const at = flat.indexOf(whole)
    if (at >= 0) return rangeOfSpan(from, at, at + whole.length)
  }

  /*
   * Nothing matched whole, so try the opening of the line.
   *
   * A word at a time, from the longest, because an answer can differ from the
   * note that came out of it in small ways — a comma, a re-worded ending — and
   * a fixed cut of so many characters lands in the middle of a word as often as
   * not. The first prefix that is there is the longest one that is there.
   */
  const parts = bare.split(' ')
  for (let take = parts.length - 1; take > 0; take -= 1) {
    const opening = parts.slice(0, take).join(' ')
    if (opening.length < ENOUGH) break
    const at = flat.indexOf(opening)
    if (at >= 0) return rangeOfSpan(from, at, at + opening.length)
  }
  return null
}

/** The shortest opening worth landing on. Less is a coincidence, not a match. */
const ENOUGH = 12

/** A line with its markdown taken off, as it reads on the page. */
function withoutMarks(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+\.|>|#{1,6})\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A kept line's markdown, recovered from the answer it was cut out of.
 *
 * ## Why this is needed at all
 *
 * Lines kept before the marks were saved are stored as plain prose. Nothing
 * done to the saving path can reach them: the note in the database is the note,
 * and the reader is not going to save every one of them again.
 *
 * But the answer is still there. A kept line names its thread, the thread holds
 * what Veda actually wrote, and that is markdown. So the words can be found in
 * it and the marks read off around them.
 *
 * ## Why it compares with the whitespace taken out
 *
 * The two strings disagree about whitespace in ways neither side is wrong
 * about. The stored line came from `range.toString()`, which puts *nothing*
 * between two blocks — "noticed.Unconscious" is one word to it. The source has
 * a line break there, and a list marker, and asterisks. Removing every space
 * from both sides, and every mark from the source, is what makes them meet.
 *
 * This is a repair, not the way the feature works. `markdownOfRange` is the way
 * it works, and it does not guess.
 */
export function recoverMarkdown(plain: string, source: string): string | null {
  const want = plain.replace(/\s+/g, '')
  if (want.length < ENOUGH) return null

  const { tight, at } = bones(source)
  const start = tight.indexOf(want)
  if (start < 0) return null

  const from = at[start]
  const to = at[start + want.length - 1]
  if (from === undefined || to === undefined) return null

  return tidy(source.slice(openingOfLine(source, from), to + 1))
}

/**
 * The source with its marks and its spaces gone, and a way back to it.
 *
 * `at[i]` is where character `i` of `tight` sits in `source`, which is what
 * turns a match into a slice.
 */
function bones(source: string): { tight: string; at: number[] } {
  let tight = ''
  const at: number[] = []
  let i = 0
  let fresh = true

  while (i < source.length) {
    const rest = source.slice(i)

    if (fresh) {
      // A list marker, a heading's hashes, a quote's angle: syntax at the head
      // of a line, and none of it is in the words the reader picked.
      const head = /^[^\S\n]*(?:[-*+]|\d+\.|>|#{1,6})[^\S\n]+/.exec(rest)
      if (head) {
        i += head[0].length
        continue
      }
    }

    const here = source[i]!
    if (/\s/.test(here)) {
      fresh = here === '\n' || fresh
      i += 1
      continue
    }
    fresh = false

    // Emphasis, code and strikethrough marks, in runs of any length.
    const mark = /^[*_`~]+/.exec(rest)
    if (mark) {
      i += mark[0].length
      continue
    }

    // A link keeps its words and loses its address.
    const link = /^\[([^\]]*)\]\([^)]*\)/.exec(rest)
    if (link) {
      const words = link[1] ?? ''
      const opens = i + 1
      for (let k = 0; k < words.length; k += 1) {
        if (/\s/.test(words[k]!)) continue
        tight += words[k]
        at.push(opens + k)
      }
      i += link[0].length
      continue
    }

    tight += here
    at.push(i)
    i += 1
  }

  return { tight, at }
}

/**
 * Where the line holding an offset begins, past whatever marker starts it.
 *
 * A match lands on the first *word*, which is after the "1. " that makes the
 * item an item. Taking the marker back in is what keeps the number.
 */
function openingOfLine(source: string, offset: number): number {
  const head = source.lastIndexOf('\n', offset - 1) + 1
  const between = source.slice(head, offset)
  return /^[^\S\n]*(?:[-*+]|\d+\.|>|#{1,6})?[^\S\n]*[*_`~]*$/.test(between) ? head : offset
}
