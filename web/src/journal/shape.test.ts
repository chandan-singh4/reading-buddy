// Giving a spoken entry a shape.
//
// The claim this module makes is narrow and absolute: it reads `raw` and it
// never writes it. Everything else here is about reading the relay's stream
// without inventing anything the relay did not say.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { shapeEntry, titleOf } from './shape.ts'

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: async () => 'a-token',
}))

/** A relay stream, as the real one writes it: one JSON object per line. */
function streamOf(...frames: unknown[]): ReadableStream<Uint8Array> {
  const body = frames.map((frame) => `${JSON.stringify(frame)}\n`).join('')
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
}

function relaySays(...frames: unknown[]) {
  const fetched = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(streamOf(...frames), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetched)
  return fetched
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shapeEntry', () => {
  it('sends the raw words and the level the reader picked', async () => {
    const fetched = relaySays(
      { t: 'open', model: 'a-free-model' },
      { t: 'done', reply: { text: 'Hey. How is it going?' } },
    )

    await shapeEntry('tidy', 'hey how is it going')

    const body = JSON.parse(String(fetched.mock.calls[0]?.[1]?.body))
    expect(body.excerpt).toBe('hey how is it going')
    expect(body.intent).toBe('tidy')
    expect(body.stream).toBe(true)
  })

  it('returns the finished text and the model that wrote it', async () => {
    relaySays(
      { t: 'open', model: 'a-free-model' },
      { t: 'text', d: 'Hey. ' },
      { t: 'done', reply: { text: 'Hey. How is it going?' } },
    )

    const shaped = await shapeEntry('tidy', 'hey how is it going')

    expect(shaped.text).toBe('Hey. How is it going?')
    expect(shaped.model).toBe('a-free-model')
    // Tidy writes no title, so none is invented for it.
    expect(shaped.title).toBeUndefined()
  })

  it('keeps the deltas when the stream ends without a closing frame', async () => {
    relaySays({ t: 'open', model: 'a-free-model' }, { t: 'text', d: 'Half a sentence' })

    const shaped = await shapeEntry('tidy', 'half a sentence')

    expect(shaped.text).toBe('Half a sentence')
  })

  it('drops the stump a failed model left when the relay moves on', async () => {
    relaySays(
      { t: 'open', model: 'the-one-that-died' },
      { t: 'text', d: 'a half-written' },
      { t: 'open', model: 'the-one-that-answered' },
      { t: 'text', d: 'The whole answer.' },
    )

    const shaped = await shapeEntry('tidy', 'something')

    expect(shaped.text).toBe('The whole answer.')
    expect(shaped.model).toBe('the-one-that-answered')
  })

  it('lifts an opening H1 out of the body and into the title', async () => {
    relaySays(
      { t: 'open', model: 'a-free-model' },
      { t: 'done', reply: { text: '# Why I keep rereading\n\nI keep coming back to it.' } },
    )

    const shaped = await shapeEntry('shape', 'why i keep rereading it')

    expect(shaped.title).toBe('Why I keep rereading')
    // Not left in the body too, or the screen would print it twice.
    expect(shaped.text).toBe('I keep coming back to it.')
  })

  it('refuses rather than returning an apology to be stored as the entry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))

    await expect(shapeEntry('tidy', 'something')).rejects.toThrow(/busy/)
  })

  it('refuses when the model sends nothing back', async () => {
    relaySays({ t: 'open', model: 'a-free-model' }, { t: 'done', reply: { text: '   ' } })

    await expect(shapeEntry('tidy', 'something')).rejects.toThrow(/nothing back/)
  })

  it('does not call the relay for an empty entry', async () => {
    const fetched = relaySays({ t: 'done', reply: { text: 'x' } })

    await expect(shapeEntry('tidy', '   ')).rejects.toThrow(/no words/)
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe('titleOf', () => {
  it('reads an H1 and nothing else', () => {
    expect(titleOf('# A title\n\nbody')).toBe('A title')
    expect(titleOf('## Not the title\n\nbody')).toBeUndefined()
    expect(titleOf('Just a paragraph.')).toBeUndefined()
    expect(titleOf('#\n\nbody')).toBeUndefined()
  })
})
