// @vitest-environment jsdom

/**
 * The model sheet, under test.
 *
 * The looks are not testable and are not tested. What is tested is everything
 * the native `<select>` used to give away for free, and which a drawn sheet has
 * to earn back: every choice is reachable, choosing one reports it, Escape and
 * the scrim both close, and the current choice is marked and focused.
 *
 * Since the picker became a grid there is a second thing to protect, and it is
 * the more fragile one: the reader can rearrange it, and the arrangement is the
 * fallback chain. A drag that silently fails to report would look like it
 * worked and quietly leave the chain unchanged.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ModelSheet } from './ModelSheet.tsx'
import { arrange, type Column, type TutorModel } from './models.ts'

function model(over: Partial<TutorModel> = {}): TutorModel {
  return {
    id: 'a/one:free',
    name: 'One',
    description: '',
    contextLength: 131_072,
    source: 'openrouter',
    ...over,
  }
}

const roster: Column[] = arrange([
  model(),
  model({ id: 'a/two:free', name: 'Two' }),
  model({ id: 'g/three', name: 'Three', source: 'gemini' }),
])

// The sheet is a portal. Without this each test inherits the last one's, and
// every query finds two of everything.
afterEach(cleanup)

function sheet(over: Partial<Parameters<typeof ModelSheet>[0]> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  const onArrange = vi.fn()
  render(
    <ModelSheet
      columns={roster}
      pick="a/one:free"
      onPick={onPick}
      onArrange={onArrange}
      onClose={onClose}
      {...over}
    />,
  )
  return { onPick, onClose, onArrange }
}

/** A finger on a row: press, release, and the click the browser then sends. */
function tap(node: HTMLElement) {
  fireEvent.pointerDown(node)
  fireEvent.pointerUp(window)
  fireEvent.click(node)
}

/** A row, found by the short name the grid draws rather than the full one. */
function row(name: string) {
  return screen.getByRole('button', { name: new RegExp(`\\b${name}\\b`) })
}

describe('the model sheet', () => {
  it('offers every model on the roster', () => {
    sheet()
    expect(row('One')).toBeTruthy()
    expect(row('Two')).toBeTruthy()
    expect(row('Three')).toBeTruthy()
  })

  it('names each provider as a column', () => {
    sheet()
    // The column heading is what makes the grid readable as a chain: the reader
    // is meant to see that the model to the right is served by someone else.
    expect(screen.getByRole('button', { name: /Google/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /OpenRouter/ })).toBeTruthy()
  })

  it('reports the model that was tapped', () => {
    const { onPick } = sheet()
    tap(row('Two'))
    expect(onPick).toHaveBeenCalledWith('a/two:free')
  })

  it('chooses on the click, so nothing behind the sheet is pressed', () => {
    /*
     * The reader's bug, and it cost them a question every time.
     *
     * Choosing on `pointerup` closed the sheet, and the sheet was gone by the
     * time the browser dispatched the `click` that always follows. The browser
     * hit-tests that click against whatever is under the finger *now* — one of
     * the task chips behind the sheet — so picking a model also asked a
     * question nobody typed.
     *
     * What this holds is that nothing is decided before the click: a press and
     * a release on their own must change nothing.
     */
    const { onPick } = sheet()
    fireEvent.pointerDown(row('Two'))
    fireEvent.pointerUp(window)
    expect(onPick).not.toHaveBeenCalled()

    fireEvent.click(row('Two'))
    expect(onPick).toHaveBeenCalledWith('a/two:free')
  })

  it('does not choose the model that was only moved', () => {
    // A drag ends with a click of its own. That one is a rearrangement, and
    // must not also change which model answers.
    vi.useFakeTimers()
    try {
      const { onPick } = sheet()
      const two = row('Two')
      // jsdom has no pointer capture, and the lift asks for it.
      two.setPointerCapture = () => {}
      fireEvent.pointerDown(two, { clientX: 0, clientY: 0 })
      act(() => {
        vi.advanceTimersByTime(400)
      })
      fireEvent.pointerUp(window)
      fireEvent.click(two)
      expect(onPick).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not report a tap that turned into a scroll', () => {
    // A flick that starts on a row must still scroll the grid, and must not
    // change which model answers on the way past.
    const { onPick } = sheet()
    fireEvent.pointerDown(row('Two'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 0, clientY: 60 })
    fireEvent.pointerUp(window)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('marks the current choice, and only it', () => {
    sheet()
    expect(row('One').getAttribute('aria-pressed')).toBe('true')
    expect(row('Two').getAttribute('aria-pressed')).toBe('false')
  })

  it('opens with the current choice under the finger', () => {
    sheet()
    // Where a platform picker puts it, and the only way into the grid from a
    // keyboard without tabbing through the whole roster.
    expect(document.activeElement).toBe(row('One'))
  })

  it('says which choice costs money before it is tapped', () => {
    sheet({
      columns: arrange([model({ id: 'anthropic/claude', name: 'Claude', paid: true })]),
    })
    expect(row('Claude').textContent).toContain('paid')
  })

  it('says which choice was not answering when the roster was built', () => {
    sheet({ columns: arrange([model({ id: 'z/glm', name: 'GLM', busy: true })]) })
    expect(row('GLM').textContent).toContain('busy')
  })

  it('moves a model up its column from the keyboard', () => {
    /*
     * The drag is a touch gesture with no keyboard equivalent, so the same
     * operation is offered as a key. Without this the fallback chain would be
     * editable by finger only.
     */
    const { onArrange } = sheet()
    fireEvent.keyDown(row('Two'), { key: 'ArrowUp', altKey: true })

    const moved = onArrange.mock.calls[0][0] as Column[]
    const openrouter = moved.find((column) => column.source === 'openrouter')!
    expect(openrouter.models.map((entry) => entry.id)).toEqual(['a/two:free', 'a/one:free'])
  })

  it('will not move a model off the top of its column', () => {
    const { onArrange } = sheet()
    fireEvent.keyDown(row('One'), { key: 'ArrowUp', altKey: true })
    expect(onArrange).not.toHaveBeenCalled()
  })

  it('closes on Cancel', () => {
    const { onClose } = sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const { onClose } = sheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not let Escape reach the lamp underneath', () => {
    // Otherwise one press would shut the sheet and the whole room with it.
    const below = vi.fn()
    window.addEventListener('keydown', below)
    sheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    window.removeEventListener('keydown', below)
    expect(below).not.toHaveBeenCalled()
  })

  it('closes on a tap outside it', () => {
    const { onClose } = sheet()
    const scrim = document.querySelector('[class*="scrim"]') as HTMLElement
    // On the click, for the same reason the rows are: a scrim removed on
    // `pointerdown` lets the click through to the page behind it.
    fireEvent.pointerDown(scrim)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(scrim)
    expect(onClose).toHaveBeenCalled()
  })

  it('draws a name for a model the roster gave none', () => {
    sheet({
      columns: arrange([model({ id: 'vendor/inkling-2:free', name: '' })]),
      pick: undefined,
    })
    expect(row('Inkling 2')).toBeTruthy()
  })
})
