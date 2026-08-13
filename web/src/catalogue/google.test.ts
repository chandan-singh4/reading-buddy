/**
 * What the reader is told when a lookup doesn't come back.
 *
 * Each message finishes the sentence "Couldn't ask Google Books — …", and each
 * one exists to answer a different question: wait a day, sign in, get on a
 * network, or tell someone the server is wrong. A status number answers none of
 * them.
 *
 * The 404 case is here because it happened: `.gitignore` carried a bare
 * `books/`, which matches at any depth, so `api/books/` was silently never
 * committed. The endpoint deployed to nothing and every lookup 404ed — and the
 * message at the time said only "(404)", which reads like the book is missing
 * rather than the service.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: async () => 'token',
  CloudError: class CloudError extends Error {},
}))

const { createCatalogue } = await import('./google.ts')

afterEach(() => {
  vi.unstubAllGlobals()
})

async function reasonFrom(response: Response | Error): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  )

  try {
    await createCatalogue().search('anything')
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the lookup to fail')
}

function status(code: number): Response {
  return new Response('{}', { status: code })
}

describe('what a failed lookup says', () => {
  it('names the quota, and that it comes back on its own', async () => {
    expect(await reasonFrom(status(429))).toBe('today’s lookup limit is used up — it resets tomorrow')
  })

  it('treats a refusal the same way — it is the same wait', async () => {
    expect(await reasonFrom(status(403))).toContain('resets tomorrow')
  })

  it('says to sign in', async () => {
    expect(await reasonFrom(status(401))).toBe('you’re signed out')
  })

  // The one that actually bit. "404" alone reads as "no such book".
  it('says the service is missing, not the book', async () => {
    expect(await reasonFrom(status(404))).toBe('this copy of the app has no lookup service')
  })

  it('names a missing key as a missing key', async () => {
    expect(await reasonFrom(status(503))).toBe('the lookup service has no Google Books key')
  })

  it('blames Google for Google’s own errors', async () => {
    expect(await reasonFrom(status(502))).toBe('Google Books is having trouble')
  })

  it('turns a bare network failure into the thing it usually is', async () => {
    expect(await reasonFrom(new TypeError('Failed to fetch'))).toBe('you’re offline')
  })

  it('still says the number for anything unforeseen', async () => {
    expect(await reasonFrom(status(418))).toBe('something went wrong (418)')
  })
})

describe('a lookup that worked', () => {
  it('takes the ids out of a search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [{ id: 'a' }, { id: 'b' }] }))),
    )

    expect(await createCatalogue().search('breath')).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('unwraps volumeInfo, and survives a volume that has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ volumes: [{ volumeInfo: { title: 'Breath' } }, {}] })),
      ),
    )

    expect(await createCatalogue().volumes(['a', 'b'])).toEqual([{ title: 'Breath' }, {}])
  })
})
