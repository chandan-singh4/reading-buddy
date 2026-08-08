// @vitest-environment jsdom
//
// jsdom has no layout and no Web Animations API, so nothing here can say what a
// turn *looks* like — that goes to the phone, as every motion change in this app
// does. What it can say is what the turning sheet is *made of*, and that is
// exactly where the fault was: the sheet was the text and nothing else, so the
// page number and the "% left" stayed nailed to the screen while the paper they
// are printed on rotated out from under them.

import { afterEach, describe, expect, it } from 'vitest'

import { cancelTurn, holdOutgoing } from './pageTurn.ts'

/**
 * The reading screen, as much of it as a page turn touches: the positioned
 * frame, the text strip inside it, and the status line marked as belonging to
 * the page.
 */
function readingScreen() {
  const frame = document.createElement('div')
  frame.style.position = 'relative'

  const strip = document.createElement('article')
  strip.append(document.createTextNode('the text of the page'))

  const status = document.createElement('div')
  status.setAttribute('data-page-furniture', '')
  status.append(document.createTextNode('Page 12'))

  frame.append(strip, status)
  document.body.append(frame)
  return { frame, strip, status }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the sheet that turns', () => {
  it('carries the page number with it, not just the text', () => {
    const { strip, status } = readingScreen()

    const held = holdOutgoing(strip, 1)
    expect(held).not.toBeNull()

    // One copy of the text and one of the status line, inside a single wrapper
    // — so one rotation moves both. A sheet of paper does not leave its own
    // page number behind.
    const sheet = held!.node
    expect(sheet.textContent).toContain('the text of the page')
    expect(sheet.textContent).toContain('Page 12')
    expect(sheet.querySelectorAll('[data-page-furniture]')).toHaveLength(1)

    // And the real one steps aside, because it sits *above* the turning sheet
    // by design — it has to stay readable while the overlay bars are up. Left
    // visible it would hover in place over a page visibly rotating away, which
    // is the whole of the reported fault.
    expect(status.style.visibility).toBe('hidden')
  })

  it('gives the page number back when the turn is abandoned', () => {
    const { strip, status } = readingScreen()

    cancelTurn(holdOutgoing(strip, 1))

    // A reader who taps faster than the animation must never be left looking at
    // a page with no number on it.
    expect(status.style.visibility).toBe('')
    expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0)
  })

  it('never lets a copy answer a lookup meant for the real page', () => {
    const { frame, strip } = readingScreen()

    const paragraph = document.createElement('p')
    paragraph.id = 'ch02-s03-p013'
    strip.append(paragraph)
    const anchorId = document.createElement('div')
    anchorId.setAttribute('data-page-furniture', '')
    anchorId.id = 'status-line'
    frame.append(anchorId)

    holdOutgoing(strip, 1)

    // The reading screen finds paragraphs with `getElementById`, and a second
    // copy of each would answer with an element on its way off the screen.
    // Asserted across the furniture too, which is new ground for the copy.
    expect(document.querySelectorAll('#ch02-s03-p013')).toHaveLength(1)
    expect(document.querySelectorAll('#status-line')).toHaveLength(1)
  })
})
