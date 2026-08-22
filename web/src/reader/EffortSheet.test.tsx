// @vitest-environment jsdom
//
// The effort sheet. It is the model sheet's machinery with three rows, so the
// tests here cover only what is its own: the three levels, the tick, and the
// note that must appear on a paid model and must not appear on a free one.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { EffortSheet } from './EffortSheet.tsx'

afterEach(cleanup)

function sheet(over: Partial<Parameters<typeof EffortSheet>[0]> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<EffortSheet pick="high" onPick={onPick} onClose={onClose} {...over} />)
  return { onPick, onClose }
}

describe('the effort sheet', () => {
  it('offers the three levels', () => {
    sheet()
    for (const level of ['Low', 'Medium', 'High']) {
      expect(screen.getByRole('button', { name: new RegExp(level) })).toBeTruthy()
    }
  })

  it('ticks the level in use', () => {
    sheet()
    expect(screen.getByRole('button', { name: /High/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Low/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports the level that was tapped', () => {
    const { onPick } = sheet()
    fireEvent.click(screen.getByRole('button', { name: /Low/ }))
    expect(onPick).toHaveBeenCalledWith('low')
  })

  it('says nothing about cost on a free model', () => {
    sheet()
    expect(screen.queryByText('costs more')).toBeNull()
  })

  it('warns that the top level costs more on a paid model', () => {
    sheet({ paid: true })
    expect(screen.getByText('costs more')).toBeTruthy()
    expect(screen.getByRole('button', { name: /High/ }).textContent).toContain('costs more')
  })
})
