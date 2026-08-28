import { afterEach, describe, expect, it, vi } from 'vitest'

import { askMemory } from './digest.ts'

vi.mock('../storage/cloud/client.ts', () => ({ accessToken: async () => undefined }))

function stream(...lines: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const piece of lines) controller.enqueue(encoder.encode(`${JSON.stringify(piece)}\n`))
      controller.close()
    },
  })
}

function relay(body: ReadableStream<Uint8Array>) {
  const fetching = vi.fn(async (_url: string, init?: RequestInit) => {
    sent = String(init?.body)
    return new Response(body, { status: 200 })
  })
  vi.stubGlobal('fetch', fetching)
  return fetching
}

/** The request body of the last call, so a test can read what was asked for. */
let sent = ''

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('asking the relay for a record', () => {
  it('asks for a stream, so the host does not time the call out', async () => {
    relay(
      stream(
        { t: 'open', model: 'a/one' },
        { t: 'text', d: 'The chapter.' },
        { t: 'done', reply: { text: 'The chapter.', model: 'a/one' } },
      ),
    )

    expect(await askMemory('recap', 'Some prose.')).toBe('The chapter.')
    expect((JSON.parse(sent) as { stream?: unknown }).stream).toBe(true)
  })

  it('drops the stump when the relay starts again on another model', async () => {
    relay(
      stream(
        { t: 'open', model: 'a/busy' },
        { t: 'text', d: 'Half a sen' },
        { t: 'open', model: 'b/willing' },
        { t: 'text', d: 'A whole one.' },
        { t: 'done', reply: { text: 'A whole one.', model: 'b/willing' } },
      ),
    )
    expect(await askMemory('recap', 'Some prose.')).toBe('A whole one.')
  })

  it('throws the relay’s own words when every model refused', async () => {
    relay(stream({ t: 'open', model: 'a/busy' }, { t: 'error', message: 'the free model is busy' }))
    await expect(askMemory('recap', 'Some prose.')).rejects.toThrow('the free model is busy')
  })
})
