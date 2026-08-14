// @vitest-environment jsdom

/**
 * The Aa panel. What is worth testing here is not that the buttons exist but
 * that the redesign kept every setting reachable — a slider or a swatch that
 * looks right and writes nothing is exactly the failure this panel invites.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TextSettings } from './TextSettings.tsx'
import { DEFAULT_SETTINGS, type ReaderSettings } from './readerSettings.ts'

// The suite doesn't unmount between tests on its own, and two panels on the
// page means every query finds two of everything.
afterEach(cleanup)

function show(settings: Partial<ReaderSettings> = {}) {
  const onSettingsChange = vi.fn()
  render(
    <TextSettings
      settings={{ ...DEFAULT_SETTINGS, ...settings }}
      onSettingsChange={onSettingsChange}
    />,
  )
  return onSettingsChange
}

/** Move to the named tab — the panes are one at a time now. */
function openPane(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }))
}

describe('TextSettings', () => {
  it('opens on the text pane', () => {
    show()
    expect(screen.getByRole('slider', { name: 'Text size' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Line spacing' })).toBeTruthy()
  })

  it('sets the text size from the slider', () => {
    const onSettingsChange = show()
    fireEvent.change(screen.getByRole('slider', { name: 'Text size' }), {
      target: { value: '5' },
    })
    expect(onSettingsChange).toHaveBeenCalledWith({ textStep: 5 })
  })

  // The slider speaks in numbers and the setting is stored as a word, so the
  // mapping between the two is the one place this can quietly go wrong.
  it('turns a spacing slider position back into its name', () => {
    const onSettingsChange = show()
    fireEvent.change(screen.getByRole('slider', { name: 'Line spacing' }), {
      target: { value: '3' },
    })
    expect(onSettingsChange).toHaveBeenCalledWith({ spacing: 'relaxed' })
  })

  it('shows where a slider is while it is being dragged, and hides it after', () => {
    show({ textStep: 4 })
    const slider = screen.getByRole('slider', { name: 'Text size' })

    fireEvent.pointerDown(slider)
    expect(screen.getByRole('status').textContent).toBe('Size 4')

    fireEvent.pointerUp(slider)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('chooses a font from its specimen', () => {
    const onSettingsChange = show()
    fireEvent.click(screen.getByRole('button', { name: /Literata/ }))
    expect(onSettingsChange).toHaveBeenCalledWith({ font: 'literata' })
  })

  // The swatches carry no visible text of their own, so the theme's name has to
  // survive as a label or the panel is unusable without sight.
  it('chooses a theme from its colour', () => {
    const onSettingsChange = show()
    openPane('Reading mode')
    fireEvent.click(screen.getByRole('button', { name: 'Sepia' }))
    expect(onSettingsChange).toHaveBeenCalledWith({ theme: 'sepia' })
  })

  it('marks the theme in use', () => {
    show({ theme: 'forest' })
    openPane('Reading mode')
    expect(screen.getByRole('button', { name: 'Forest' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('sets the margins from the slider under the drawn page', () => {
    const onSettingsChange = show()
    openPane('Margins')
    fireEvent.change(screen.getByRole('slider', { name: 'Margins' }), {
      target: { value: '1' },
    })
    expect(onSettingsChange).toHaveBeenCalledWith({ margins: 'narrow' })
  })
})
