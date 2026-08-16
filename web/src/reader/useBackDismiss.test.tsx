// @vitest-environment jsdom
//
// The back gesture closing a panel instead of leaving the page. Tested against
// jsdom's real history, because the whole behaviour *is* the history stack —
// mocking it would only assert that the mock was called.

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackDismiss } from './useBackDismiss.ts'

afterEach(cleanup)

beforeEach(() => {
  // Back to a known single entry — history is shared across tests in a file.
  window.history.replaceState(null, '', '/')
})

function Panel({ depth, onDismiss }: { depth: number; onDismiss: () => void }) {
  useBackDismiss(depth, onDismiss)
  return null
}

// jsdom queues a history traversal rather than applying it, exactly as a
// browser does — so every assertion about one has to be waited for rather than
// read on the next tick.

describe('closing a panel with the back gesture', () => {
  it('adds a history entry to absorb the gesture', () => {
    const before = window.history.length
    render(<Panel depth={1} onDismiss={() => {}} />)

    expect(window.history.length).toBe(before + 1)
  })

  it('closes the panel instead of leaving the page', async () => {
    const onDismiss = vi.fn()
    render(<Panel depth={1} onDismiss={onDismiss} />)

    window.history.back()

    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalled()
    })
    // The page itself never moved — which is the entire point.
    expect(window.location.pathname).toBe('/')
  })

  it('does nothing at all while the page is bare', () => {
    const before = window.history.length
    render(<Panel depth={0} onDismiss={() => {}} />)

    expect(window.history.length).toBe(before)
  })

  it('keeps one entry for each open layer', async () => {
    // Counted by gestures rather than by `history.length`: a push truncates any
    // forward entries left by an earlier test in this file, so the length is not
    // a number that can be reasoned about. What matters is that two open layers
    // can absorb two gestures without the page moving.
    const onDismiss = vi.fn()
    render(<Panel depth={2} onDismiss={onDismiss} />)

    window.history.back()
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
    expect(window.history.state).toMatchObject({ 'reading-buddy-layer': true })

    window.history.back()
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(2)
    })
    expect(window.location.pathname).toBe('/')
  })

  it('adds an entry as a second layer opens', () => {
    const { rerender } = render(<Panel depth={1} onDismiss={() => {}} />)
    const withOne = window.history.length

    rerender(<Panel depth={2} onDismiss={() => {}} />)

    expect(window.history.length).toBe(withOne + 1)
  })

  /*
   * The 2026-08-16 report, driven through the same wiring `Reader` uses: the
   * toolbar up, the contents page over it. The first swipe closed the contents
   * page. The second, which should have put the toolbar away, left the app.
   *
   * The cause is not visible here — Chrome skips the entry this hook used to
   * push from inside its own `popstate` handler, and jsdom does not. What this
   * test can hold is the shape of the fix: after the first gesture an entry of
   * ours is still on the stack, and it was pushed when the layer opened rather
   * than in answer to a back navigation.
   */
  it('peels one layer per gesture with a Reader wired up', async () => {
    function Reader() {
      const [chromeShown, setChromeShown] = useState(true)
      const [sheetOpen, setSheetOpen] = useState(true)

      const dismiss = () => {
        if (sheetOpen) {
          setSheetOpen(false)
          return
        }
        setChromeShown(false)
      }

      useBackDismiss((chromeShown ? 1 : 0) + (sheetOpen ? 1 : 0), dismiss)
      return (
        <span data-testid="state">{`${chromeShown ? 'bar' : ''}${sheetOpen ? '+sheet' : ''}`}</span>
      )
    }

    render(<Reader />)
    const state = () => screen.getByTestId('state').textContent

    window.history.back()
    await vi.waitFor(() => {
      expect(state()).toBe('bar')
    })

    // The toolbar is still up, so a gesture of ours must still be armed. Without
    // it the next swipe reaches the book — or, with the book at the bottom of
    // the stack, leaves the app.
    expect(window.history.state).toMatchObject({ 'reading-buddy-layer': true })

    window.history.back()
    await vi.waitFor(() => {
      expect(state()).toBe('')
    })
    expect(window.location.pathname).toBe('/')
    // Both layers peeled, so nothing of ours should remain.
    expect(window.history.state).not.toMatchObject({ 'reading-buddy-layer': true })
  })

  it('never pushes an entry while answering a gesture', async () => {
    // The whole point of the rewrite. An entry pushed in answer to a back
    // navigation is what Chrome's history-manipulation intervention skips, so
    // the stack must only ever get shorter while a gesture is being answered.
    const pushed = vi.spyOn(window.history, 'pushState')
    render(<Panel depth={2} onDismiss={() => {}} />)
    pushed.mockClear()

    window.history.back()
    await vi.waitFor(() => {
      expect(window.history.state).toMatchObject({ 'reading-buddy-layer': true })
    })

    expect(pushed).not.toHaveBeenCalled()
    pushed.mockRestore()
  })

  it('calls the newest callback, not the one it mounted with', async () => {
    const stale = vi.fn()
    const fresh = vi.fn()
    const { rerender } = render(<Panel depth={1} onDismiss={stale} />)

    rerender(<Panel depth={1} onDismiss={fresh} />)
    window.history.back()

    await vi.waitFor(() => {
      expect(fresh).toHaveBeenCalled()
    })
    expect(stale).not.toHaveBeenCalled()
  })

  it('keeps its entries when the callback identity changes', () => {
    const { rerender } = render(<Panel depth={1} onDismiss={() => {}} />)
    const withPanel = window.history.length

    rerender(<Panel depth={1} onDismiss={() => {}} />)
    rerender(<Panel depth={1} onDismiss={() => {}} />)

    expect(window.history.length).toBe(withPanel)
    expect(window.history.state).toMatchObject({ 'reading-buddy-layer': true })
  })

  it('takes its entry back when the panel is closed by a tap', async () => {
    const { rerender } = render(<Panel depth={1} onDismiss={() => {}} />)
    const withPanel = window.history.length

    rerender(<Panel depth={0} onDismiss={() => {}} />)

    // Left behind, the spare entry would swallow the reader's *next* back
    // gesture and appear to do nothing — a dead gesture, worse than the bug
    // this hook exists to fix.
    await vi.waitFor(() => {
      expect(window.history.state).not.toMatchObject({ 'reading-buddy-layer': true })
    })
    expect(withPanel).toBeGreaterThan(0)
  })

  it('does not read its own tidying up as another gesture', async () => {
    // Closing both layers with one tap removes two entries with `history.go`,
    // which fires `popstate` exactly as a back swipe does. Answering those would
    // close layers that are already shut.
    const onDismiss = vi.fn()
    const { rerender } = render(<Panel depth={2} onDismiss={onDismiss} />)

    rerender(<Panel depth={0} onDismiss={onDismiss} />)

    await vi.waitFor(() => {
      expect(window.history.state).not.toMatchObject({ 'reading-buddy-layer': true })
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
