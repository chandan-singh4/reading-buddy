// @vitest-environment jsdom
//
// The formatting inside a tutor answer.
//
// Two things are being guarded. The first is that the marks disappear and the
// meaning stays: `**a**` must leave a bold "a" and no asterisks anywhere. The
// second is that nothing a model writes can become markup — the text comes off
// the wire and lands in the page, so the escape hatches are tested as hard as
// the features.

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Markdown, whileWriting } from './markdown.tsx'

afterEach(cleanup)

/** The rendered answer, as one element. */
function draw(text: string): HTMLElement {
  const { container } = render(<Markdown text={text} />)
  return container.firstElementChild as HTMLElement
}

describe('emphasis', () => {
  it('draws bold, and keeps no asterisks', () => {
    const out = draw('The **mind** talks in pictures.')
    expect(out.querySelector('strong')?.textContent).toBe('mind')
    expect(out.textContent).toBe('The mind talks in pictures.')
  })

  it('draws italic from either mark', () => {
    expect(draw('a *word* here').querySelector('em')?.textContent).toBe('word')
    expect(draw('a _word_ here').querySelector('em')?.textContent).toBe('word')
  })

  it('draws bold and italic together', () => {
    const out = draw('***both***')
    expect(out.querySelector('strong em')?.textContent).toBe('both')
  })

  it('nests one inside the other', () => {
    const out = draw('**bold with *stress* in it**')
    expect(out.querySelector('strong')?.textContent).toBe('bold with stress in it')
    expect(out.querySelector('strong em')?.textContent).toBe('stress')
  })

  it('draws a struck-through phrase', () => {
    expect(draw('~~wrong~~ right').querySelector('s')?.textContent).toBe('wrong')
  })

  it('leaves a lone asterisk alone', () => {
    expect(draw('2 * 3 = 6').textContent).toBe('2 * 3 = 6')
  })
})

describe('code', () => {
  it('draws an inline span of code', () => {
    expect(draw('call `useEffect` here').querySelector('code')?.textContent).toBe('useEffect')
  })

  it('keeps a fenced block whole, newlines and all', () => {
    const out = draw('Try this:\n\n```js\nconst a = 1\nconst b = 2\n```')
    expect(out.querySelector('pre code')?.textContent).toBe('const a = 1\nconst b = 2')
  })

  it('closes an unfinished fence at the end of the answer', () => {
    // A cut-off answer must not swallow the page or throw.
    expect(draw('```\nhalf a th').querySelector('pre')?.textContent).toBe('half a th')
  })
})

describe('blocks', () => {
  it('splits paragraphs on a blank line', () => {
    expect(draw('One.\n\nTwo.').querySelectorAll('p')).toHaveLength(2)
  })

  it('keeps a wrapped line in the same paragraph', () => {
    const out = draw('One line\nand its continuation.')
    expect(out.querySelectorAll('p')).toHaveLength(1)
  })

  it('draws a bullet list', () => {
    const out = draw('- first\n- second\n- third')
    expect(out.querySelectorAll('ul li')).toHaveLength(3)
    expect(out.querySelectorAll('li')[1]?.textContent).toBe('second')
  })

  it('draws a numbered list as a numbered list', () => {
    const out = draw('1. first\n2. second')
    expect(out.querySelector('ol')).toBeTruthy()
    expect(out.querySelectorAll('ol li')).toHaveLength(2)
  })

  it('formats inside a list item', () => {
    expect(draw('- a **bold** point').querySelector('li strong')?.textContent).toBe('bold')
  })

  it('draws a heading as a small title, at every level', () => {
    expect(draw('## In short').textContent).toBe('In short')
    expect(draw('## In short').querySelector('p')?.className).toContain('heading')
    expect(draw('###### Deep').querySelector('p')?.className).toContain('heading')
  })

  it('draws a quote', () => {
    expect(draw('> the quoted line').querySelector('blockquote')?.textContent).toBe(
      'the quoted line',
    )
  })

  it('draws a rule', () => {
    expect(draw('one\n\n---\n\ntwo').querySelector('hr')).toBeTruthy()
  })

  it('gives an empty answer nothing to draw', () => {
    expect(draw('').textContent).toBe('')
  })
})

