// @vitest-environment jsdom
//
// jsdom has no View Transition API, so the *animation* cannot be tested here —
// only the decisions around it: when one is started, when it is deliberately
// not, and that the routes still arrive either way. The look of it is verified
// on the reader's phone, like every other piece of motion in this app.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { RouteTransition } from './routeTransition.tsx'

afterEach(() => {
  cleanup()
  delete (document as unknown as Record<string, unknown>).startViewTransition
  document.documentElement.removeAttribute('data-route-move')
})

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

/**
 * A stand-in for the browser's API that records the direction it was started
 * with and then runs the callback.
 *
 * **The callback is deliberately deferred**, which is not a detail. The real
 * `startViewTransition` returns first and calls back only once it has
 * photographed the outgoing screen — so by then React is no longer rendering,
 * and the `flushSync` inside is legal. A stub that called back synchronously
 * would run it from inside the layout effect, where React refuses to flush and
 * warns; the test would still pass while modelling something that cannot
 * happen. Deferring keeps the stub honest about the one property the real
 * implementation has that this code depends on.
 */
function stubViewTransitions() {
  const calls: string[] = []
  ;(document as unknown as Record<string, unknown>).startViewTransition = (
    callback: () => void,
  ) => {
    calls.push(document.documentElement.getAttribute('data-route-move') ?? '')
    return { finished: Promise.resolve().then(callback) }
  }
  return calls
}

function Go({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(to)}>
      go to {to}
    </button>
  )
}

function renderApp(from: string, to: string) {
  return render(
    <MemoryRouter initialEntries={[from]}>
      <RouteTransition>
        <AppRoutes />
      </RouteTransition>
      <Go to={to} />
    </MemoryRouter>,
  )
}

describe('crossing between the app’s major locations', () => {
  it('starts a transition when a book is opened, and says which way it went', async () => {
    const calls = stubViewTransitions()
    renderApp('/', '/book/does-not-exist')

    fireEvent.click(screen.getByRole('button', { name: 'go to /book/does-not-exist' }))

    expect(calls).toEqual(['in'])
    // The route really did arrive — a transition that swallowed the navigation
    // would be worse than no transition at all.
    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('leans the other way when the book is closed', async () => {
    const calls = stubViewTransitions()
    renderApp('/book/does-not-exist', '/')

    fireEvent.click(screen.getByRole('button', { name: 'go to /' }))

    expect(calls).toEqual(['out'])
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toMatch(/^Good /)
  })

  it('clears the direction once the transition is done', async () => {
    stubViewTransitions()
    renderApp('/', '/book/does-not-exist')

    fireEvent.click(screen.getByRole('button', { name: 'go to /book/does-not-exist' }))
    await screen.findByRole('alert')
    // Awaiting the finished promise's own continuation.
    await Promise.resolve()

    // A direction left on `<html>` would lean the *next* move the wrong way.
    expect(document.documentElement.hasAttribute('data-route-move')).toBe(false)
  })

  it('leaves a move between two tabs alone', async () => {
    // Those have their own slide in `AppShell.module.css`. Cross-fading them as
    // well would be two effects doing one job.
    const calls = stubViewTransitions()
    renderApp('/', '/settings')

    fireEvent.click(screen.getByRole('button', { name: 'go to /settings' }))

    expect(calls).toEqual([])
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()
  })

  it('navigates normally where the browser has no such API', async () => {
    // Firefox and Safari at the time of writing, and every test in this suite
    // that doesn't stub it. The fallback has to be the old straight swap, not a
    // screen that never arrives.
    renderApp('/', '/book/does-not-exist')

    fireEvent.click(screen.getByRole('button', { name: 'go to /book/does-not-exist' }))

    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('does not transition for a reader who asked for less movement', async () => {
    const calls = stubViewTransitions()
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as unknown as MediaQueryList)

    renderApp('/', '/book/does-not-exist')
    fireEvent.click(screen.getByRole('button', { name: 'go to /book/does-not-exist' }))

    expect(calls).toEqual([])
    expect(await screen.findByRole('alert')).toBeDefined()
    vi.mocked(window.matchMedia).mockRestore()
  })
})
