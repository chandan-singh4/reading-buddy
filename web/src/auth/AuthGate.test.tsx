// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthGate } from './AuthGate.tsx'

const state = vi.hoisted(() => ({
  backend: 'local' as 'local' | 'cloud',
  user: undefined as { id: string; email?: string } | undefined,
  asked: 0,
}))

vi.mock('../storage/index.ts', () => ({
  activeBackend: () => state.backend,
  chooseBackend: () => {},
}))

vi.mock('../storage/cloud/index.ts', () => ({
  isCloudConfigured: () => true,
  currentUser: async () => {
    state.asked += 1
    return state.user
  },
  onAuthChange: () => () => {},
  sendSignInLink: async () => {},
}))

afterEach(() => {
  cleanup()
  state.backend = 'local'
  state.user = undefined
  state.asked = 0
})

describe('AuthGate', () => {
  /**
   * The device library has no accounts, so the gate must be invisible *and*
   * silent — a reader who never turns the cloud on should not have the app
   * reaching for a Supabase session on every boot.
   */
  it('lets the app through untouched on the device library', async () => {
    render(
      <AuthGate>
        <p>the shelf</p>
      </AuthGate>,
    )

    expect(screen.getByText('the shelf')).toBeTruthy()
    expect(state.asked).toBe(0)
  })

  it('shows the sign-in screen on the cloud when signed out', async () => {
    state.backend = 'cloud'
    render(
      <AuthGate>
        <p>the shelf</p>
      </AuthGate>,
    )

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy())
    expect(screen.queryByText('the shelf')).toBeNull()
  })

  it('lets the app through on the cloud once signed in', async () => {
    state.backend = 'cloud'
    state.user = { id: 'user-1', email: 'reader@example.com' }
    render(
      <AuthGate>
        <p>the shelf</p>
      </AuthGate>,
    )

    await waitFor(() => expect(screen.getByText('the shelf')).toBeTruthy())
  })

  /**
   * Never the form before the answer. Supabase reads its stored session
   * asynchronously, so the naive version flashes sign-in at a reader who is
   * signed in, on every single launch.
   */
  it('shows neither the app nor the form while it is still asking', () => {
    state.backend = 'cloud'
    state.user = { id: 'user-1' }
    render(
      <AuthGate>
        <p>the shelf</p>
      </AuthGate>,
    )

    expect(screen.queryByText('the shelf')).toBeNull()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })
})
