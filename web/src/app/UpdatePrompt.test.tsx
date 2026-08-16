// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UpdatePrompt } from './UpdatePrompt.tsx'

// The panel talks to the service-worker plumbing through exactly two functions.
// Faking them keeps this a test of the panel rather than of Workbox.
const ready = vi.hoisted(() => ({ listeners: new Set<() => void>(), applied: 0 }))

vi.mock('./updates.ts', () => ({
  onUpdateReady: (listener: () => void) => {
    ready.listeners.add(listener)
    return () => ready.listeners.delete(listener)
  },
  applyUpdate: () => {
    ready.applied += 1
  },
}))

/**
 * The service worker telling the app a build is ready.
 *
 * Wrapped in `act` because this arrives from outside React entirely — it is a
 * worker event, not a click — so nothing else will flush the state change it
 * causes.
 */
function announce(): void {
  act(() => {
    for (const listener of ready.listeners) listener()
  })
}

afterEach(() => {
  cleanup()
  ready.listeners.clear()
  ready.applied = 0
})

describe('the update panel', () => {
  it('shows nothing at all until a build is ready', () => {
    render(<UpdatePrompt />)
    // The overwhelmingly common case. An update panel that renders an empty
    // wrapper on every screen is a stray element over the whole app.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('appears when a build is ready', () => {
    render(<UpdatePrompt />)
    announce()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Something new')).toBeTruthy()
  })

  it('applies the update when accepted', () => {
    render(<UpdatePrompt />)
    announce()
    fireEvent.click(screen.getByText('Update now'))
    expect(ready.applied).toBe(1)
  })

  it('defers on Later, and does not apply anything', () => {
    render(<UpdatePrompt />)
    announce()
    fireEvent.click(screen.getByText('Later'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(ready.applied).toBe(0)
  })

  it('stays when the blur behind it is tapped', () => {
    // This app teaches you to tap the page, so the panel arrives under a thumb
    // that is already tapping. Losing an update to a stray tap is how a reader
    // ends up on an old build without deciding to.
    render(<UpdatePrompt />)
    announce()
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('does not defer when the panel itself is tapped', () => {
    render(<UpdatePrompt />)
    announce()
    fireEvent.click(screen.getByText(/A fresh version/))
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('defers on Escape', () => {
    render(<UpdatePrompt />)
    announce()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays gone once deferred, even if the worker announces again', () => {
    // Being asked twice about the same build is nagging, and this fires on
    // every check while the build sits waiting.
    render(<UpdatePrompt />)
    announce()
    fireEvent.click(screen.getByText('Later'))
    announce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks again when the reader comes back to the app', () => {
    // The bug behind "I never see the changes". An installed app is suspended,
    // not closed, so its page can live for days — and a deferral that lasted
    // that long left a build waiting behind a panel that could not come back.
    render(<UpdatePrompt />)
    announce()
    fireEvent.click(screen.getByText('Later'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent(document, new Event('visibilitychange'))
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('puts focus on the panel so the keyboard is not left behind the blur', () => {
    render(<UpdatePrompt />)
    announce()
    expect(document.activeElement).toBe(screen.getByText('Update now'))
  })
})
