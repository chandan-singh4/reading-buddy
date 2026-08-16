// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { htmlToBlocks } from './html.ts'
import { appearanceOf, baselineOf, readStyles, sizeToRatio } from './styles.ts'

function elementOf(html: string): Element {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return doc.body.firstElementChild!
}

describe('sizeToRatio', () => {
  it('reads every unit a book might state a size in', () => {
    expect(sizeToRatio('1.5em')).toBe(1.5)
    expect(sizeToRatio('1.5rem')).toBe(1.5)
    expect(sizeToRatio('150%')).toBe(1.5)
    expect(sizeToRatio('24px')).toBe(1.5)
    expect(sizeToRatio('x-large')).toBe(1.5)
  })

  it('gives up rather than guess', () => {
    expect(sizeToRatio('inherit')).toBeNull()
    expect(sizeToRatio('')).toBeNull()
  })
})

describe('appearanceOf', () => {
  const sheet = readStyles([
    'p { font-size: 1em; text-indent: 1.2em }',
    'p.head { font-size: 1.6em; font-weight: bold; text-align: center; text-indent: 0 }',
  ])

  it('finds the style a class carries', () => {
    const style = appearanceOf(elementOf('<p class="head">Contents</p>'), sheet)
    expect(style).toMatchObject({ size: 1.6, bold: true, centred: true, indented: false })
  })

  it('lets the more specific rule win over the plain tag', () => {
    // Both `p` and `p.head` match. `p` comes first in the sheet, so only
    // specificity can stop it from being the last word on the indent.
    expect(appearanceOf(elementOf('<p class="head">X</p>'), sheet).indented).toBe(false)
    expect(appearanceOf(elementOf('<p>X</p>'), sheet).indented).toBe(true)
  })

  it('lets an inline style beat the stylesheet', () => {
    const style = appearanceOf(elementOf('<p style="font-size: 2em">X</p>'), sheet)
    expect(style.size).toBe(2)
  })

  it('counts a wrapper that covers the whole line', () => {
    expect(appearanceOf(elementOf('<p><b>The Three Projects</b></p>'), sheet).bold).toBe(true)
    expect(appearanceOf(elementOf('<p>A <b>very</b> good dog.</p>'), sheet).bold).toBe(false)
  })
})

describe('baselineOf', () => {
  it('follows the text, not the number of blocks', () => {
    // Forty headings against three paragraphs. The paragraphs still carry the
    // book, so they are still the baseline.
    const headings = Array.from({ length: 40 }, () => ({ size: 1.6, length: 12 }))
    const prose = Array.from({ length: 3 }, () => ({ size: 1, length: 600 }))
    expect(baselineOf([...headings, ...prose])).toBe(1)
  })

  it('is 1 when there is nothing to measure', () => {
    expect(baselineOf([])).toBe(1)
  })
})

