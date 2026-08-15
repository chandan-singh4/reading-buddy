// @vitest-environment jsdom
//
// jsdom has no layout and no Web Animations API, so nothing here can say what a
// turn *looks* like — that goes to the phone, as every motion change in this app
// does. What it can say is what the turning sheet is *made of*, and that is
// exactly where the fault was: the sheet was the text and nothing else, so the
// page number and the "% left" stayed nailed to the screen while the paper they
// are printed on rotated out from under them.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { cancelTurn, clearSheets, holdOutgoing, settleDrag } from './pageTurn.ts'
import type { Drag } from './pageTurn.ts'

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
  // The list of concealed furniture is module state, deliberately — one list,
  // hidden once, restored once, however many copies a turn makes. That means it
  // outlives a test, and a test that leaves it populated leaves the *next* one
  // unable to hide anything, because concealing is a no-op while it is full.
  // Sweeping is what empties it, so it is the teardown.
  clearSheets(document.querySelector('article'))
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

/*
 * A sheet used to be a copy of the whole chapter — every paragraph of it, laid
 * out again, sixteen times over for a dragged turn. On a long book that blocked
 * the phone for twenty-four seconds and read as a crash. Two things fixed it:
 * the copy now holds only the pages near the one on screen, and it is moved to
 * the right page with a transform instead of a scroll.
 *
 * jsdom cannot measure anything, so it always takes the "cut nothing" path. That
 * is the branch worth pinning here anyway: the cut is an optimisation, and a
 * copy that shows the wrong words is a bug whether it was cut or not.
 */
describe('the sheet holds the page the reader is on', () => {
  it('copies the whole strip when nothing can be measured', () => {
    const { strip } = readingScreen()
    for (let i = 0; i < 8; i += 1) {
      const paragraph = document.createElement('p')
      paragraph.append(document.createTextNode(`paragraph ${i}`))
      strip.append(paragraph)
    }

    const held = holdOutgoing(strip, 1)

    // No rectangles, no safe cut. Every paragraph comes across, which is what
    // the screen did before the cut existed.
    expect(held!.node.querySelectorAll('p')).toHaveLength(8)
  })

  it('moves the copy to the page with a transform, not a scroll', () => {
    const { strip } = readingScreen()
    // jsdom pins `scrollLeft` at 0 because it lays nothing out. The page turn
    // reads it to know which page to show, so the test supplies one.
    Object.defineProperty(strip, 'scrollLeft', { value: 1088, writable: true })

    const held = holdOutgoing(strip, 1)
    const copy = held!.node.querySelector('article')!

    // A scroll is a layout the browser cannot batch, and a dragged turn asks for
    // sixteen of them. A transform is not a layout at all.
    expect(copy.style.transform).toContain('translateX(-1088px)')
    expect(copy.scrollLeft).toBe(0)
    // Nothing is scrolled now, so the rest of the chapter hangs outside the copy
    // and the sheet around it is what clips.
    expect(copy.style.overflow).toBe('visible')
  })
})

/*
 * The failure these guard against is the worst one this screen has: a copy that
 * outlives its turn is an opaque photograph of an old page, so the book looks
 * frozen even though every gesture underneath still works. Both mechanisms that
 * take a copy down wait on frames, and frames stop arriving when the app is
 * backgrounded — so both need a floor that does not.
 */
describe('a copy can never outlive its turn', () => {
  it('sweeps a sheet that was left standing, and gives the furniture back', () => {
    const { frame, strip, status } = readingScreen()

    // Exactly the state a turn interrupted by the app being backgrounded leaves
    // behind: the copy still there, the real page number still hidden under it.
    holdOutgoing(strip, 1)
    expect(frame.querySelectorAll('[data-page-sheet]').length).toBeGreaterThan(0)
    expect(status.style.visibility).toBe('hidden')

    clearSheets(strip)

    expect(frame.querySelectorAll('[data-page-sheet]')).toHaveLength(0)
    expect(status.style.visibility).toBe('')
    // And the real page is untouched — this sweeps the photographs, not the book.
    expect(strip.isConnected).toBe(true)
  })

  it('is safe to sweep when there is nothing to sweep', () => {
    const { frame, strip, status } = readingScreen()
    clearSheets(strip)
    clearSheets(null)
    expect(frame.querySelectorAll('[data-page-sheet]')).toHaveLength(0)
    expect(status.style.visibility).toBe('')
    expect(strip.isConnected).toBe(true)
  })

  it('takes the dragged sheet down on a clock when no frame ever arrives', async () => {
    const { frame, strip, status } = readingScreen()

    // A drag, standing, with the furniture concealed under it — then every
    // frame withheld, which is what a backgrounded tab does.
    const sheet = holdOutgoing(strip, 1)
    expect(sheet).not.toBeNull()

    const stage = document.createElement('div')
    stage.dataset.pageSheet = ''
    const cast = document.createElement('div')
    cast.dataset.pageSheet = ''
    frame.append(stage, cast)

    const drag: Drag = {
      by: 1,
      width: 400,
      parent: frame,
      stage,
      bands: [],
      cast,
      still: null,
      frame: null,
    }

    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1)
    try {
      vi.useFakeTimers()
      let committed: boolean | null = null
      settleDrag(drag, 0.9, 0, (done) => {
        committed = done
      })

      // Nothing has finished it — the frame loop is the only thing that would
      // have, and it is not running.
      expect(committed).toBeNull()
      expect(stage.isConnected).toBe(true)

      vi.advanceTimersByTime(5000)

      expect(committed).toBe(true)
      expect(stage.isConnected).toBe(false)
      expect(cast.isConnected).toBe(false)
      expect(status.style.visibility).toBe('')
    } finally {
      vi.useRealTimers()
      frames.mockRestore()
    }
  })
})
