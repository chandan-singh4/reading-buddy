/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'

import { REMEMBERED_USER_KEY, rememberUser, rememberedUser } from './remembered.ts'

/**
 * These guard one behaviour: a reader who is offline for longer than an access
 * token lives must not be shown a sign-in screen they cannot use.
 */
afterEach(() => {
  localStorage.clear()
})

describe('the remembered reader', () => {
  it('gives back the reader who was written down', () => {
    rememberUser({ id: 'u1', email: 'reader@example.com' })
    expect(rememberedUser()).toEqual({ id: 'u1', email: 'reader@example.com' })
  })

  it('keeps an id with no email, because the email is only decoration', () => {
    rememberUser({ id: 'u1' })
    expect(rememberedUser()).toEqual({ id: 'u1', email: undefined })
  })

  it('knows nobody before anyone has signed in', () => {
    expect(rememberedUser()).toBeUndefined()
  })

  it('forgets the reader on sign-out', () => {
    rememberUser({ id: 'u1' })
    rememberUser(undefined)
    expect(rememberedUser()).toBeUndefined()
  })

  it('treats a damaged note as no note at all', () => {
    localStorage.setItem(REMEMBERED_USER_KEY, 'not json')
    expect(rememberedUser()).toBeUndefined()

    localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ email: 'a@b.c' }))
    expect(rememberedUser()).toBeUndefined()

    localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ id: '' }))
    expect(rememberedUser()).toBeUndefined()
  })
})
