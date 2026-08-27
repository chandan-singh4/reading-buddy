// @vitest-environment jsdom
//
// The marks put back on a picked line.
//
// The reader's report, 2026-08-26: "the part that I just saved, did not get
// saved how it was in the answer in the markdown format." A range's text is
// plain, so a saved line arrived in the Notes tab with its bold, its bullets
// and its headings gone.

import { describe, expect, it } from 'vitest'

import { markdownOfRange, recoverMarkdown, wordsIn } from './pickMarkdown.ts'

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

describe('finding a line kept before it had plain words to search by', () => {
  /*
   * The reader's report, three times: a tap on one of Veda's Quotes opened the
   * conversation but not the place. Every line kept before `quote` existed has
   * only its markdown, and the marks are not on the page — so the search could
   * never match, and those notes would have stayed broken for ever.
   */
  it('finds a line by its markdown, marks and all', () => {
    const root = answer('<p data-md="paragraph">You are <strong>already</strong> free.</p>')
    expect(wordsIn(root, 'You are **already** free.')?.toString()).toBe('You are already free.')
  })

  it('finds a numbered item saved with its number', () => {
    const root = answer('<ol><li data-md="item">Everything you perceive is stored.</li></ol>')
    expect(wordsIn(root, '1. Everything you perceive is stored.')?.toString()).toBe(
      'Everything you perceive is stored.',
    )
  })

  it('lands on the opening when the answer has changed since', () => {
    // Better the first sentence than the top of a five-screen answer.
    const root = answer(
      '<p data-md="paragraph">Everything you perceive gets dumped into the storehouse.</p>',
    )
    const range = wordsIn(
      root,
      'Everything you perceive gets dumped into the storehouse, and most of it you never noticed.',
    )

    // It stops at "the": the note reads "storehouse," and the page reads
    // "storehouse." — the longest opening that is really there is the answer.
    expect(range?.toString()).toBe('Everything you perceive gets dumped into the')
  })

  it('will not match on a scrap too short to mean anything', () => {
    const root = answer('<p data-md="paragraph">A symbol is a picture.</p>')
    expect(wordsIn(root, 'A **s**')).toBeNull()
  })
})

describe('mending a line kept before its marks were', () => {
  /*
   * The reader's report, four times over, with the same picture each time. The
   * note reads as one run of prose — "never consciously noticed.Unconscious →"
   * — because that is what `range.toString()` gives: nothing at all between two
   * blocks. No change to the saving path can reach a note already written.
   *
   * The answer it came out of is still in its thread, and that is markdown. So
   * the words are found in it and the marks are read off around them.
   */
  const said = [
    '1. **Experiences → Unconscious:** Everything you perceive gets dumped into the storehouse. Most of it you never consciously noticed.',
    '2. **Unconscious → Perception/Life:** Later, that stored material *reaches back up*.',
    '',
    "**So it's not A or B. It's A ⇄ B.**",
    '',
    '- You are not the sole author of your life.',
    '- You are the editor.',
  ].join('\n')

  it('puts the numbers, the bullets and the bold back', () => {
    // Exactly what the old note holds: no marks, and no gap at the joins.
    const flat =
      'Experiences → Unconscious: Everything you perceive gets dumped into the storehouse. ' +
      'Most of it you never consciously noticed.Unconscious → Perception/Life: Later, that ' +
      "stored material reaches back up.So it's not A or B. It's A ⇄ B.You are not the sole " +
      'author of your life.You are the editor.'

    expect(recoverMarkdown(flat, said)).toBe(said)
  })

  it('keeps the marker on a single item, not just the words', () => {
    const one = 'Unconscious → Perception/Life: Later, that stored material reaches back up.'
    expect(recoverMarkdown(one, said)).toBe(
      '2. **Unconscious → Perception/Life:** Later, that stored material *reaches back up*.',
    )
  })

  it('leaves a line alone when it is not in the answer', () => {
    expect(recoverMarkdown('Words from another conversation entirely.', said)).toBeNull()
  })

  it('will not mend from a scrap', () => {
    expect(recoverMarkdown('You are', said)).toBeNull()
  })
})
