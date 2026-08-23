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

/**
 * The signed-in token, swappable per test.
 *
 * A hoisted holder rather than a plain value, because `vi.mock` is lifted above
 * everything else in the file: a test that wants the token to hang has to be
 * able to reach in and change it afterwards.
 */
const auth = vi.hoisted(() => ({ token: (): Promise<string | undefined> => Promise.resolve('token') }))

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: () => auth.token(),
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

/**
 * The stuck lookup.
 *
 * This is the one the reader actually hit: the button said "Looking…" and never
 * stopped. A server that accepts the connection and then says nothing makes
 * `fetch` a promise that neither resolves nor rejects, so no amount of error
 * handling further up can help — the deadline has to be here.
 */
describe('a lookup that never comes back', () => {
  afterEach(() => {
    vi.useRealTimers()
    auth.token = () => Promise.resolve('token')
  })

  /** Nothing that ever settles on its own. */
  function silence(): Promise<never> {
    return new Promise<never>(() => {})
  }

  it('gives up on a request that says nothing, and says why', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(silence))

    const lookup = createCatalogue().search('breath')
    const said = expect(lookup).rejects.toThrow('Google Books did not answer in time')
    await vi.advanceTimersByTimeAsync(21_000)
    await said
  })

  it('aborts the request rather than leaving the socket open', async () => {
    vi.useFakeTimers()
    const fetched = vi.fn((_url: string, _init: RequestInit) => silence())
    vi.stubGlobal('fetch', fetched)

    const lookup = createCatalogue().search('breath')
    const said = expect(lookup).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(21_000)
    await said

    const signal = fetched.mock.calls[0]?.[1].signal as AbortSignal
    expect(signal.aborted).toBe(true)
  })

  it('gives up on a sign-in that hangs, before any request is made', async () => {
    vi.useFakeTimers()
    auth.token = silence
    const fetched = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetched)

    const lookup = createCatalogue().search('breath')
    const said = expect(lookup).rejects.toThrow('signing in took too long')
    await vi.advanceTimersByTimeAsync(21_000)
    await said

    expect(fetched).not.toHaveBeenCalled()
  })

  it('leaves a lookup that answers in time alone', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [{ id: 'a' }] }))))

    const lookup = createCatalogue().search('breath')
    await vi.advanceTimersByTimeAsync(50)
    expect(await lookup).toEqual([{ id: 'a' }])
  })
})