describe('htmlToBlocks with the book’s own stylesheet', () => {
  // The shape a converted book actually arrives in: no <h1> anywhere, and every
  // difference between a title and a sentence stated in CSS.
  const css = `
    p { font-size: 1em; text-indent: 1.2em; }
    p.chaphead { font-size: 1.8em; font-weight: bold; text-align: center; text-indent: 0; }
  `
  const html = `
    <p class="chaphead">Skywoman Falling</p>
    <p>She fell like a maple seed, pirouetting on an autumn breeze.</p>
  `

  it('reads a styled title as prose when the CSS is withheld', () => {
    const blocks = htmlToBlocks(html)
    expect(blocks[0]).toEqual({ kind: 'prose', text: 'Skywoman Falling' })
  })

  it('sets it apart once the CSS is given', () => {
    const blocks = htmlToBlocks(html, readStyles([css]))
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Skywoman Falling' })
    expect(blocks[1]!.kind).toBe('prose')
    expect(blocks[1]!.label).toBeUndefined()
  })

  it('does not turn a book set entirely in bold into headings', () => {
    // One signal is never enough. Every line here is bold and every line is
    // body text.
    const bold = readStyles(['p { font-weight: bold; font-size: 1em; }'])
    const blocks = htmlToBlocks('<p>Skywoman Falling</p><p>Bright fields</p>', bold)
    expect(blocks.every((block) => block.label === undefined)).toBe(true)
  })

  it('judges size against this book, not against a fixed number', () => {
    // Body text set at 2em. The title is smaller in absolute terms than the
    // body text of the previous book, and is still the title of this one.
    const big = readStyles([
      'p { font-size: 2em; text-indent: 1em; }',
      'p.t { font-size: 2.6em; text-align: center; text-indent: 0; }',
    ])
    const blocks = htmlToBlocks(
      '<p class="t">Skywoman Falling</p><p>She fell like a maple seed on the wind.</p>',
      big,
    )
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Skywoman Falling' })
  })

  it('keeps the book’s own contents page', () => {
    // The reader asked for this page. It belongs to the book, the same as a
    // dedication or an epigraph does. The app's Contents tab is a separate
    // thing, built from the navigation, and it does not replace this page.
    const blocks = htmlToBlocks(`
      <p class="chaphead">Contents</p>
      <p>Preface</p>
      <p>Planting Sweetgrass</p>
      <p>Skywoman Falling</p>
    `, readStyles([css]))
    const text = blocks.map((block) => block.text)
    expect(text).toContain('Contents')
    expect(text).toContain('Preface')
    expect(text).toContain('Skywoman Falling')
  })

  it('keeps the chapter title that follows a contents page', () => {
    // The rule this replaces read forward from "Contents" and turned every
    // short line into furniture. "Preface" is exactly that shape, so the book
    // lost its Preface entirely.
    const blocks = htmlToBlocks(`
      <p class="chaphead">Contents</p>
      <p class="chaphead">Preface</p>
      <p>She fell like a maple seed, pirouetting on an autumn breeze.</p>
    `, readStyles([css]))
    expect(blocks.map((block) => block.text)).toContain('Preface')
    expect(blocks.some((block) => block.kind === 'furniture')).toBe(false)
  })

  describe('promoting styled headings to real ones', () => {
    // The shape of the reported book: a part title set larger than the chapter
    // titles under it, and not one <h1> in the file.
    const book = readStyles([
      'p { font-size: 1em; text-indent: 1.2em; }',
      'p.part { font-size: 2em; font-weight: bold; text-align: center; text-indent: 0; }',
      'p.chap { font-size: 1.4em; font-weight: bold; text-indent: 0; }',
    ])
    const markup = `
      <p class="part">Planting Sweetgrass</p>
      <p>Sweetgrass is best planted not by seed, but by putting roots in the ground.</p>
      <p class="chap">Skywoman Falling</p>
      <p>In winter, when the green earth lies resting beneath a blanket of snow.</p>
      <p class="chap">The Council of Pecans</p>
      <p>Nuts fell that year in numbers nobody in the valley could remember.</p>
    `

    it('makes them headings, so the book has divisions to list', () => {
      const blocks = htmlToBlocks(markup, book)
      expect(blocks.filter((block) => block.kind === 'heading').map((block) => block.text)).toEqual([
        'Planting Sweetgrass',
        'Skywoman Falling',
        'The Council of Pecans',
      ])
    })

    it('ranks the larger title above the ones beneath it', () => {
      const levels = htmlToBlocks(markup, book)
        .filter((block) => block.kind === 'heading')
        .map((block) => block.level)
      expect(levels).toEqual([1, 2, 2])
    })

    it('leaves a document that states its own structure alone', () => {
      const blocks = htmlToBlocks(`<h1>Skywoman Falling</h1>${markup}`, book)
      // One real heading, and the styled lines stay labelled prose beneath it.
      expect(blocks.filter((block) => block.kind === 'heading')).toHaveLength(1)
      expect(blocks.filter((block) => block.label === 'subheading')).toHaveLength(3)
    })

    it('refuses when most of a long document came back a heading', () => {
      // Ten short styled lines and nothing else. A rule has matched too widely,
      // and cutting a chapter into ten divisions is worse than flat emphasis.
      const many = Array.from({ length: 10 }, (_, i) => `<p class="chap">Line ${i}</p>`).join('')
      expect(htmlToBlocks(many, book).some((block) => block.kind === 'heading')).toBe(false)
    })

    it('still promotes the one line on a part-title page', () => {
      // An epub gives a part its own file. It is 100% heading, and correct.
      const blocks = htmlToBlocks('<p class="part">Planting Sweetgrass</p>', book)
      expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Planting Sweetgrass' })
    })
  })

  it('leaves a book with no contents page alone', () => {
    const blocks = htmlToBlocks('<p>Preface</p><p>Skywoman Falling</p>')
    expect(blocks.every((block) => block.kind === 'prose')).toBe(true)
  })
})

