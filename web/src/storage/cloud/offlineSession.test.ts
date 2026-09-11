/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The travel case, in full.
 *
 * An access token lives about an hour. `getSession()` renews it over the
 * network, so with no network it eventually answers "nobody is signed in" — and
 * every screen above it believes that. Before this, an hour into a flight the
 * app swapped itself for a sign-in form and refused to queue a single page
 * turn. These tests are the proof that it no longer does.
 */

const getSession = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession, signOut: vi.fn().mockResolvedValue({ error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}))

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

/** jsdom reports `onLine` from a getter, so it has to be replaced, not set. */
function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

let client: typeof import('./client.ts')

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  getSession.mockReset()
  setOnline(true)
  client = await import('./client.ts')
})

afterEach(() => {
  setOnline(true)
})

describe('currentUser with no signal', () => {
  it('writes the reader down while there is a signal', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'r@e.com' } } }, error: null })
    await expect(client.currentUser()).resolves.toEqual({ id: 'u1', email: 'r@e.com' })
  })

  it('keeps the reader signed in when the token cannot be renewed offline', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'r@e.com' } } }, error: null })
    await client.currentUser()

    setOnline(false)
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.currentUser()).resolves.toEqual({ id: 'u1', email: 'r@e.com' })
  })

  it('believes a renewal that failed on the network, even when the browser says it is online', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    await client.currentUser()

    // A train, not a plane: joined to a network that carries nothing.
    getSession.mockResolvedValue({ data: { session: null }, error: new TypeError('Failed to fetch') })
    await expect(client.currentUser()).resolves.toEqual({ id: 'u1', email: undefined })
  })

  it('believes a real sign-out that arrives with a working connection', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    await client.currentUser()

    getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.currentUser()).resolves.toBeUndefined()
  })

  it('does not reopen the door for a reader who signed out', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    await client.currentUser()
    await client.signOut()

    setOnline(false)
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.currentUser()).resolves.toBeUndefined()
  })

  it('shows the sign-in screen offline when nobody ever signed in here', async () => {
    setOnline(false)
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.currentUser()).resolves.toBeUndefined()
  })
})
