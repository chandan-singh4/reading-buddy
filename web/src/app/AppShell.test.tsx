// @vitest-environment jsdom
//
// Component tests need a DOM; the pure unit tests elsewhere stay on the faster
// node environment. fake-indexeddb must load first — Library reads through the
// real repository, so there has to be a real database underneath it.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'

afterEach(cleanup)

// The Reader scrolls to the top of each new section. jsdom has no layout, so
// its `scrollTo` exists only to complain — stubbed rather than left to warn.
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/**
 * The device's Back button, as something a test can press.
 *
 * There is no way to observe a history *stack* from the outside — `useLocation`
 * only ever reports the top of it. So the way to ask "did that swipe leave an
 * entry behind?" is to go back once and see where you land: if the four screens
 * push, Back undoes the last swipe; if they replace, Back leaves the level
 * altogether. Rendered as a sibling of the app so it survives every navigation.
 */
function Back() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      device back
    </button>
  )
}

function renderFrom(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <AppRoutes />
      <Back />
    </MemoryRouter>,
  )
}

describe('app shell', () => {
  it('lands on Home and reports an empty shelf', async () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
    // Resolves only once the repository has actually answered.
    expect(await screen.findByText('No books yet')).toBeDefined()
  })

  it('opens the drawer from the hamburger and offers all four destinations', () => {
    renderAt('/')

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toBeDefined()
    // Home is in the drawer now. It was left out when swiping didn't exist and
    // Home was simply the screen the ☰ sat on; once Home became one page among
    // four, "swipe right three times" stopped being a way back to it.
    expect(screen.getByRole('link', { name: /Home/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Library/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Stats/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Settings/ })).toBeDefined()
  })

  /**
   * A swipe, as the sequence a real finger produces: down, a run of moves, then
   * an end.
   *
   * The moves are not decoration. A browser seizes a pan gesture and fires
   * `pointercancel` after a few pixels, so `pointerup` often never arrives and
   * its coordinates are worthless when it does — the hook reads the *last move*
   * instead. An earlier version of both the hook and this helper measured the
   * distance at `pointerup` only, which is why the feature passed its tests and
   * did nothing at all on a phone. Ending on `pointercancel` is therefore the
   * case worth covering, not an edge case.
   *
   * `pointerType: 'touch'` matters too — a mouse drag across a page is a text
   * selection, and hijacking it would make the library impossible to select
   * text on, so the hook ignores the mouse entirely.
   */
  function swipe(dx: number, dy = 0, end: 'up' | 'cancel' = 'up') {
    const at = (fraction: number) => ({
      pointerId: 1,
      pointerType: 'touch' as const,
      clientX: 200 + dx * fraction,
      clientY: 300 + dy * fraction,
    })

    fireEvent.pointerDown(document, at(0))
    fireEvent.pointerMove(document, at(0.5))
    fireEvent.pointerMove(document, at(1))
    // A cancel carries stale coordinates — the browser is reporting where it
    // seized the gesture, not where the finger got to. Reading the event
    // itself, rather than the last move, is precisely the bug being guarded.
    if (end === 'cancel') fireEvent.pointerCancel(document, at(0))
    else fireEvent.pointerUp(document, at(1))
  }

  it('swipes left from Home to the library, and right back again', async () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)

    swipe(-150)
    expect(await screen.findByText('All books')).toBeDefined()

    swipe(150)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('does not swipe past the ends', async () => {
    // A list that loops has no edges, and an edge is how a reader learns where
    // they are.
    renderAt('/')

    swipe(150)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('ignores a swipe that was really a scroll', async () => {
    // A finger arcs. Without a ratio guard, flicking down a long shelf with a
    // slightly curved movement navigates away from it.
    renderAt('/')

    swipe(-150, 300)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('ignores a movement too short to be a swipe', () => {
    renderAt('/')

    swipe(-20)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('still navigates when the browser cancels the gesture', async () => {
    // The bug that shipped: a browser takes a pan over and fires
    // `pointercancel` instead of `pointerup`, so a handler that only measured
    // at `pointerup` measured nothing. On a phone this meant swiping did
    // absolutely nothing, while the tests stayed green.
    renderAt('/')

    swipe(-150, 0, 'cancel')
    expect(await screen.findByText('All books')).toBeDefined()
  })

  it('leaves no history behind when swiping between the four screens', async () => {
    // The four screens are one level, not four steps into anything. Back has to
    // mean "leave this level", once — not "undo the last flick", which is what
    // it meant while every swipe pushed an entry.
    renderFrom(['/book/does-not-exist', '/'])

    swipe(-150)
    expect(await screen.findByText('All books')).toBeDefined()
    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()
    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()

    // One press, and out — not three more screens of tab-shuffling first.
    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('leaves no history behind when the drawer moves between the four either', async () => {
    // The drawer and the swipe are the same move by two routes; if only one of
    // them replaced, Back would depend on which one the reader had reached for.
    renderFrom(['/book/does-not-exist', '/'])

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Settings/ }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('ignores a drag that starts inside the drawer', () => {
    // The drawer is a panel over the page, not part of it; dragging across its
    // links must not navigate the page underneath.
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    const drawer = screen.getByRole('navigation', { name: 'Main' })
    fireEvent.pointerDown(drawer, { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300 })
    fireEvent.pointerMove(document, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 300 })
    fireEvent.pointerUp(document, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 300 })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('closes the drawer on Escape', () => {

    renderAt('/')

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('has no bottom tab bar', () => {
    renderAt('/')

    // The drawer is the only navigation landmark, and it starts closed.
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
  })

  it('renders Settings on its route', () => {
    renderAt('/settings')

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined()
  })

  it('renders the full catalogue at /library', async () => {
    renderAt('/library')

    expect(screen.getByRole('heading', { name: 'All books' })).toBeDefined()
    expect(await screen.findByText('No books yet')).toBeDefined()
  })

  it('renders Stats on its route', () => {
    renderAt('/stats')

    expect(screen.getByRole('heading', { name: 'Stats' })).toBeDefined()
  })

  it('renders the Reader full-bleed, outside the shell', async () => {
    renderAt('/book/does-not-exist')

    // No tab bar while reading — that is the point of the route sitting
    // outside AppShell.
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('falls back to Home for an unknown route', () => {
    renderAt('/nowhere')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })
})
