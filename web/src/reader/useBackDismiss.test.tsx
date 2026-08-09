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

  // The 2026-08-09 report: the toolbar shrinks the page, and Back left the book
  // instead of putting it back. Peeling one layer at a time is what fixes it,
  // and re-arming is what makes the *second* gesture land on the second layer
  // rather than on the book.
  it('re-arms when a layer is peeled and another is still there', async () => {
    // Two layers: a panel over the toolbar. The first back closes the panel and
    // reports that the toolbar remains; the second has to close the toolbar.
    let layers = 2
    const onDismiss = vi.fn(() => {
      layers -= 1
      return layers > 0
    })
    render(<Panel open onDismiss={onDismiss} />)

    window.history.back()
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
    expect(window.location.pathname).toBe('/')

    // The assertion that actually separates fixed from broken. Asking whether a
    // second `history.back()` fires another `popstate` does not: jsdom's history
    // is shared across a file and there are always older entries behind, so the
    // gesture appears to work either way. What differs is whether an entry of
    // *ours* is on top afterwards — with no re-arm the reader's next gesture
    // reaches one of those older entries, which in the app is the book.
    expect(window.history.state).toMatchObject({ 'reading-buddy-layer': true })

    window.history.back()
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(2)
    })
    expect(window.location.pathname).toBe('/')
    expect(layers).toBe(0)
    // Both layers peeled, so nothing of ours should remain.
    expect(window.history.state).not.toMatchObject({ 'reading-buddy-layer': true })
  })

  it('does not re-arm once the page is bare again', async () => {
    const onDismiss = vi.fn(() => false)
    render(<Panel open onDismiss={onDismiss} />)

    window.history.back()
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalled()
    })

    // Nothing of ours left on the stack, so the reader's next gesture is the
    // book's to answer. A spare entry here is the dead gesture this hook's
    // teardown already guards against, arriving by a different route.
    expect(window.history.state).not.toMatchObject({ 'reading-buddy-layer': true })
  })

  // The handler in `Reader` closes over which layers are open, so its identity
  // changes every time one does. If the effect depended on it, that would tear
  // the entry down and rebuild it — and the teardown's `history.back()` is
  // asynchronous, so the traversal can land after the rebuild and undo it.
  it('keeps its single entry when the callback identity changes', async () => {
    const { rerender } = render(<Panel open onDismiss={() => false} />)
    const withPanel = window.history.length

    rerender(<Panel open onDismiss={() => true} />)
    rerender(<Panel open onDismiss={() => false} />)

    expect(window.history.length).toBe(withPanel)
    expect(window.history.state).toMatchObject({ 'reading-buddy-layer': true })
  })

  it('calls the newest callback, not the one it mounted with', async () => {
    const stale = vi.fn(() => false)
    const fresh = vi.fn(() => false)
    const { rerender } = render(<Panel open onDismiss={stale} />)

    rerender(<Panel open onDismiss={fresh} />)
    window.history.back()

    await vi.waitFor(() => {
      expect(fresh).toHaveBeenCalled()
    })
    expect(stale).not.toHaveBeenCalled()
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