describe('a selector that asks for an ancestor', () => {
  /** The deepest element in a fragment — the one the rule is about. */
  function deepest(html: string): Element {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    return doc.querySelector('[data-target]')!
  }

  const sheet = readStyles(['.pref p { font-style: italic }'])

  it('applies the rule inside that ancestor', () => {
    const element = deepest('<div class="pref"><p data-target>The preface.</p></div>')
    expect(appearanceOf(element, sheet).italic).toBe(true)
  })

  it('leaves every other paragraph in the book alone', () => {
    // The whole point. Reading the rightmost compound alone made `.pref p` a
    // rule about every `<p>` there is, so one preface set a whole book italic.
    const element = deepest('<div class="chap"><p data-target>The body.</p></div>')
    expect(appearanceOf(element, sheet).italic).toBe(false)
  })

  it('finds an ancestor that is not the direct parent', () => {
    const element = deepest('<div class="pref"><blockquote><p data-target>Quoted.</p></blockquote></div>')
    expect(appearanceOf(element, sheet).italic).toBe(true)
  })

  it('wants the ancestors in the order the selector gave them', () => {
    const deep = readStyles(['.a .b p { font-weight: bold }'])
    expect(appearanceOf(deepest('<div class="a"><div class="b"><p data-target>x</p></div></div>'), deep).bold).toBe(true)
    expect(appearanceOf(deepest('<div class="b"><div class="a"><p data-target>x</p></div></div>'), deep).bold).toBe(false)
  })

  it('reads `>` as an ancestor too', () => {
    // A relaxation, not an error: a child is also a descendant, so this can only
    // ever match a little too widely — never too narrowly.
    const child = readStyles(['.pref > p { font-style: italic }'])
    expect(appearanceOf(deepest('<div class="pref"><p data-target>x</p></div>'), child).italic).toBe(true)
  })

  it('falls back to the rightmost compound for a sibling selector', () => {
    // `+` and `~` are not ancestry and this file cannot answer them. Dropping
    // the chain keeps the old behaviour rather than inventing an answer.
    const sibling = readStyles(['h1 + p { font-style: italic }'])
    expect(appearanceOf(deepest('<div><p data-target>x</p></div>'), sibling).italic).toBe(true)
  })

  it('lets the more specific rule win', () => {
    const both = readStyles(['p { font-size: 1em } .pref p { font-size: 2em }'])
    expect(appearanceOf(deepest('<div class="pref"><p data-target>x</p></div>'), both).size).toBe(2)
  })

  it('ignores a rule that styles a pseudo-element, not the element', () => {
    // The drop cap every publisher opens a chapter with. *Determined* sets it at
    // 5em, after the plain `p.body` rule — so read as an ordinary rule it wins
    // on source order and the whole first paragraph is set five times body size.
    const cap = readStyles([
      'p.body { font-size: 1em }',
      'p.body::first-letter { font-size: 5em }',
    ])
    expect(appearanceOf(deepest('<p class="body" data-target>x</p>'), cap).size).toBe(1)
  })

  it('drops the legacy single-colon spelling too', () => {
    const old = readStyles(['p { font-size: 1em }', 'p:first-letter { font-size: 5em }'])
    expect(appearanceOf(deepest('<p data-target>x</p>'), old).size).toBe(1)
  })

  it('still reads a pseudo-class, which selects the element itself', () => {
    // `:first-child` only narrows *which* paragraphs. Ignoring the qualifier
    // matches a little too widely, which is the relaxation this file already
    // makes for `>` — not the wrong element entirely.
    const first = readStyles(['p:first-child { font-style: italic }'])
    expect(appearanceOf(deepest('<div><p data-target>x</p></div>'), first).italic).toBe(true)
  })
})
