/**
 * The picker's judgment, under test.
 *
 * The two cases that matter most are the two that were met for real against a
 * live roster: a coding agent and a safety classifier, both free, both
 * tool-capable, both happy to answer a reading question in the wrong genre.
 * They are named here so a future loosening of the filter fails loudly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ASSUMED_SIZE,
  chainFrom,
  chosenFrom,
  fitForReading,
  forgetModels,
  loadModels,
  offerable,
  PREFERRED_MODEL,
  rememberPick,
  sizeOf,
  storedPick,
  type TutorModel,
} from './models.ts'

function model(over: Partial<TutorModel> = {}): TutorModel {
  return {
    id: 'vendor/general-1:free',
    name: 'General 1',
    description: 'A general instruction-tuned model.',
    contextLength: 131_072,
    ...over,
  }
}

vi.mock('../storage/cloud/client.ts', () => ({
  accessToken: () => Promise.resolve('token'),
}))

describe('fitForReading', () => {
  it('keeps a general instruction-tuned model', () => {
    expect(fitForReading(model())).toBe(true)
  })

  it('drops a coding agent', () => {
    expect(
      fitForReading(
        model({
          id: 'cohere/north-mini-code:free',
          name: 'North Mini Code',
          description: 'A fast coding agent for repository-scale tasks.',
        }),
      ),
    ).toBe(false)
  })

  it('drops a safety classifier', () => {
    expect(
      fitForReading(
        model({
          id: 'nvidia/nemotron-3.5-content-safety:free',
          name: 'Nemotron 3.5 Content Safety',
          description: 'Classifies prompts and responses as safe or unsafe.',
        }),
      ),
    ).toBe(false)
  })

  it('drops a model too small to hold a passage and a thread', () => {
    expect(fitForReading(model({ contextLength: 8_192 }))).toBe(false)
  })

  it('keeps a model that reports no context length', () => {
    // Unknown is not the same as small. Reporting nothing is common, and
    // hiding on a missing field would empty the roster.
    expect(fitForReading(model({ contextLength: 0 }))).toBe(true)
  })

  it('keeps the paid row whatever it says about itself', () => {
    expect(fitForReading(model({ paid: true, contextLength: 0, description: 'moderation' }))).toBe(
      true,
    )
  })
})

describe('offerable', () => {
  it('puts the paid model first and keeps roster order after it', () => {
    const rows = [
      model({ id: 'a:free', name: 'A' }),
      model({ id: 'claude', name: 'Claude', paid: true }),
      model({ id: 'b:free', name: 'B' }),
    ]
    expect(offerable(rows).map((row) => row.id)).toEqual(['claude', 'a:free', 'b:free'])
  })

  it('removes the narrow models before ordering', () => {
    const rows = [model({ id: 'guard:free', description: 'A guard model.' }), model({ id: 'a:free' })]
    expect(offerable(rows).map((row) => row.id)).toEqual(['a:free'])
  })
})

describe('chosenFrom', () => {
  const rows = [model({ id: 'a:free' }), model({ id: PREFERRED_MODEL }), model({ id: 'b:free' })]

  it('honours a stored pick that is still listed', () => {
    expect(chosenFrom(rows, 'b:free')).toBe('b:free')
  })

  it('ignores a stored pick that has been delisted', () => {
    // The point of the whole function: a delisted favourite would otherwise
    // fail every request until the reader changed a setting they forgot making.
    expect(chosenFrom(rows, 'gone:free')).toBe(PREFERRED_MODEL)
  })

  it('falls back to the preferred model when nothing is stored', () => {
    expect(chosenFrom(rows, null)).toBe(PREFERRED_MODEL)
  })

  it('falls back to the first row when the preferred model is gone', () => {
    expect(chosenFrom([model({ id: 'a:free' })], null)).toBe('a:free')
  })

  it('picks nothing from an empty roster', () => {
    expect(chosenFrom([], null)).toBeUndefined()
  })
})

describe('the stored pick', () => {
  it('comes back after it is remembered', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })
    rememberPick('b:free')
    expect(storedPick()).toBe('b:free')
    vi.unstubAllGlobals()
  })

  it('reports nothing rather than throwing when storage is refused', () => {
    // Private browsing. A forgotten preference must not stop the lamp opening.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => rememberPick('b:free')).not.toThrow()
    expect(storedPick()).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('loadModels', () => {
  beforeEach(() => {
    forgetModels()
    vi.unstubAllGlobals()
  })

  it('filters the roster it is handed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              models: [model({ id: 'guard:free', description: 'moderation' }), model({ id: 'a:free' })],
            }),
            { status: 200 },
          ),
        ),
      ),
    )
    expect((await loadModels()).map((row) => row.id)).toEqual(['a:free'])
  })

  it('asks once and keeps the answer for the session', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ models: [model()] }), { status: 200 })),
    )
    vi.stubGlobal('fetch', fetch)
    await loadModels()
    await loadModels()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects rather than reporting an empty roster', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 502 }))))
    await expect(loadModels()).rejects.toThrow()
  })

  it('does not cache a failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [model()] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(loadModels()).rejects.toThrow()
    expect((await loadModels()).length).toBe(1)
  })
})

describe('sizeOf', () => {
  it('reads the parameter count out of the model name', () => {
    expect(sizeOf(model({ id: 'qwen/qwen3-8b:free', name: 'Qwen3 8B' }))).toBe(8)
  })

  it('takes the total of a mixture-of-experts model, not the active part', () => {
    // `120b-a12b` means 120 billion parameters of which 12 billion run per
    // token. The 120 is the one that tracks how much the model has read.
    const nemotron = model({
      id: 'nvidia/nemotron-3-super-120b-a12b:free',
      name: 'Nemotron 3 Super 120B A12B',
    })
    expect(sizeOf(nemotron)).toBe(120)
  })

  it('reads a fractional size', () => {
    expect(sizeOf(model({ id: 'vendor/small-1.5b:free', name: 'Small 1.5B' }))).toBe(1.5)
  })

  it('says nothing when the name states no size', () => {
    expect(sizeOf(model({ id: 'z-ai/glm-5.2:free', name: 'GLM 5.2' }))).toBe(0)
  })

  it('does not mistake a context window for a parameter count', () => {
    // "128k context" and "2M tokens" are not sizes. Only a bare `b` counts.
    const wordy = model({ id: 'vendor/talker:free', name: 'Talker 128k 2M 1.5B' })
    expect(sizeOf(wordy)).toBe(1.5)
  })
})

describe('offerable, ordered', () => {
  it('puts the larger model first', () => {
    const rows = [
      model({ id: 'a/small-8b:free', name: 'Small 8B' }),
      model({ id: 'a/large-120b:free', name: 'Large 120B' }),
    ]
    expect(offerable(rows).map((row) => row.id)).toEqual(['a/large-120b:free', 'a/small-8b:free'])
  })

  it('puts a paid model above every free one', () => {
    const rows = [
      model({ id: 'a/large-400b:free', name: 'Large 400B' }),
      model({ id: 'anthropic/claude', name: 'Claude', paid: true }),
    ]
    expect(offerable(rows)[0]?.id).toBe('anthropic/claude')
  })

  it('sorts a model that states no size as if it were average', () => {
    const rows = [
      model({ id: 'a/tiny-8b:free', name: 'Tiny 8B' }),
      model({ id: 'a/quiet:free', name: 'Quiet' }),
      model({ id: 'a/huge-400b:free', name: 'Huge 400B' }),
    ]
    // Between the two, because ASSUMED_SIZE sits between 8 and 400.
    expect(ASSUMED_SIZE).toBeGreaterThan(8)
    expect(ASSUMED_SIZE).toBeLessThan(400)
    expect(offerable(rows).map((row) => row.id)).toEqual([
      'a/huge-400b:free',
      'a/quiet:free',
      'a/tiny-8b:free',
    ])
  })

  it('keeps the roster order between models of the same size', () => {
    const rows = [
      model({ id: 'a/first-70b:free', name: 'First 70B' }),
      model({ id: 'a/second-70b:free', name: 'Second 70B' }),
    ]
    expect(offerable(rows).map((row) => row.id)).toEqual(['a/first-70b:free', 'a/second-70b:free'])
  })
})

describe('chainFrom', () => {
  const roster = [
    model({ id: 'a/small-8b:free', name: 'Small 8B' }),
    model({ id: 'a/huge-400b:free', name: 'Huge 400B' }),
    model({ id: 'a/large-120b:free', name: 'Large 120B' }),
    model({ id: 'a/mid-70b:free', name: 'Mid 70B' }),
  ]

  it('leads with the reader pick', () => {
    expect(chainFrom(roster, 'a/small-8b:free')[0]).toBe('a/small-8b:free')
  })

  it('falls back to the largest models, not to an arbitrary list', () => {
    // The complaint that started this: the pick refused and the question went
    // to whatever slug the server happened to name second.
    expect(chainFrom(roster, 'a/small-8b:free')).toEqual([
      'a/small-8b:free',
      'a/huge-400b:free',
      'a/large-120b:free',
    ])
  })

  it('never repeats the pick inside the chain', () => {
    const chain = chainFrom(roster, 'a/huge-400b:free')
    expect(chain).toEqual(['a/huge-400b:free', 'a/large-120b:free', 'a/mid-70b:free'])
  })

  it('starts at the strongest when the reader has picked nothing', () => {
    expect(chainFrom(roster, undefined)[0]).toBe('a/huge-400b:free')
  })

  it('stops at three, because OpenRouter refuses a longer chain', () => {
    expect(chainFrom(roster, 'a/small-8b:free').length).toBe(3)
  })

  it('leaves out a model the picker would hide', () => {
    const rows = [...roster, model({ id: 'x/guard:free', name: 'Guard', description: 'A safety classifier.' })]
    expect(chainFrom(rows, undefined)).not.toContain('x/guard:free')
  })
})
