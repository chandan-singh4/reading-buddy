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
 * The success half checks the one field the UI cannot get anywhere else: the
 * model that really answered.
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

    const reply = await askTutor({
      ...request,
      models: [{ id: 'z-ai/glm-4.6:free', source: 'openrouter' }],
    })

    // The reader picked GLM and a different model served it. The label has to
    // say so — that is the entire reason the field exists.
    expect(reply.text).toBe('Here is the idea.')
    expect(reply.model).toBe('meta-llama/llama-3.3-70b-instruct:free')
  })

  it('sends the whole chain, not just the pick, so the fallback is chosen too', async () => {
    const fetch = answering(relay({ text: 'ok', model: 'a' }))

    const chain = [
      { id: 'z-ai/glm-4.6:free', source: 'openrouter' },
      { id: 'gemini-3.7-flash', source: 'gemini' },
      { id: 'openai/gpt-oss-120b', source: 'groq' },
    ]
    await askTutor({ ...request, models: chain })

    // Each rung carries its provider. The relay picks a URL and a key from it,
    // and an id alone no longer says who serves the model.
    const sent = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as {
      models?: { id: string; source: string }[]
    }
    expect(sent.models).toEqual(chain)
  })

  it('leaves the chain out when it is empty, so the relay uses its own list', async () => {
    const fetch = answering(relay({ text: 'ok', model: 'a' }))

    await askTutor({ ...request, models: [] })

    const sent = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as { models?: string[] }
    expect(sent.models).toBeUndefined()
  })

  it('carries the working-out and what the exchange cost', async () => {
    answering(
      relay({
        text: 'Here is the idea.',
        model: 'a',
        reasoning: 'First I read the sentence twice.',
        usage: { input: 1200, output: 340, total: 1540 },
      }),
    )

    const reply = await askTutor(request)

    expect(reply.reasoning).toBe('First I read the sentence twice.')
    expect(reply.usage).toEqual({ input: 1200, output: 340, total: 1540 })
  })

  it('treats all-zero counts as no counts at all', async () => {
    // A provider that reports nothing sends zeroes. "0 tokens" under a
    // paragraph of explanation reads as a bug, not as a figure.
    answering(relay({ text: 'ok', model: 'a', usage: { input: 0, output: 0, total: 0 } }))

    expect((await askTutor(request)).usage).toBeUndefined()
  })

  it('sends the effort when the reader chose one', async () => {
    const fetch = answering(relay({ text: 'ok', model: 'a' }))

    await askTutor({ ...request, effort: 'low' })

    const sent = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as { effort?: string }
    expect(sent.effort).toBe('low')
  })

  it('asks for a web search only when the reader turned the globe on', async () => {
    const fetch = answering(relay({ text: 'ok', model: 'a' }))

    await askTutor({ ...request, search: true })
    const on = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as { search?: boolean }
    expect(on.search).toBe(true)

    await askTutor(request)
    const off = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as { search?: boolean }
    // Absent, not `false`. A search costs money, so the request never carries a
    // switch the reader did not throw.
    expect('search' in off).toBe(false)
  })

  it('carries where a searched answer looked', async () => {
    answering(
      relay({
        text: 'Still true.',
        model: 'a',
        sources: [
          { url: 'https://example.org/paper', title: 'A paper' },
          { url: 'https://example.org/other' },
        ],
      }),
    )

    const reply = await askTutor({ ...request, search: true })

    expect(reply.sources).toEqual([
      { url: 'https://example.org/paper', title: 'A paper' },
      { url: 'https://example.org/other' },
    ])
  })

  it('drops a citation with no address, which is a source nobody can follow', async () => {
    answering(relay({ text: 'ok', model: 'a', sources: [{ title: 'Somewhere' }, 'nonsense'] }))

    const reply = await askTutor({ ...request, search: true })

    expect(reply.sources).toBeUndefined()
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
    expect(Object.keys(INTENT_LABELS).sort()).toEqual([
      'define',
      'discuss',
      'friend',
      'happening',
      'historical',
      'interpret',
      'simply',
      'stilltrue',
    ])
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

describe('what the relay is told about the passage', () => {
  it('sends the book, the place in it, and the text either side', async () => {
    const fetch = answering(relay({ text: 'ok' }))

    await askTutor({
      ...request,
      context: {
        title: 'Memories',
        author: 'C. G. Jung',
        chapter: 'First Years',
        section: 'The Cathedral',
        before: 'The sentence before.',
        after: 'The sentence after.',
      },
    })

    const sent = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)
    expect(sent.context.title).toBe('Memories')
    expect(sent.context.author).toBe('C. G. Jung')
    expect(sent.context.chapter).toBe('First Years')
    expect(sent.context.section).toBe('The Cathedral')
    expect(sent.context.before).toBe('The sentence before.')
    expect(sent.context.after).toBe('The sentence after.')
    expect(sent.excerpt).toBe('Entropy always rises.')
  })

  it('leaves the field out entirely when there is no context', async () => {
    const fetch = answering(relay({ text: 'ok' }))

    await askTutor(request)

    const sent = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)
    expect('context' in sent).toBe(false)
  })
})

