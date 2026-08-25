import { describe, expect, it } from 'vitest'

import { bandPath, bandsIn, bandsOf } from './pdfFigures.ts'
import type { PdfPage, PdfTextItem } from './pdf-layout.ts'

/** One line of text, sitting with its baseline at `y`. */
function line(y: number, height = 12): PdfTextItem {
  return { str: 'Some words on a line.', x: 72, y, width: 400, height }
}

function page(items: PdfTextItem[], height = 800): PdfPage {
  return { width: 600, height, items }
}

describe('bandsOf', () => {
  it('finds the gap between two blocks of text', () => {
    /*
     * An 800-point page: text down to a baseline of 660, nothing until 300.
     *
     * The band runs from just under the descenders of the line above (657) to
     * the top of the glyphs on the line below (312). `top` is the larger
     * number because PDF coordinates count up from the foot of the page.
     */
    const items = [line(700), line(680), line(660), line(300), line(280)]
    expect(bandsOf(page(items), 3)).toEqual([{ page: 3, top: 657, bottom: 312 }])
  })

  it('ignores a gap shorter than a fifth of the page', () => {
    // A scene break: three lines of space, nothing more.
    expect(bandsOf(page([line(700), line(600)]), 1)).toEqual([])
  })

  it('treats a page with no text as one full-page picture', () => {
    expect(bandsOf(page([]), 7)).toEqual([{ page: 7, top: 800, bottom: 0 }])
  })

  it('treats a page of whitespace as a page with no text', () => {
    const blank: PdfTextItem = { str: '   ', x: 0, y: 400, width: 10, height: 12 }
    expect(bandsOf(page([blank]), 2)).toEqual([{ page: 2, top: 800, bottom: 0 }])
  })

  it('leaves the margins alone: a gap above all the text is not a band', () => {
    // Text only in the lower half. The empty upper half is margin as far as
    // this page is concerned, and cannot be told from a figure.
    expect(bandsOf(page([line(300), line(280), line(260)]), 1)).toEqual([])
  })

  it('finds two bands on one page, and puts them in reading order', () => {
    // Reading order, not the order the walk finds them in: the walk goes up
    // the page because PDF coordinates do, and a reader goes down it.
    const items = [line(780), line(500), line(200)]
    const bands = bandsOf(page(items), 1)
    expect(bands).toHaveLength(2)
    expect(bands[0]!.bottom).toBeGreaterThan(bands[1]!.top)
  })

  it('is not fooled by a glyph claiming to be taller than the page', () => {
    // A broken transform: one item says it is 400 points high. Left alone it
    // would cover the gap under it and hide a real plate.
    const giant: PdfTextItem = { str: 'A', x: 72, y: 700, width: 10, height: 400 }
    expect(bandsOf(page([giant, line(300)]), 1)).toHaveLength(1)
  })

  it('answers nothing for a page with no height', () => {
    expect(bandsOf(page([line(100)], 0), 1)).toEqual([])
  })

  it('reads items in any order', () => {
    const up = [line(300), line(660), line(700)]
    const down = [line(700), line(660), line(300)]
    expect(bandsOf(page(up), 1)).toEqual(bandsOf(page(down), 1))
  })
})

describe('bandsIn', () => {
  it('numbers pages as a reader counts them, from one', () => {
    const bands = bandsIn([page([]), page([])])
    expect(bands.map((band) => band.page)).toEqual([1, 2])
  })
})

describe('bandPath', () => {
  it('sorts by page when the paths are sorted as text', () => {
    const second = bandPath({ page: 2, top: 500, bottom: 100 })
    const tenth = bandPath({ page: 10, top: 500, bottom: 100 })
    expect([tenth, second].sort()).toEqual([second, tenth])
  })

  it('gives two bands on one page two different paths', () => {
    expect(bandPath({ page: 1, top: 700, bottom: 500 })).not.toBe(
      bandPath({ page: 1, top: 400, bottom: 200 }),
    )
  })
})
