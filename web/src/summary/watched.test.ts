import { describe, expect, it, vi } from 'vitest'

import { Refusal, watched } from './engine.ts'

/**
 * A relay stream, written as the lines the relay actually sends.
 *
 * One JSON object per line. The chunking is deliberate in one case below: a
 * line split across two reads is the ordinary state of a network, not an edge.
 */
function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function line(piece: unknown): string {
  return `${JSON.stringify(piece)}\n`
}

describe('reading a summary as the relay sends it', () => {
  it('reports the recap growing, not the JSON around it', async () => {
    const seen: string[] = []
    const answer = await watched(
      stream(
        line({ t: 'open', model: 'a/one' }),
        line({ t: 'text', d: '{"recap": "Jung' }),
        line({ t: 'text', d: ' reads a dream."}' }),
        line({ t: 'done', reply: { text: '{"recap": "Jung reads a dream."}', model: 'a/one' } }),
      ),
      (soFar) => seen.push(soFar),
    )

    expect(seen).toEqual(['', 'Jung', 'Jung reads a dream.'])
    expect(answer.model).toBe('a/one')
  })

  it('starts again when the relay moves to another model', async () => {
    /*
     * The fault the reader reported: a free rung hits its rate limit while it
     * is generating, and the relay now starts again on the next one. Two halves
     * of two JSON objects welded together is not an answer, so the first half
     * goes when the second model opens.
     */
    const seen: string[] = []
    const answer = await watched(
      stream(
        line({ t: 'open', model: 'a/busy' }),
        line({ t: 'text', d: '{"recap": "Half a sen' }),
        line({ t: 'open', model: 'b/willing' }),
        line({ t: 'text', d: '{"recap": "A whole one."}' }),
        line({ t: 'done', reply: { text: '{"recap": "A whole one."}', model: 'b/willing' } }),
      ),
      (soFar) => seen.push(soFar),
    )

    // Cleared back to nothing when the second model opened, then written again.
    expect(seen).toEqual(['', 'Half a sen', '', 'A whole one.'])
    expect(answer.text).toBe('{"recap": "A whole one."}')
    expect(answer.model).toBe('b/willing')
  })

  it('throws the relay’s own words when every model has refused', async () => {
    // "The free model is busy" says what to do next. "The relay answered 429"
    // does not, and the reader should never be shown it.
    await expect(
      watched(
        stream(
          line({ t: 'open', model: 'a/busy' }),
          line({ t: 'error', message: 'The free model is busy right now.', status: 429 }),
        ),
        vi.fn(),
      ),
    ).rejects.toBeInstanceOf(Refusal)
  })

  it('reads a line that arrived split across two reads', async () => {
    const whole = line({ t: 'text', d: '{"recap": "Split."}' })
    const cut = Math.floor(whole.length / 2)
    const answer = await watched(stream(whole.slice(0, cut), whole.slice(cut)), vi.fn())
    expect(answer.text).toBe('{"recap": "Split."}')
  })
})
