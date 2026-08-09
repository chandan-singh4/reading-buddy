import { describe, expect, it } from 'vitest'

import { resolveBackend } from './backend.ts'

/**
 * The whole point of these is the fallback. A build without Supabase keys that
 * still remembers `cloud` must open the device library, because the alternative
 * is a sign-in screen that can never be satisfied and no way past it.
 */
describe('resolveBackend', () => {
  it('defaults to the device library when nothing has been chosen', () => {
    expect(resolveBackend(null, true)).toBe('local')
    expect(resolveBackend(undefined, true)).toBe('local')
  })

  it('uses the cloud once it has been chosen', () => {
    expect(resolveBackend('cloud', true)).toBe('cloud')
  })

  it('falls back to the device when the cloud is not configured on this build', () => {
    expect(resolveBackend('cloud', false)).toBe('local')
  })

  it('treats an unrecognised stored value as the device', () => {
    expect(resolveBackend('', true)).toBe('local')
    expect(resolveBackend('supabase', true)).toBe('local')
    expect(resolveBackend('CLOUD', true)).toBe('local')
  })
})
