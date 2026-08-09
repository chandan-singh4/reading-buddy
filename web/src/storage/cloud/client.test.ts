import { describe, expect, it } from 'vitest'

import { normaliseSupabaseUrl, signInFailureMessage } from './client.ts'

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

/**
 * The point of every case here is that the reader should be able to act on the
 * sentence without opening DevTools. The old single message — "check the
 * address and try again" — sent them to look at the one thing that was fine.
 */
describe('signInFailureMessage', () => {
  it('names the email allowance on a 429, whatever the wording', () => {
    expect(signInFailureMessage({ status: 429, message: 'over_email_send_rate_limit' })).toMatch(
      /email allowance/i,
    )
  })

  it('recognises a rate limit reported without a status', () => {
    expect(signInFailureMessage({ message: 'Email rate limit exceeded' })).toMatch(
      /email allowance/i,
    )
  })

  /** The lock-out: sign-ups closed before this address ever signed in once. */
  it('explains closed sign-ups and where to reopen them', () => {
    const message = signInFailureMessage({ message: 'Signups not allowed for otp' })
    expect(message).toMatch(/Sign Ups/)
    expect(message).toMatch(/sign in once/)
  })

  it('says so when the address itself was rejected', () => {
    expect(signInFailureMessage({ message: 'Unable to validate email address: invalid format' }))
      .toMatch(/email address/i)
  })

  /**
   * The catch-all must still carry Supabase's own words. An unrecognised cause
   * is exactly the case where the raw text is the only clue there is.
   */
  it('passes an unrecognised reason straight through', () => {
    expect(signInFailureMessage({ message: 'Database error finding user' })).toContain(
      'Database error finding user',
    )
  })

  it('admits it has nothing when there is no message at all', () => {
    expect(signInFailureMessage({})).toMatch(/no reason/i)
  })
})
