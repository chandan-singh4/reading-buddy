import { describe, expect, it } from 'vitest'

import { resolveBackend } from './backend.ts'

/**
 * There is no choice left to test, only the fallback. A build without Supabase
 * keys must open the device library, because the alternative is a sign-in
 * screen that can never be satisfied and no way past it.
 */
describe('resolveBackend', () => {
  it('uses the cloud whenever the cloud is configured', () => {
    expect(resolveBackend(true)).toBe('cloud')
  })

  it('falls back to the device only when the cloud is not configured on this build', () => {
    expect(resolveBackend(false)).toBe('local')
  })
})
