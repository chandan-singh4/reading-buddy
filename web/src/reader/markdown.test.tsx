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

import { Markdown } from './markdown.tsx'

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
