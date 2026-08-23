// @vitest-environment jsdom
//
// The effort sheet. It is the model sheet's machinery with seven rows, so the
// tests here cover only what is its own: the levels, the tick, and the note
// that must appear on a paid model and must not appear on a free one.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { EffortSheet } from './EffortSheet.tsx'

afterEach(cleanup)

function sheet(over: Partial<Parameters<typeof EffortSheet>[0]> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<EffortSheet pick="max" onPick={onPick} onClose={onClose} {...over} />)
  return { onPick, onClose }
}

describe('the effort sheet', () => {
  it('offers every level OpenRouter accepts, Max included', () => {
    sheet()
    for (const level of ['None', 'Minimal', 'Low', 'Medium', 'High', 'XHigh', 'Max']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${level}`) })).toBeTruthy()
    }
  })

  it('ticks the level in use', () => {
    sheet()
    expect(screen.getByRole('button', { name: /^Max/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^Low/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports the level that was tapped', () => {
    const { onPick } = sheet()
    fireEvent.click(screen.getByRole('button', { name: /^Low/ }))
    expect(onPick).toHaveBeenCalledWith('low')
  })

  it('says nothing about cost on a free model', () => {
    sheet()
    expect(screen.queryByText('costs more')).toBeNull()
  })

  it('warns that the thinking levels cost more on a paid model', () => {
    sheet({ paid: true })
    expect(screen.getByRole('button', { name: /^Max/ }).textContent).toContain('costs more')
    // Not on the cheap end. A warning on every row is a warning on none.
    expect(screen.getByRole('button', { name: /^None/ }).textContent).not.toContain('costs more')
  })
})
