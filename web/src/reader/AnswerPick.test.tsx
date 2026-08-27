// @vitest-environment jsdom
//
// The handles over a line picked out of one of Veda's answers.
//
// The reader's report, 2026-08-26: "I cannot drag my selection, and I cannot
// select more than a word." The cause was not in here — `StudyLamp` had a
// listener that put the selection down whenever a finger landed outside the
// answer, and these handles are drawn into `document.body`, which is outside
// every answer. Touching one threw the selection away before the drag began,
// and since the handles are the only way to grow a pick, one word was the most
// anybody could ever take.
//
// So the `data-pick` marks below are load-bearing, not decoration. They are how
// `StudyLamp` tells its own furniture from the rest of the screen.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnswerPick } from './AnswerPick.tsx'
import type { SpanSelection } from './selection.ts'

afterEach(cleanup)

function pick(): SpanSelection {
  document.body.innerHTML = '<div id="answer"><p>A symbol is a picture.</p></div>'
  const range = document.createRange()
  range.selectNodeContents(document.querySelector('#answer p')!)

  return {
    text: 'A symbol is a picture.',
    range,
    rect: { top: 100, bottom: 120, left: 40, right: 240 },
    rects: [{ top: 100, left: 40, width: 200, height: 20 }],
  }
}

function draw(over: Partial<Parameters<typeof AnswerPick>[0]> = {}) {
  const onExtend = vi.fn()
  const { container } = render(
    <AnswerPick
      selection={pick()}
      painted
      source={document.getElementById('answer')}
      onExtend={onExtend}
      onCopy={() => {}}
      onSave={() => {}}
      onAsk={() => {}}
      {...over}
    />,
  )
  return { onExtend, container }
}

/**
 * The two handles, found by class.
 *
 * Not by `data-pick`: the painted wash carries that too, and a wash has no
 * pointer handlers on it. Not by role or name either — a handle is scenery a
 * finger drags, so it is `aria-hidden` and has neither.
 */
function handles(): HTMLElement[] {
  return [...document.querySelectorAll('[class*="handle"]')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )
}

describe('stretching a pick', () => {
  it('marks everything it draws, so the lamp knows its own furniture', () => {
    /*
     * The regression. `StudyLamp` puts the selection down when a finger lands
     * outside the answer, and everything here is outside the answer — it is
     * portalled to the body. Without this mark, touching a handle destroyed the
     * selection instead of dragging it.
     */
    const { container } = draw()

    // Everything the portal put on the body: not the answer, and not the box
    // the test renderer mounts into.
    const furniture = [...document.body.children].filter(
      (node) => node.id !== 'answer' && node !== container,
    )
    expect(furniture.length).toBeGreaterThan(0)
    for (const node of furniture) expect(node.hasAttribute('data-pick')).toBe(true)
  })

  it('carries the drag to the caller, one frame at a time', async () => {
    const { onExtend } = draw()
    const grip = handles()[0]!

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 40, clientY: 110 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 90, clientY: 110 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 140, clientY: 110 })

    // The last point before the frame is the one that counts. The moves between
    // frames are work the reader would never have seen.
    await waitFor(() => expect(onExtend).toHaveBeenCalledTimes(1))
    expect(onExtend.mock.calls[0]?.slice(1)).toEqual([140, 110])
  })

  it('ignores a second finger part way through a drag', async () => {
    const { onExtend } = draw()
    const grip = handles()[0]!

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 40, clientY: 110 })
    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 300, clientY: 400 })

    await new Promise((resume) => requestAnimationFrame(() => resume(null)))
    expect(onExtend).not.toHaveBeenCalled()
  })

  it('raises the glass while the finger is down, and puts it away after', async () => {
    /*
     * A fingertip is about nine millimetres across and the text under it is
     * about two. The glass is the only way the reader can see the boundary
     * their own hand is covering.
     */
    draw()
    const grip = handles()[0]!
    const card = () => screen.getByRole('group', { name: 'What to do with these words' })

    expect(document.querySelector('[class*="glass"]')).toBeNull()

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 40, clientY: 110 })
    await waitFor(() => expect(document.querySelector('[class*="glass"]')).toBeTruthy())
    // The card steps aside: it sits above the words, which is where the glass
    // and the finger both are.
    expect(card().className).toMatch(/hidden/)

    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 140, clientY: 110 })
    await waitFor(() => expect(document.querySelector('[class*="glass"]')).toBeNull())
    expect(card().className).not.toMatch(/hidden/)
  })

  it('draws no wash and no handles when the browser owns the selection', () => {
    // A desktop keeps the browser's own selection, which the browser paints.
    // Painting it again would double the ink.
    draw({ painted: false })

    expect(handles()).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'What to do with these words' })).toBeTruthy()
  })
})
