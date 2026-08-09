import { describe, expect, it } from 'vitest'

import { normaliseSupabaseUrl } from './client.ts'

/**
 * Every case here is a real paste, not a hypothetical one. The dashboard offers
 * the Project URL and the RESTful endpoint within a couple of centimetres of
 * each other, and taking the wrong one costs an evening: the app loads, the
 * keys resolve, sign-in fails with `PGRST125: Invalid path specified in request
 * URL`, and nothing in that sentence points at the value you typed.
 */
describe('normaliseSupabaseUrl', () => {
  it('leaves a correct project URL alone', () => {
    expect(normaliseSupabaseUrl('https://abcdefgh.supabase.co')).toBe(
      'https://abcdefgh.supabase.co',
    )
  })

  it('drops the /rest/v1 endpoint copied from the Data API page', () => {
    expect(normaliseSupabaseUrl('https://abcdefgh.supabase.co/rest/v1')).toBe(
      'https://abcdefgh.supabase.co',
    )
  })

  it('drops a trailing slash, which otherwise doubles up in every request path', () => {
    expect(normaliseSupabaseUrl('https://abcdefgh.supabase.co/')).toBe(
      'https://abcdefgh.supabase.co',
    )
  })

  it('drops surrounding whitespace from a copy-paste', () => {
    expect(normaliseSupabaseUrl('  https://abcdefgh.supabase.co  ')).toBe(
      'https://abcdefgh.supabase.co',
    )
  })

  /** Unset and empty must both read as "no cloud", not as a broken cloud. */
  it('treats missing and blank as unconfigured', () => {
    expect(normaliseSupabaseUrl(undefined)).toBeUndefined()
    expect(normaliseSupabaseUrl('')).toBeUndefined()
    expect(normaliseSupabaseUrl('   ')).toBeUndefined()
  })

  /**
   * Something unparseable is handed back untouched rather than swallowed:
   * `createClient` complains about it more clearly than a guess would, and
   * returning undefined here would silently claim the cloud isn't set up.
   */
  it('hands back something that is not a URL for the client to reject', () => {
    expect(normaliseSupabaseUrl('abcdefgh.supabase.co')).toBe('abcdefgh.supabase.co')
  })
})
