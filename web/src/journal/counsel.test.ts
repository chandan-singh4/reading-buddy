// A considered opinion on an entry.
//
// Two claims are worth a test. The reading is sent the reader's own words, and
// the angle the model chose is lifted out of the body rather than left inside
// it — the frame is the opinion, so the screen has to be able to show it on
// its own.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { askCounsel } from './counsel.ts'

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

const READING = [
  '# A decision already made, looking for permission',
  '',
  'You wrote that you had "already booked it" before listing the reasons.',
  '',
  '## One opinion',
  '',
  'You are not weighing this. You are rehearsing a defence of it.',
].join('\n')

it('lifts the angle off the reading, so the screen can show the frame', async () => {
  relaySays(
    { t: 'open', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
    { t: 'text', d: READING },
    { t: 'done', reply: { text: READING, model: 'nvidia/nemotron-3-super-120b-a12b:free' } },
  )

  const read = await askCounsel('i already booked it but i keep thinking about it')

  expect(read.angle).toBe('A decision already made, looking for permission')
  // Taken out of the body, not left in it twice.
  expect(read.text.startsWith('You wrote that you had')).toBe(true)
  expect(read.text).not.toContain('looking for permission')
  expect(read.model).toBe('nvidia/nemotron-3-super-120b-a12b:free')
})

it('asks the counsel module, with the reader’s own words', async () => {
  const fetched = relaySays({ t: 'done', reply: { text: READING, model: 'a/b:free' } })

  await askCounsel('i already booked it')

  const sent = JSON.parse(String((fetched.mock.calls[0]?.[1] as RequestInit).body))
  expect(sent.intent).toBe('counsel')
  expect(sent.excerpt).toBe('i already booked it')
  // Streamed, because the host gives an edge function about 25 seconds to send
  // its first byte and a whole reading written before that runs past it.
  expect(sent.stream).toBe(true)
})

it('keeps a reading that is nothing but a heading, rather than storing nothing', async () => {
  // A model that answered with one line misread the job. Taking that line away
  // as the angle would store a reading with no reading in it.
  const only = '# A decision already made'
  relaySays({ t: 'done', reply: { text: only, model: 'a/b:free' } })

  const read = await askCounsel('i already booked it')

  expect(read.angle).toBeUndefined()
  expect(read.text).toBe(only)
})

it('refuses rather than storing an apology as an opinion', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 429 })),
  )

  await expect(askCounsel('a thought')).rejects.toThrow(/already saved/)
})

it('will not ask about an empty entry', async () => {
  await expect(askCounsel('   ')).rejects.toThrow(/no words/)
})
