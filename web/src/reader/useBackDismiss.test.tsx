// @vitest-environment jsdom
//
// The back gesture closing a panel instead of leaving the page. Tested against
// jsdom's real history, because the whole behaviour *is* the history stack —
// mocking it would only assert that the mock was called.

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackDismiss } from './useBackDismiss.ts'

afterEach(cleanup)

beforeEach(() => {
  // Back to a known single entry — history is shared across tests in a file.
  window.history.replaceState(null, '', '/')
})

function Panel({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  useBackDismiss(open, onDismiss)
  return null
}

// jsdom queues a history traversal rather than applying it, exactly as a
// browser does — so every assertion about one has to be waited for rather than
// read on the next tick.

describe('closing a panel with the back gesture', () => {
  it('adds a history entry to absorb the gesture', () => {
    const before = window.history.length
    render(<Panel open onDismiss={() => {}} />)

    expect(window.history.length).toBe(before + 1)
  })

  it('closes the panel instead of leaving the page', async () => {
    const onDismiss = vi.fn()
    render(<Panel open onDismiss={onDismiss} />)

    window.history.back()

    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalled()
    })
    // The page itself never moved — which is the entire point.
    expect(window.location.pathname).toBe('/')
  })

  it('does nothing at all while the panel is closed', () => {
    const before = window.history.length
    render(<Panel open={false} onDismiss={() => {}} />)

    expect(window.history.length).toBe(before)
  })

  it('takes its entry back when the panel is closed by a tap', async () => {
    const { rerender } = render(<Panel open onDismiss={() => {}} />)
    const withPanel = window.history.length

    rerender(<Panel open={false} onDismiss={() => {}} />)

    // Left behind, the spare entry would swallow the reader's *next* back
    // gesture and appear to do nothing — a dead gesture, worse than the bug
    // this hook exists to fix.
    await vi.waitFor(() => {
      expect(window.history.state).not.toMatchObject({ 'reading-buddy-layer': true })
    })
    expect(withPanel).toBeGreaterThan(0)
  })
})
