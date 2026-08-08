// @vitest-environment jsdom
//
// **Against `BrowserRouter` and jsdom's real history, not `MemoryRouter`.**
//
// That is the entire point of this file existing alongside `AppShell.test.tsx`.
// The Back behaviour turns on how history entries are keyed and how a pop is
// recognised, and those are exactly the things a memory router reimplements in
// its own way — it is a stand-in for the browser, and this is a feature where
// the stand-in cannot be trusted. `useNavigationType()` is the cautionary tale:
// it reads plausibly under one and reports `POP` for every navigation under the
// other, which shipped as "swiping is broken".
//
// jsdom's `history.back()` is asynchronous — it queues a `popstate` — so every
// press here is awaited rather than assumed, which is also how a real device
// behaves and how `MemoryRouter` does not.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { forgetTabHistory } from './tabHistory.ts'

afterEach(cleanup)

beforeEach(() => {
  // Module-level by design — see `tabHistory.ts`. That makes clearing it
  // between cases the test's job.
  forgetTabHistory()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // Each test starts from a clean stack — jsdom keeps one history per test file.
  window.history.replaceState(null, '', '/')
})

function renderApp() {
  return render(
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>,
  )
}

/** A swipe, as the event sequence a real finger produces. See `AppShell.test`. */
function swipe(dx: number) {
  const at = (fraction: number) => ({
    pointerId: 1,
    pointerType: 'touch' as const,
    clientX: 200 + dx * fraction,
    clientY: 300,
  })
  fireEvent.pointerDown(document, at(0))
  fireEvent.pointerMove(document, at(0.5))
  fireEvent.pointerMove(document, at(1))
  fireEvent.pointerUp(document, at(1))
}

/** Presses the device's Back, and waits for the browser to actually do it. */
async function pressBack(expected: string) {
  window.history.back()
  await waitFor(() => {
    expect(window.location.pathname).toBe(expected)
  })
}

describe('Back, against the real history', () => {
  it('retraces one tab move and then has nothing left to retrace', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))

    // One press: the tab actually visited before this one.
    await pressBack('/library')
    expect(await screen.findByText('All books')).toBeDefined()

    // And the level has collapsed to a single entry, so there is nothing of it
    // left to go back through. In a real browser the next press leaves the app;
    // in jsdom it is the start of the stack and the URL simply stops changing.
    const before = window.history.length
    window.history.back()
    await waitFor(() => expect(window.history.length).toBe(before))
    expect(window.location.pathname).toBe('/library')
  })

  it('retraces the last move, not the first, however much swiping came before', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/settings'))

    await pressBack('/stats')
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()
  })

  it('records the tab being left from the address bar, not from a captured render', async () => {
    // The failure this guards against is invisible when it happens and only
    // shows up later, which is what made it hard to find: the *navigation* is
    // worked out elsewhere and still goes to the right place, so swiping looks
    // perfect. Only the tab written down for Back is wrong — one behind — and
    // the reader meets it a gesture later as "Back took me to Home".
    //
    // Asserted through the address bar rather than by reaching into the module:
    // if `move` reads a stale path, the retrace below goes to Home instead of
    // the library, which is precisely the report.
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))

    await pressBack('/library')
    expect(window.location.pathname).not.toBe('/')
  })

  it('earns a new retrace by navigating again after one has been spent', async () => {
    // The reader's correction, verbatim: "if I only backswipe and then I
    // continue to navigate in the app, then backswipe should not get me out of
    // the app but one step before." The retrace is per stretch of navigation,
    // not per session — moving again re-arms it.
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))

    await pressBack('/library')
    // The retrace lands in two steps — the pop, then the rewrite — and the
    // swipe listener is re-registered for the new screen as part of the second.
    // Waiting for the library to actually be on screen is the same thing a
    // finger does; swiping into the gap tests a moment no reader occupies.
    expect(await screen.findByText('All books')).toBeDefined()

    // Navigating again is what earns the next one.
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))

    // So this must retrace, not leave. Before the re-arm it left, because the
    // move had rewritten the top entry instead of claiming a new one.
    await pressBack('/library')
    expect(await screen.findByText('All books')).toBeDefined()
  })

  it('still only spends one retrace when Back is pressed twice', async () => {
    // The other half of the same sentence: "if I navigate and then I backswipe
    // and then backswipe again, that should get me out of the app." The re-arm
    // must not turn two presses into an endless walk back through every swipe.
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/settings'))

    await pressBack('/stats')

    const before = window.history.length
    window.history.back()
    await waitFor(() => expect(window.history.length).toBe(before))
    // In a real browser this press leaves the app; in jsdom it is the bottom of
    // the stack, so the URL simply stops moving. What matters either way is that
    // it did *not* walk back to another tab.
    expect(window.location.pathname).toBe('/stats')
  })

  it('retraces a swipe backwards too', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))
    swipe(-150)
    await waitFor(() => expect(window.location.pathname).toBe('/stats'))
    swipe(150)
    await waitFor(() => expect(window.location.pathname).toBe('/library'))

    // The move being undone is the swipe right, so the way back is Stats.
    await pressBack('/stats')
  })
})
