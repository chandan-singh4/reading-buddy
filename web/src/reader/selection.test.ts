// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'

import {
  describeRange,
  describeSpan,
  selectAround,
  pivotFor,
  selectionBetween,
  spanBetween,
  rangeAtOffset,
  rangeOfQuote,
  wordAtIn,
  type ReaderSelection,
} from './selection.ts'
import type { Anchor } from '../structure/index.ts'

// jsdom lays nothing out, so a range has no boxes. Nothing here is about where
// the selection sits on screen; this only keeps `describe` from tripping.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)

const TEXT = 'The dog sat down. The cat laughed at him, loudly. Nobody else did.'

/** A paragraph on the page, with the id an anchor names. */
function page(): HTMLElement {
  document.body.innerHTML = `<main id="strip"><p id="ch01-s01-p001">${TEXT}</p></main>`
  return document.getElementById('strip') as HTMLElement
}

/** A selection over `flat[at .. end)` of the paragraph's single text node. */
function pick(root: HTMLElement, at: number, end: number): ReaderSelection {
  const node = document.getElementById('ch01-s01-p001')!.firstChild as Text
  const range = document.createRange()
  range.setStart(node, at)
  range.setEnd(node, end)
  const made = describeRange(range, root)
  if (!made) throw new Error('the test selection did not describe')
  return made
}

afterEach(() => {
  document.body.innerHTML = ''
  delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint
})

