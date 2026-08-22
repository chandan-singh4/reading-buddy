// @vitest-environment jsdom

/**
 * The model sheet, under test.
 *
 * The looks are not testable and are not tested. What is tested is everything
 * the native `<select>` used to give away for free, and which a drawn sheet has
 * to earn back: every choice is reachable, choosing one reports it, Escape and
 * the scrim both close, and the tick is on the row the reader is actually using.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ModelSheet } from './ModelSheet.tsx'
import type { TutorModel } from './models.ts'

function model(over: Partial<TutorModel> = {}): TutorModel {
  return {
    id: 'a/one:free',
    name: 'One',
    description: '',
    contextLength: 131_072,
    ...over,
  }
}

const roster = [model(), model({ id: 'a/two:free', name: 'Two' })]

// The sheet is a portal. Without this each test inherits the last one's, and
// every query finds two of everything.
afterEach(cleanup)

function sheet(over: Partial<Parameters<typeof ModelSheet>[0]> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(
    <ModelSheet models={roster} pick="a/one:free" onPick={onPick} onClose={onClose} {...over} />,
  )
  return { onPick, onClose }
}

describe('the model sheet', () => {
  it('offers every model on the roster', () => {
    sheet()
    expect(screen.getByRole('button', { name: 'One' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Two' })).toBeTruthy()
  })

  it('reports the model that was tapped', () => {
    const { onPick } = sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Two' }))
    expect(onPick).toHaveBeenCalledWith('a/two:free')
  })

  it('marks the current choice, and only it', () => {
    sheet()
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Two' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('opens with the current choice under the finger', () => {
    sheet()
    // Where a platform picker puts it: on what is chosen now, so one key press
    // moves to its neighbour.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'One' }))
  })

  it('says which choice costs money before it is tapped', () => {
    sheet({ models: [model({ id: 'anthropic/claude', name: 'Claude', paid: true })] })
    expect(screen.getByRole('button', { name: /Claude/ }).textContent).toContain('paid')
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
    fireEvent.pointerDown(scrim)
    expect(onClose).toHaveBeenCalled()
  })

  it('draws a name for a model the roster gave none', () => {
    sheet({ models: [model({ id: 'vendor/inkling-2:free', name: '' })], pick: undefined })
    expect(screen.getByRole('button', { name: 'Inkling 2' })).toBeTruthy()
  })
})
