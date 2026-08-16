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

  it('drops a contents page that carries no nav', () => {
    const blocks = htmlToBlocks(`
      <p class="chaphead">Contents</p>
      <p>Preface</p>
      <p>Planting Sweetgrass</p>
      <p>Skywoman Falling</p>
    `, readStyles([css]))
    expect(blocks.every((block) => block.kind === 'furniture')).toBe(true)
  })

  it('stops at the chapter that follows the contents', () => {
    const blocks = htmlToBlocks(`
      <p class="chaphead">Contents</p>
      <p>Preface</p>
      <p>She fell like a maple seed, pirouetting on an autumn breeze.</p>
      <p>Winter is the time for telling stories, and the elders say so.</p>
      <p>The story goes that she came from Skyworld above.</p>
    `, readStyles([css]))
    expect(blocks.filter((block) => block.kind === 'prose').map((block) => block.text)).toEqual([
      'She fell like a maple seed, pirouetting on an autumn breeze.',
      'Winter is the time for telling stories, and the elders say so.',
      'The story goes that she came from Skyworld above.',
    ])
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
