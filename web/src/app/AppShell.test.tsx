// @vitest-environment jsdom
//
// Component tests need a DOM; the pure unit tests elsewhere stay on the faster
// node environment. fake-indexeddb must load first — Library reads through the
// real repository, so there has to be a real database underneath it.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

describe('app shell', () => {
  it('lands on Home and reports an empty shelf', async () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
    // Resolves only once the repository has actually answered.
    expect(await screen.findByText('No books yet')).toBeDefined()
  })

  it('opens the drawer from the hamburger and offers all three destinations', () => {
    renderAt('/')

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toBeDefined()
    expect(screen.getByRole('link', { name: /All Books/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Stats/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Settings/ })).toBeDefined()
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
