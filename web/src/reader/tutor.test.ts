/**
 * What `askTutor` does when the relay answers, and when it doesn't.
 *
 * The failure half is the important half, and it is a correctness rule rather
 * than a nicety: **a tutor that invents an answer is worse than a tutor that
 * says nothing.** The reader is asking about a passage they did not
 * understand. They have no way to catch a confident, fluent guess, and they
 * will carry it away believing the book said it. So every path out of this
 * function either carries the model's real words or admits plainly that it
 * has none — and these tests are what stop a later refactor from adding a
 * cheerful placeholder in the middle.
 *
 * The success half checks the two fields the UI cannot get anywhere else: the
 * model that really answered, and the explain-back probe as its own turn.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: async () => 'token',
  CloudError: class CloudError extends Error {},
}))

const { askTutor, INTENT_LABELS, modelLabel } = await import('./tutor.ts')

afterEach(() => {
  vi.unstubAllGlobals()
})

const request = {
  anchor: { anchor: 'ch02-s03-p013' as never, excerpt: 'Entropy always rises.', kind: 'sentence' as const },
  mode: 'fresh' as const,
  intent: 'simply' as const,
  history: [],
  userMessage: 'Explain simply',
}

function answering(response: Response | Error) {
  const fetch = vi.fn((_url: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response.clone()),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function relay(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('when the relay answers', () => {
  it('carries the model that really produced the text, not the one asked for', async () => {
    answering(relay({ text: 'Here is the idea.', model: 'meta-llama/llama-3.3-70b-instruct:free' }))

    const reply = await askTutor({ ...request, model: 'z-ai/glm-4.6:free' })

    // The reader picked GLM and a different model served it. The label has to
    // say so — that is the entire reason the field exists.
    expect(reply.text).toBe('Here is the idea.')
    expect(reply.model).toBe('meta-llama/llama-3.3-70b-instruct:free')
  })

  it('carries the explain-back probe as a separate turn', async () => {
    answering(relay({ text: 'Here is the idea.', model: 'a', probe: 'Can you put that in your own words?' }))

    const reply = await askTutor(request)

    expect(reply.probe).toBe('Can you put that in your own words?')
  })

  it('leaves the probe out when the relay sent none', async () => {
    answering(relay({ text: 'A definition.', model: 'a' }))

    expect((await askTutor({ ...request, intent: 'define' })).probe).toBeUndefined()
  })

  it('sends the reader s pick so the relay can lead its chain with it', async () => {
    const fetch = answering(relay({ text: 'ok', model: 'a' }))

    await askTutor({ ...request, model: 'z-ai/glm-4.6:free' })

    const sent = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as { model?: string }
    expect(sent.model).toBe('z-ai/glm-4.6:free')
  })

  it('signs the request, because the relay is a spend control', async () => {
    const fetch = answering(relay({ text: 'ok', model: 'a' }))

    await askTutor(request)

    const headers = fetch.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer token')
  })
})

describe('when the relay does not answer', () => {
  async function textFrom(response: Response | Error): Promise<string> {
    answering(response)
    return (await askTutor(request)).text
  }

  it('never rejects — the lamp always gets something to print', async () => {
    answering(new TypeError('Failed to fetch'))

    await expect(askTutor(request)).resolves.toBeDefined()
  })

  it('says to sign in, because that is the remedy', async () => {
    expect(await textFrom(relay({}, 401))).toContain('signed in')
  })

  it('says to wait when the tutor has been asked too much', async () => {
    expect(await textFrom(relay({}, 429))).toContain('minute')
  })

  it('says the server needs fixing, not the reader', async () => {
    expect(await textFrom(relay({}, 500))).toContain('server')
  })

  it('names being offline, which on a phone is the usual cause', async () => {
    expect(await textFrom(new TypeError('Failed to fetch'))).toContain('offline')
  })

  it('treats a 200 with no text as a failure, not as an empty answer', async () => {
    // An empty completion is a failure wearing a success code. Printing it
    // would give the reader a blank bubble and no idea why.
    expect(await textFrom(relay({ text: '' }))).toContain('could not be reached')
  })

  it('carries no model, so nothing can label a failure as a model s work', async () => {
    answering(relay({}, 502))

    const reply = await askTutor(request)

    expect(reply.model).toBeUndefined()
    expect(reply.probe).toBeUndefined()
  })

  it('never puts the passage s own words into the failure', async () => {
    // The one shape a guess would take: echoing the passage back as though it
    // were an explanation of it.
    expect(await textFrom(relay({}, 502))).not.toContain('Entropy')
  })
})

describe('the chips', () => {
  it('names a task module for every intent the lamp offers', () => {
    // The relay keys its prompt library on these exact strings. A chip with no
    // module falls through to a bare answer with no teaching instruction at
    // all — and it does so silently.
    expect(Object.keys(INTENT_LABELS).sort()).toEqual(['define', 'discuss', 'friend', 'simply'])
  })
})

describe('modelLabel', () => {
  it('reads a slug as a name', () => {
    expect(modelLabel('z-ai/glm-5.2:free')).toBe('GLM 5.2')
  })

  it('keeps versions and sizes as they were written', () => {
    expect(modelLabel('google/gemma-4-31b-it:free')).toBe('Gemma 4 31b IT')
  })

  it('handles a slug with no vendor', () => {
    expect(modelLabel('inkling')).toBe('Inkling')
  })
})

describe('the failure the free tier actually produces', () => {
  it('tells the reader to pick another model when none would answer', async () => {
    answering(new Response(JSON.stringify({ error: 'OpenRouter answered 429' }), { status: 502 }))
    const reply = await askTutor(request)
    expect(reply.text).toMatch(/pick a different one/i)
    expect(reply.model).toBeUndefined()
  })

  it('says a busy model is the free tier, not the reader', async () => {
    answering(new Response('{}', { status: 429 }))
    const reply = await askTutor(request)
    expect(reply.text).toMatch(/free tier/i)
  })
})