describe('formulas', () => {
  it('sets an inline formula apart', () => {
    const out = draw('so $E = mc^2$ follows')
    expect(out.querySelector('span[class*="formula"]')?.textContent).toBe('E = mc^2')
  })

  it('leaves money alone', () => {
    expect(draw('it cost $5 and then $10').textContent).toBe('it cost $5 and then $10')
  })

  it('draws a display formula on its own', () => {
    const out = draw('Here:\n\n$$\na^2 + b^2 = c^2\n$$')
    expect(out.querySelector('div[class*="display"]')?.textContent).toBe('a^2 + b^2 = c^2')
  })
})

describe('a table, stacked', () => {
  // A model reaches for a table whenever the answer has a shape. On a phone a
  // grid is unreadable, so each row is drawn as a small stacked entry. These
  // tests hold the two ends of that: no pipes survive, and no cell is lost.

  it('keeps every cell and drops every pipe', () => {
    const out = draw('| **Meru** | The spine. | Body mirrors cosmos. |')
    expect(out.textContent).toBe('MeruThe spine.Body mirrors cosmos.')
    expect(out.textContent).not.toContain('|')
  })

  it('leads on the first cell, so a row reads as an entry with a heading', () => {
    const out = draw('| **Meru** | The spine. |')
    expect(out.querySelector('dt[class*="lead"]')?.textContent).toBe('Meru')
  })

  it('keeps the emphasis the model put inside a cell', () => {
    const out = draw('| **Meru** | the *spine* |')
    expect(out.querySelector('strong')?.textContent).toBe('Meru')
    expect(out.querySelector('em')?.textContent).toBe('spine')
  })

  it('draws one entry per row', () => {
    const out = draw(`| a | one |
| b | two |
| c | three |`)
    // `_row_` and not `_rows_`: the outer stack must not be counted as an entry.
    expect(out.querySelectorAll('[class*="_row_"]').length).toBe(3)
  })

  it('drops the divider under a header rather than drawing it', () => {
    const out = draw(`| Term | Meaning |
| --- | --- |
| Meru | The spine. |`)
    expect(out.textContent).not.toContain('---')
  })

  it('lifts the header out of the entries and says it once', () => {
    // The fault this fixes: the header row was drawn as though it were data,
    // so "Cosmic element" and "Symbolic body part" read as an entry of their
    // own and nothing said the rows below were pairs.
    const out = draw(`| Cosmic element | Symbolic body part |
| --- | --- |
| Mount Meru | The spinal cord |
| Four continents | Our limbs |`)
    expect(out.querySelector('[class*="caption"]')?.textContent).toBe(
      'Cosmic element · Symbolic body part',
    )
    expect(out.querySelectorAll('[class*="_row_"]').length).toBe(2)
  })

  it('pairs the term with its value, so the belonging is visible', () => {
    const out = draw(`| Term | Meaning |
| --- | --- |
| Meru | The spine. |`)
    expect(out.querySelector('dt')?.textContent).toBe('Meru')
    expect(out.querySelector('dd')?.textContent).toBe('The spine.')
  })

  it('labels each value past two columns, where the order stops being obvious', () => {
    const out = draw(`| Term | Meaning | Why |
| --- | --- | --- |
| Meru | The spine. | We mirror it. |`)
    const labels = [...out.querySelectorAll('[class*="label"]')].map((n) => n.textContent)
    expect(labels).toEqual(['Meaning', 'Why'])
    // And then no caption: it would repeat the labels word for word.
    expect(out.querySelector('[class*="caption"]')).toBeNull()
  })

  it('does not label a two-column table, where it would only be clutter', () => {
    const out = draw(`| Term | Meaning |
| --- | --- |
| Meru | The spine. |`)
    expect(out.querySelector('[class*="label"]')).toBeNull()
  })

  it('treats a table with no divider as having no header', () => {
    // Without the divider there is nothing to say the first row is a header,
    // so it stays an entry rather than being silently eaten as a caption.
    const out = draw(`| a | one |
| b | two |`)
    expect(out.querySelector('[class*="caption"]')).toBeNull()
    expect(out.querySelectorAll('[class*="_row_"]').length).toBe(2)
  })

  it('takes rows with no header row at all', () => {
    // What the models actually send: pipe rows and no `|---|` line. By the
    // specification that is not a table, and printed raw it is a wall of pipes.
    const out = draw(`| a | one |
| b | two |`)
    expect(out.querySelectorAll('[class*="_row_"]').length).toBe(2)
  })

  it('leaves a lone pipe inside a sentence alone', () => {
    const out = draw('the pipe | character is not a table')
    expect(out.textContent).toBe('the pipe | character is not a table')
  })

  it('ends the paragraph above it', () => {
    const { container } = render(<Markdown text={`Here it is:
| a | one |`} />)
    expect(container.querySelector('p')?.textContent).toBe('Here it is:')
  })
})

