/**
 * An answer must survive the reader walking away.
 *
 * The reader's report: ask a question, watch the model start thinking, flick to
 * another app or close the panel, come back — and the question is sitting there
 * unanswered, to be asked again. Every test here is one way of walking away.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { askOnErrand, errandAt, forgetAllErrands, forgetErrand, watchErrand } from './errand.ts'
import type { AskTutorRequest, TutorMessage } from './tutor.ts'

// The ask signs its request. Without a token it never reaches the stub relay,
// and every test here would be measuring the sign-in failure instead.
vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: () => Promise.resolve('token'),
}))

const asked: AskTutorRequest = {
  anchor: { anchor: 'ch01-s01-p001' as never, excerpt: 'A passage.', kind: 'sentence' },
  mode: 'fresh',
  intent: 'simply',
  history: [],
  userMessage: 'What does this mean?',
}

/*
 * A stub relay, one body per ask.
 *
 * The bodies are queued rather than swapped in, because the ask reaches for its
 * sign-in token before it calls `fetch`. Two asks started back to back both
 * arrive after the last stub is in place, so a stub that answered with "the
 * current body" would hand the same stream to both — and the second would find
 * it already locked by the first.
 */
const bodies: ReadableStream<Uint8Array>[] = []

function relay() {
  let push: (line: unknown) => void = () => {}
  let close: () => void = () => {}
  const encoder = new TextEncoder()
  bodies.push(
    new ReadableStream<Uint8Array>({
      start(controller) {
        push = (line) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}
`))
        close = () => controller.close()
      },
    }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(bodies.shift(), {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson' },
        }),
      ),
    ),
  )
  return { push: (line: unknown) => push(line), close: () => close() }
}

/** Wait for the errand to land, without guessing at a delay. */
async function landed(key: string) {
  for (let tries = 0; tries < 60; tries += 1) {
    if (errandAt(key)?.result) return errandAt(key)!.result!
    await new Promise((go) => setTimeout(go, 5))
  }
  throw new Error('the errand never landed')
}

const answer = {
  t: 'done',
  reply: { text: 'It means the self.', model: 'a/one', source: 'groq' },
}

afterEach(() => {
  vi.unstubAllGlobals()
  bodies.length = 0
  forgetAllErrands()
})

describe('an errand', () => {
  it('finishes and saves with nobody watching at all', async () => {
    /*
     * The heart of it. No watcher is ever attached — the panel is closed, the
     * reader is in another app — and the answer must still be saved. This used
     * to be the failure: the save went through the panel, and a closed panel
     * saved nothing.
     */
    const wire = relay()
    const saved: TutorMessage[][] = []

    askOnErrand('p1', asked, (reply) => {
      const messages: TutorMessage[] = [{ role: 'claude', text: reply.text, ts: 1 }]
      saved.push(messages)
      return { messages }
    })

    wire.push(answer)
    wire.close()
    await landed('p1')

    expect(saved).toHaveLength(1)
    expect(saved[0]![0]!.text).toBe('It means the self.')
  })

  it('hands the finished answer to a panel that comes back later', async () => {
    // The reader closed the room and reopened it. The answer is waiting.
    const wire = relay()
    askOnErrand('p1', asked, (reply) => ({
      messages: [{ role: 'claude', text: reply.text, ts: 1 }],
    }))
    wire.push(answer)
    wire.close()
    await landed('p1')

    expect(errandAt('p1')?.result?.messages[0]?.text).toBe('It means the self.')
  })

  it('reports the answer being written to a panel that opens mid-thought', async () => {
    const wire = relay()
    askOnErrand('p1', asked, (reply) => ({
      messages: [{ role: 'claude', text: reply.text, ts: 1 }],
    }))

    // The panel opens *after* the question was asked, which is the ordering
    // that matters: a watcher must not have to exist before the errand does.
    const seen: string[] = []
    watchErrand('p1', (errand) => seen.push(errand.progress.text))

    wire.push({ t: 'text', d: 'It means ' })
    await new Promise((go) => setTimeout(go, 20))

    expect(seen.at(-1)).toBe('It means ')
    wire.close()
  })

  it('lets a watcher go without stopping the answer', async () => {
    // Closing the panel unsubscribes. The ask carries on regardless.
    const wire = relay()
    let saved = ''
    askOnErrand('p1', asked, (reply) => {
      saved = reply.text
      return { messages: [{ role: 'claude', text: reply.text, ts: 1 }] }
    })

    const stop = watchErrand('p1', () => {})
    stop()

    wire.push(answer)
    wire.close()
    await landed('p1')

    expect(saved).toBe('It means the self.')
  })

  it('keeps a live errand when asked to forget it', async () => {
    // Forgetting one still being written would throw away the answer it is in
    // the middle of, which is the opposite of this file's job.
    const wire = relay()
    askOnErrand('p1', asked, (reply) => ({
      messages: [{ role: 'claude', text: reply.text, ts: 1 }],
    }))

    forgetErrand('p1')
    expect(errandAt('p1')).toBeDefined()

    wire.push(answer)
    wire.close()
    await landed('p1')

    // Landed, so now it may go.
    forgetErrand('p1')
    expect(errandAt('p1')).toBeUndefined()
  })

  it('ignores an answer to a question that was asked again', async () => {
    /*
     * Retry, or a panel torn down and rebuilt. The first ask cannot be called
     * back and will still return — with an answer to a question nobody is
     * waiting on. It must land silently rather than overwrite the new one.
     */
    const first = relay()
    const settled: string[] = []
    askOnErrand('p1', asked, (reply) => {
      settled.push(`first:${reply.text}`)
      return { messages: [] }
    })

    const second = relay()
    askOnErrand('p1', asked, (reply) => {
      settled.push(`second:${reply.text}`)
      return { messages: [{ role: 'claude', text: reply.text, ts: 2 }] }
    })

    first.push({ t: 'done', reply: { text: 'The stale one.', model: 'a/one' } })
    first.close()
    second.push(answer)
    second.close()
    await landed('p1')

    expect(settled).not.toContain('first:The stale one.')
    expect(errandAt('p1')?.result?.messages[0]?.text).toBe('It means the self.')
  })

  it('saves before it tells anyone, so a broken watcher cannot cost the answer', async () => {
    // A watcher is React code. One day one of them will throw, and when it does
    // the answer must already be on disk.
    const wire = relay()
    let saved = ''
    askOnErrand('p1', asked, (reply) => {
      saved = reply.text
      return { messages: [{ role: 'claude', text: reply.text, ts: 1 }] }
    })
    watchErrand('p1', (errand) => {
      if (errand.result) throw new Error('a render blew up')
    })

    wire.push(answer)
    wire.close()
    await new Promise((go) => setTimeout(go, 40))

    expect(saved).toBe('It means the self.')
  })

  it('still tells the other watchers when one of them throws', async () => {
    // Two panels can watch one passage — the open one and one being torn down.
    // A failure in the first must not silence the second.
    const wire = relay()
    askOnErrand('p1', asked, (reply) => ({
      messages: [{ role: 'claude', text: reply.text, ts: 1 }],
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let heard = ''
    watchErrand('p1', () => {
      throw new Error('a render blew up')
    })
    watchErrand('p1', (errand) => {
      if (errand.result) heard = errand.result.messages[0]!.text
    })

    wire.push(answer)
    wire.close()
    await landed('p1')
    await new Promise((go) => setTimeout(go, 10))

    expect(heard).toBe('It means the self.')
  })
})
