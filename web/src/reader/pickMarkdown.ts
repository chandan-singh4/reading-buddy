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
 * `range.cloneContents()` is what gets walked: a fragment holding copies of
 * exactly the nodes the pick covers, with the partly-picked ones already cut to
 * size by the browser. Working on the clone rather than on the page also means
 * nothing here can disturb what the reader is looking at.
 *
 * Blocks are separated by a blank line, which is what makes them blocks. A
 * heading with no blank line under it swallows the paragraph that follows.
 */
export function markdownOfRange(range: Range): string {
  return tidy(write(range.cloneContents()))
}

/** The same, for a fragment already in hand. Split out so it can be tested. */
export function markdownOfFragment(fragment: DocumentFragment): string {
  return tidy(write(fragment))
}

function write(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // The renderer keeps the model's own line breaks inside a paragraph, and so
    // does this. Everything else is squeezed: the source file's indentation is
    // not something the reader picked.
    return (node.textContent ?? '').replace(/[^\S\n]+/g, ' ')
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return ''
  }

  const inside = [...node.childNodes].map(write).join('')

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
  const at = flat.indexOf(wanted)
  if (at < 0) return null
  return rangeOfSpan(from, at, at + wanted.length)
}
