// @vitest-environment jsdom
//
// The marks put back on a picked line.
//
// The reader's report, 2026-08-26: "the part that I just saved, did not get
// saved how it was in the answer in the markdown format." A range's text is
// plain, so a saved line arrived in the Notes tab with its bold, its bullets
// and its headings gone.

import { describe, expect, it } from 'vitest'

import { markdownOfRange, wordsIn } from './pickMarkdown.ts'

/** An answer on the page, drawn the way `markdown.tsx` draws one. */
function answer(html: string): HTMLElement {
  document.body.innerHTML = `<div id="answer">${html}</div>`
  return document.getElementById('answer')!
}

/** The markdown for everything inside an element. */
function allOf(root: HTMLElement): string {
  const range = document.createRange()
  range.selectNodeContents(root)
  return markdownOfRange(range)
}

describe('writing the marks back on', () => {
  it('keeps bold, italic and code', () => {
    const root = answer('<p data-md="paragraph">A symbol is <strong>not</strong> a <em>sign</em>.</p>')
    expect(allOf(root)).toBe('A symbol is **not** a _sign_.')
  })

  it('keeps a heading, and the blank line that makes it one', () => {
    const root = answer(
      '<p data-md="heading">Two kinds</p><p data-md="paragraph">One points. One holds.</p>',
    )
    expect(allOf(root)).toBe('## Two kinds\n\nOne points. One holds.')
  })

  it('numbers an ordered list from where the reader saw it start', () => {
    const root = answer(
      '<ol start="3"><li data-md="item">Third</li><li data-md="item">Fourth</li></ol>',
    )
    expect(allOf(root)).toBe('3. Third\n\n4. Fourth')
  })

  it('bullets an unordered list', () => {
    const root = answer('<ul><li data-md="item">One</li><li data-md="item">Two</li></ul>')
    expect(allOf(root)).toBe('- One\n\n- Two')
  })

  it('fences a code block, and does not double its backticks', () => {
    const root = answer('<pre data-md="block"><code>const x = 1</code></pre>')
    expect(allOf(root)).toBe('```\nconst x = 1\n```')
  })

  it('marks a quote', () => {
    const root = answer('<blockquote data-md="quote">Nobody else did.</blockquote>')
    expect(allOf(root)).toBe('> Nobody else did.')
  })

  it('keeps a link with its address', () => {
    const root = answer('<p data-md="paragraph">See <a href="/notes">the notes</a>.</p>')
    expect(allOf(root)).toBe('See [the notes](/notes).')
  })

  it('writes no marks when a pick clips the edge of a bold word', () => {
    /*
     * A pair of asterisks with nothing between them is two asterisks, not
     * emphasis. This is what a pick that stops just inside a `<strong>` leaves
     * behind, and it happens whenever a finger lands near a boundary.
     */
    const root = answer('<p data-md="paragraph">A <strong>whole</strong> word</p>')
    const bold = root.querySelector('strong')!.firstChild!
    const range = document.createRange()
    range.setStart(root.firstChild!.firstChild!, 0)
    range.setEnd(bold, 0)

    expect(markdownOfRange(range)).toBe('A')
  })

  it('takes only the part of a paragraph the reader picked', () => {
    const root = answer('<p data-md="paragraph">A symbol is <strong>not</strong> a sign.</p>')
    const words = root.firstChild!.firstChild!
    const range = document.createRange()
    range.setStart(words, 2)
    range.setEnd(root.querySelector('strong')!.firstChild!, 3)

    expect(markdownOfRange(range)).toBe('symbol is **not**')
  })
})

describe('finding a kept line again', () => {
  it('finds the plain words, marks and all', () => {
    // The point of storing the plain words beside the markdown: the page holds
    // a `<strong>`, never two asterisks, so the marks could not be searched for.
    const root = answer('<p data-md="paragraph">A symbol is <strong>not</strong> a sign.</p>')
    const range = wordsIn(root, 'is not a sign')

    expect(range?.toString()).toBe('is not a sign')
  })

  it('answers null when the words are not in this answer', () => {
    const root = answer('<p data-md="paragraph">A symbol is a picture.</p>')
    expect(wordsIn(root, 'something else entirely')).toBeNull()
  })

  it('answers null for empty words', () => {
    const root = answer('<p data-md="paragraph">A symbol is a picture.</p>')
    expect(wordsIn(root, '   ')).toBeNull()
  })
})

describe('the answer from the reader’s screenshot', () => {
  /*
   * The report, 2026-08-26, with two pictures side by side: a numbered list
   * with bold lead-ins, a bold line under it, and three bullets. Saved, it
   * arrived as one run of prose with the sentences welded together —
   * "noticed.Unconscious →". This is that answer's shape, kept as a test so it
   * cannot quietly go flat again.
   */
  it('keeps every line on its own line, with its marks', () => {
    const root = answer(
      '<ol>' +
        '<li data-md="item"><strong>Experiences → Unconscious:</strong> Everything you perceive.</li>' +
        '<li data-md="item"><strong>Unconscious → Perception:</strong> Later, that material <em>reaches back up</em>.</li>' +
        '</ol>' +
        '<p data-md="paragraph"><strong>So it’s not A or B.</strong></p>' +
        '<ul>' +
        '<li data-md="item">You are not the sole author of your life.</li>' +
        '<li data-md="item">You are the editor.</li>' +
        '</ul>',
    )

    expect(allOf(root)).toBe(
      [
        '1. **Experiences → Unconscious:** Everything you perceive.',
        '2. **Unconscious → Perception:** Later, that material _reaches back up_.',
        '**So it’s not A or B.**',
        '- You are not the sole author of your life.',
        '- You are the editor.',
      ].join('\n\n'),
    )
  })
})