describe('watching the answer being written', () => {
  /*
   * The relay answers in lines of JSON when the caller hands in a watcher.
   * What is guarded here is that the two halves cannot drift: the pieces the
   * watcher sees must add up to the reply the promise resolves to, and a
   * caller that hands in no watcher must still get the plain single reply the
   * memory layer was written against.
   */

  function streamed(lines: unknown[]): Response {
    return new Response(lines.map((line) => `${JSON.stringify(line)}\n`).join(''), {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    })
  }

  const written = [
    { t: 'open', model: 'a/one', source: 'groq' },
    { t: 'think', d: 'Working it out.' },
    { t: 'text', d: 'Jung meant ' },
    { t: 'text', d: 'the unconscious.' },
    { t: 'usage', v: { input: 10, output: 5, total: 15 } },
    {
      t: 'done',
      reply: {
        text: 'Jung meant the unconscious.',
        model: 'a/one',
        source: 'groq',
        usage: { input: 10, output: 5, total: 15 },
      },
    },
  ]

  it('reports the answer growing, one piece at a time', async () => {
    answering(streamed(written))
    const seen: string[] = []

    await askTutor(request, (progress) => seen.push(progress.text))

    // Each report is the whole answer so far, never the newest scrap — a
    // caller keeping its own running total is a second copy of the truth.
    expect(seen).toContain('Jung meant ')
    expect(seen).toContain('Jung meant the unconscious.')
  })

  it('names the model before a single word arrives', async () => {
    // The bubble is labelled from the first report, so the name does not
    // appear late and shift the text under the reader.
    answering(streamed(written))
    const first: string[] = []

    await askTutor(request, (progress) => {
      if (progress.model) first.push(`${progress.model}:${progress.text}`)
    })

    expect(first[0]).toBe('a/one:')
  })

  it('resolves to the same reply the pieces added up to', async () => {
    answering(streamed(written))
    let last = ''

    const reply = await askTutor(request, (progress) => {
      last = progress.text
    })

    expect(reply.text).toBe(last)
    expect(reply.usage?.total).toBe(15)
  })

  it('asks for a stream only when someone is watching', async () => {
    const fetch = answering(streamed(written))
    await askTutor(request, () => {})
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).stream).toBe(true)

    // The memory layer writes digests nobody is looking at. It must keep the
    // single-reply path it was built against.
    answering(relay({ text: 'A digest.', model: 'a' }))
    const plain = await askTutor(request)
    expect(plain.text).toBe('A digest.')
  })

  it('keeps the words when the stream stops before it finished', async () => {
    // A half-written answer the reader watched appear is worth more than a
    // canned line replacing it. Losing it would look like the app throwing
    // work away in front of them.
    answering(streamed(written.slice(0, 4)))

    const reply = await askTutor(request, () => {})

    expect(reply.text).toBe('Jung meant the unconscious.')
    expect(reply.failed).toBeUndefined()
  })

  it('says so plainly when the stream carried a failure and no words', async () => {
    answering(streamed([{ t: 'open', model: 'a/one' }, { t: 'error', message: 'busy', status: 429 }]))

    const reply = await askTutor(request, () => {})

    expect(reply.failed).toBe(true)
    expect(reply.text).toMatch(/busy/i)
  })

  it('ignores a kind it does not know', async () => {
    // A relay that learns to say something new must not break an old client.
    answering(streamed([{ t: 'weather', v: 'sunny' }, ...written]))

    const reply = await askTutor(request, () => {})

    expect(reply.text).toBe('Jung meant the unconscious.')
  })
})
