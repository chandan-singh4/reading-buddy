// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

afterEach(cleanup)
import { AloudBar, nextRate, RATES } from './AloudBar.tsx'

const props = () => ({
  playing: false,
  rate: 1,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onSkip: vi.fn(),
  onRate: vi.fn(),
  onStop: vi.fn(),
})

describe('nextRate', () => {
  it('steps through the speeds and wraps round', () => {
    expect(nextRate(RATES[0])).toBe(RATES[1])
    expect(nextRate(RATES[RATES.length - 1])).toBe(RATES[0])
  })

  it('lands on a real speed when given one that is not on the list', () => {
    expect(RATES).toContain(nextRate(3.7))
  })
})

describe('AloudBar', () => {
  it('offers Play while it is quiet, and Pause while it speaks', () => {
    const one = props()
    const page = render(<AloudBar {...one} />)
    fireEvent.click(page.getByLabelText('Play'))
    expect(one.onPlay).toHaveBeenCalled()

    page.rerender(<AloudBar {...one} playing={true} />)
    fireEvent.click(page.getByLabelText('Pause'))
    expect(one.onPause).toHaveBeenCalled()
  })

  it('steps a sentence each way', () => {
    const one = props()
    const page = render(<AloudBar {...one} />)
    fireEvent.click(page.getByLabelText('Next sentence'))
    fireEvent.click(page.getByLabelText('Back a sentence'))
    expect(one.onSkip).toHaveBeenNthCalledWith(1, 1)
    expect(one.onSkip).toHaveBeenNthCalledWith(2, -1)
  })

  it('shows the speed and cycles it', () => {
    const one = props()
    const page = render(<AloudBar {...one} rate={1.25} />)
    fireEvent.click(page.getByLabelText('Speed 1.25 times. Tap to change.'))
    expect(one.onRate).toHaveBeenCalledWith(nextRate(1.25))
  })

  it('stops', () => {
    const one = props()
    const page = render(<AloudBar {...one} />)
    fireEvent.click(page.getByLabelText('Stop reading'))
    expect(one.onStop).toHaveBeenCalled()
  })
})