describe('markdown that is still being typed', () => {
  // A streamed answer is parsed after every delta. Half of a bold phrase is
  // `**Plain-language meanin` — an opening mark with no partner yet — and drawn
  // as it stands the reader watches the asterisks sit there and then vanish.

  it('closes a bold mark that has not been closed yet', () => {
    const out = draw(whileWriting('The **mind talks'))
    expect(out.querySelector('strong')?.textContent).toBe('mind talks')
    expect(out.textContent).not.toContain('*')
  })

  it('leaves a finished bold mark exactly as it was', () => {
    // The point of closing rather than hiding: when the model's own closing
    // mark lands, nothing on screen changes.
    expect(whileWriting('The **mind** talks')).toBe('The **mind** talks')
  })

  it('drops a mark that is still arriving', () => {
    // `*` on its way to becoming `**`. There is nothing to close yet. The
    // space before it stays, or the next word would jump left and back.
    expect(whileWriting('The **mind** talks *')).toBe('The **mind** talks ')
  })

  it('closes an unfinished code span', () => {
    const out = draw(whileWriting('Call `useMemo'))
    expect(out.querySelector('code')?.textContent).toBe('useMemo')
  })

  it('closes an open code fence, so the rest is not swallowed', () => {
    const out = draw(whileWriting('Here:\n```\nconst a = 1'))
    expect(out.querySelector('pre code')?.textContent).toBe('const a = 1')
  })

  it('does not pair asterisks inside a code block', () => {
    // Inside a fence they are characters, not marks. Closing the fence is the
    // whole job.
    expect(whileWriting('```\na ** b')).toBe('```\na ** b\n```')
  })

  it('holds a table back until it can be drawn as a table', () => {
    // The header row lands a whole second before the divider under it. Drawn
    // as it stands, the reader watches a line of raw pipes and then sees it
    // become a table.
    const out = draw(whileWriting(['Here it is:', '| Cosmic element | Body part |'].join('\n')))
    expect(out.textContent).not.toContain('|')
    expect(out.textContent).toContain('Here it is:')
  })

  it('draws the rows once the divider has arrived', () => {
    const table = ['| Element | Part |', '| --- | --- |', '| Mount Meru | Spine |'].join('\n')
    const out = draw(whileWriting(table))
    expect(out.textContent).toContain('Mount Meru')
    expect(out.textContent).not.toContain('|')
  })

  it('waits for a row to finish before drawing it', () => {
    // Half a row would draw with its last cell missing and then jump.
    const table = ['| Element | Part |', '| --- | --- |', '| Mount Meru | The spinal'].join('\n')
    const out = draw(whileWriting(table))
    expect(out.textContent).not.toContain('Mount Meru')
  })

  it('leaves a table alone in the middle of an answer', () => {
    // Only the block at the very end is still arriving. One already followed
    // by prose is finished.
    const table = ['| Element | Part |', '| --- | --- |', '| Meru | Spine |', '', 'And so on.'].join('\n')
    expect(whileWriting(table)).toBe(table)
  })

  it('leaves ordinary prose untouched', () => {
    expect(whileWriting('Nothing to close here.')).toBe('Nothing to close here.')
  })
})

describe('what it refuses', () => {
  it('renders HTML in an answer as text, never as markup', () => {
    const out = draw('careful: <script>alert(1)</script> and <b>not bold</b>')
    expect(out.querySelector('script')).toBeNull()
    expect(out.querySelector('b')).toBeNull()
    expect(out.textContent).toContain('<script>alert(1)</script>')
  })

  it('links only http and https', () => {
    render(<Markdown text="[the paper](https://example.org/p)" />)
    expect(screen.getByRole('link', { name: 'the paper' }).getAttribute('href')).toBe(
      'https://example.org/p',
    )
  })

  it('refuses a javascript: link and keeps the words', () => {
    const out = draw('[tap here](javascript:alert)')
    expect(out.querySelector('a')).toBeNull()
    expect(out.textContent).toBe('tap here')
  })

  it('opens a link away from the app, with no handle back to it', () => {
    render(<Markdown text="[a source](https://example.org)" />)
    const link = screen.getByRole('link', { name: 'a source' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})