/** jsdom has no hit testing, so the point-to-caret step is stood in for. */
function caretAt(node: Node, offset: number): void {
  ;(document as unknown as { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => {
    const range = document.createRange()
    range.setStart(node, offset)
    return range
  }
}

describe('text with no paragraph behind it', () => {
  /*
   * The tutor's answers. An answer is markdown in a bubble — it is not part of
   * the book, so it has no anchor, and the book's own `wordAt` and
   * `selectionBetween` both refuse anything they cannot anchor. These are the
   * same work with that one requirement lifted, so that a reader can keep a
   * line Veda said the same way they keep a line the book said.
   */
  function answer(): HTMLElement {
    document.body.innerHTML = `<div id="slip"><p>${TEXT}</p><p>And that was that.</p></div>`
    return document.getElementById('slip') as HTMLElement
  }

  function words(): Text {
    return document.querySelector('#slip p')!.firstChild as Text
  }

  it('picks the whole word under the finger', () => {
    const root = answer()
    // Inside "laughed", not at either end of it.
    caretAt(words(), 29)

    expect(wordAtIn(0, 0, root)?.text).toBe('laughed')
  })

  it('gives nothing for a finger between two words', () => {
    const root = answer()
    // The space after "dog".
    caretAt(words(), 7)

    expect(wordAtIn(0, 0, root)).toBeNull()
  })

  it('gives nothing for a point outside the answer', () => {
    const root = answer()
    document.body.insertAdjacentHTML('beforeend', '<p id="elsewhere">Somewhere else.</p>')
    caretAt(document.getElementById('elsewhere')!.firstChild!, 3)

    expect(wordAtIn(0, 0, root)).toBeNull()
  })

  it('stretches one end of a pick, and lets it cross the other', () => {
    const root = answer()
    const range = document.createRange()
    range.setStart(words(), 18)
    range.setEnd(words(), 21)
    const held = describeSpan(range, root)!
    expect(held.text).toBe('The')

    // Drag the start backwards, well before the pivot.
    caretAt(words(), 4)
    expect(spanBetween(pivotFor(held, 'start'), 0, 0, root)?.text).toBe('dog sat down. The')

    // And past the pivot, which swaps the ends rather than jamming.
    caretAt(words(), 33)
    expect(spanBetween(pivotFor(held, 'start'), 0, 0, root)?.text).toBe('cat laughed')
  })

  it('reaches across the paragraphs inside one answer', () => {
    /*
     * An answer is markdown: headings, paragraphs and lists, not one text node.
     * A pick that runs from one into the next is an ordinary thing to want.
     *
     * The two paragraphs join with no space between them, because a Range's
     * text is the characters it covers and there is no character between
     * `</p>` and `<p>`. The book's highlights have always read this way. It is
     * recorded here rather than worked around: changing it means building the
     * words some way other than from the range, in code the book shares.
     */
    const root = answer()
    const range = document.createRange()
    range.setStart(words(), 50)
    range.setEnd(document.querySelectorAll('#slip p')[1]!.firstChild!, 8)

    expect(describeSpan(range, root)?.text).toBe('Nobody else did.And that')
  })
})

describe('growing a selection', () => {
  it('takes the sentence around a word', () => {
    const root = page()
    // "laughed", well inside the second sentence.
    const grown = selectAround(pick(root, 26, 33), 'sentence', root)
    expect(grown?.text).toBe('The cat laughed at him, loudly.')
  })

  it('takes the sentence the selection starts in, not the one it ends in', () => {
    const root = page()
    // A drag that overshot into the next sentence still means "this one".
    const grown = selectAround(pick(root, 4, 22), 'sentence', root)
    expect(grown?.text).toBe('The dog sat down.')
  })

  it('takes the whole paragraph', () => {
    const root = page()
    expect(selectAround(pick(root, 22, 28), 'paragraph', root)?.text).toBe(TEXT)
  })

  it('offers nothing when the selection is already the sentence', () => {
    const root = page()
    // A button that changes nothing teaches the reader to doubt the menu.
    expect(selectAround(pick(root, 0, 17), 'sentence', root)).toBeNull()
  })

  it('offers nothing when the selection is already the paragraph', () => {
    const root = page()
    expect(selectAround(pick(root, 0, TEXT.length), 'paragraph', root)).toBeNull()
  })
})

describe('dragging one end of a selection', () => {
  it('extends forwards from the start pivot', () => {
    const root = page()
    const at = pick(root, 4, 7)
    const node = document.getElementById('ch01-s01-p001')!.firstChild as Text
    caretAt(node, 16)

    expect(selectionBetween(pivotFor(at, 'end'), 0, 0, root)?.text).toBe('dog sat down')
  })

  it('lets the end handle cross above the start', () => {
    // The report: "I can only take the cursor down. I cannot take my second
    // cursor above the first sentence." A crossing used to be refused.
    const root = page()
    const at = pick(root, 4, 7)
    const node = document.getElementById('ch01-s01-p001')!.firstChild as Text
    caretAt(node, 0)

    expect(selectionBetween(pivotFor(at, 'end'), 0, 0, root)?.text).toBe('The')
  })

  it('keeps what it had when the point lands on the pivot', () => {
    const root = page()
    const at = pick(root, 4, 7)
    const node = document.getElementById('ch01-s01-p001')!.firstChild as Text
    caretAt(node, 4)

    expect(selectionBetween(pivotFor(at, 'end'), 0, 0, root)).toBeNull()
  })
})

describe('a quote that covers more than one paragraph', () => {
  /** Three paragraphs, run together exactly as the parser emits them. */
  function pages(): HTMLElement {
    document.body.innerHTML =
      '<main id="strip">' +
      '<p id="ch01-s01-p001">One one one.</p>' +
      '<p id="ch01-s01-p002">Two two two.</p>' +
      '<p id="ch01-s01-p003">Three three three.</p>' +
      '</main>'
    return document.getElementById('strip') as HTMLElement
  }

  it('finds a quote that runs past the end of its own paragraph', () => {
    // The report: "I highlighted three paragraphs together. The highlight was
    // saved in Notes, but the colour was missing." The quote was looked for in
    // the anchor paragraph alone, so it was never found and never painted.
    pages()
    const quote = 'one one.Two two two.Three'

    const range = rangeOfQuote('[ch01-s01-p001]' as Anchor, quote)

    expect(range).not.toBeNull()
    expect(range?.toString()).toBe(quote)
    expect((range?.endContainer.parentElement as HTMLElement).id).toBe('ch01-s01-p003')
  })

  it('still refuses words that are not on the page', () => {
    pages()
    expect(rangeOfQuote('[ch01-s01-p001]' as Anchor, 'four four four')).toBeNull()
  })

  /*
   * Read-aloud's use: the speech engine reports its progress as a character
   * offset, and the page has to turn to the character that offset names.
   */
  describe('rangeAtOffset', () => {
    const quoted = (quote: string) => rangeOfQuote('[ch01-s01-p001]' as Anchor, quote)!

    it('finds the character at an offset', () => {
      pages()
      const range = quoted('one one.')
      expect(rangeAtOffset(range, 0)?.toString()).toBe('o')
      expect(rangeAtOffset(range, 4)?.toString()).toBe('o')
      expect(rangeAtOffset(range, 7)?.toString()).toBe('.')
    })

    it('counts on across the paragraphs a range covers', () => {
      pages()
      // The range is "one one.Two two two.Three"; offset 8 is the "T" that
      // opens the second paragraph.
      const range = quoted('one one.Two two two.Three')
      expect(rangeAtOffset(range, 8)?.toString()).toBe('T')
    })

    it('answers null past the end, and for a negative offset', () => {
      pages()
      const range = quoted('one one.')
      expect(rangeAtOffset(range, 99)).toBeNull()
      expect(rangeAtOffset(range, -1)).toBeNull()
    })
  })
})
