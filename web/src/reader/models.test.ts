/**
 * The picker's judgment, under test.
 *
 * The two cases that matter most are the two that were met for real against a
 * live roster: a coding agent and a safety classifier, both free, both
 * tool-capable, both happy to answer a reading question in the wrong genre.
 * They are named here so a future loosening of the filter fails loudly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  arrange,
  arrangementOf,
  ASSUMED_SIZE,
  anySees,
  chainFrom,
  stepsFrom,
  chosenFrom,
  fitForReading,
  forgetModels,
  lastRoster,
  loadModels,
  offerable,
  PREFERRED_MODEL,
  rememberArrangement,
  rememberPick,
  sizeOf,
  storedArrangement,
  storedPick,
  type Column,
  type Provider,
  type TutorModel,
} from './models.ts'

function model(over: Partial<TutorModel> = {}): TutorModel {
  return {
    id: 'vendor/general-1:free',
    name: 'General 1',
    description: 'A general instruction-tuned model.',
    contextLength: 131_072,
    source: 'openrouter',
    ...over,
  }
}

/** One column, already ranked. The grid the reader would see. */
function column(source: Provider, models: TutorModel[]): Column {
  return { source, models }
}

/** The whole roster laid out with no saved arrangement — the default grid. */
function grid(rows: TutorModel[]): Column[] {
  return arrange(rows)
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
  const columns = grid([
    model({ id: 'a:free' }),
    model({ id: PREFERRED_MODEL, source: 'gemini' }),
    model({ id: 'b:free' }),
  ])

  it('honours a stored pick that is still listed', () => {
    expect(chosenFrom(columns, 'b:free')).toBe('b:free')
  })

  it('ignores a stored pick that has been delisted', () => {
    // The point of the whole function: a delisted favourite would otherwise
    // fail every request until the reader changed a setting they forgot making.
    expect(chosenFrom(columns, 'gone:free')).toBe(PREFERRED_MODEL)
  })

  it('falls back to the preferred model when nothing is stored', () => {
    expect(chosenFrom(columns, null)).toBe(PREFERRED_MODEL)
  })

  it('falls back to the top-left model when the preferred one is gone', () => {
    expect(chosenFrom(grid([model({ id: 'a:free' })]), null)).toBe('a:free')
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

describe('the roster kept between launches', () => {
  /*
   * The reader's report: for the first three or four seconds of a new
   * conversation the model and effort controls are simply not there. The
   * roster is fetched behind a sign-in, and the picker was drawn only once it
   * landed — so the lamp opened without its controls and they appeared later,
   * moving everything under the reader's thumb.
   */

  // This file runs without a browser, so storage is a Map behind the same two
  // methods the code calls.
  let store: Map<string, string>

  beforeEach(() => {
    forgetModels()
    vi.unstubAllGlobals()
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('remembers the roster it fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ models: [model()] }), { status: 200 })),
      ),
    )
    await loadModels()
    expect(lastRoster().map((row) => row.id)).toEqual(['vendor/general-1:free'])
  })

  it('reports nothing on a first ever run', () => {
    // No roster, no picker — which is the behaviour the lamp already had.
    expect(lastRoster()).toEqual([])
  })

  it('reports nothing rather than throwing on damaged storage', () => {
    store.set('reading-buddy:tutor-roster', 'not json at all')
    expect(lastRoster()).toEqual([])
  })

  it('drops a remembered row that is not a model', () => {
    store.set('reading-buddy:tutor-roster', JSON.stringify([{ name: 'no id' }, null, 7]))
    expect(lastRoster()).toEqual([])
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
  /*
   * Three providers, two models each, deliberately arranged so that "strongest
   * overall" and "across the columns" give different answers. That difference
   * is the whole behaviour under test.
   */
  const columns = [
    column('gemini', [
      model({ id: 'g/1', name: 'G1', source: 'gemini' }),
      model({ id: 'g/2', name: 'G2', source: 'gemini' }),
    ]),
    column('openrouter', [model({ id: 'o/1', name: 'O1' }), model({ id: 'o/2', name: 'O2' })]),
    column('groq', [
      model({ id: 'q/1', name: 'Q1', source: 'groq' }),
      model({ id: 'q/2', name: 'Q2', source: 'groq' }),
    ]),
  ]

  const ids = (pick?: string) => chainFrom(columns, pick).map((row) => row.id)

  it('leads with the reader pick', () => {
    expect(ids('g/1')[0]).toBe('g/1')
  })

  it('falls across the providers rather than down one column', () => {
    /*
     * The reader described exactly this: pick Google's best, and if it will not
     * answer, go to OpenRouter's best, then Groq's best, and only then come
     * back for Google's second.
     *
     * It is also the safer order. A provider that is rate-limited is
     * rate-limited for its whole column, so a chain that walks down one column
     * can burn every rung on one bad minute at one company.
     */
    expect(ids('g/1')).toEqual(['g/1', 'o/1', 'q/1', 'g/2', 'o/2', 'q/2'])
  })

  it('starts the rotation after the picked column, not back at the left', () => {
    expect(ids('o/1').slice(0, 3)).toEqual(['o/1', 'q/1', 'g/1'])
  })

  it('never repeats the pick inside the chain', () => {
    const chain = ids('g/2')
    expect(chain[0]).toBe('g/2')
    expect(chain.filter((id) => id === 'g/2')).toHaveLength(1)
  })

  it('starts at the top left when the reader has picked nothing', () => {
    expect(ids(undefined)).toEqual(['g/1', 'o/1', 'q/1', 'g/2', 'o/2', 'q/2'])
  })

  it('stops at six', () => {
    const wide = columns.map((entry) => ({
      ...entry,
      models: [...entry.models, model({ id: entry.source + '/3', source: entry.source })],
    }))
    expect(chainFrom(wide, 'g/1')).toHaveLength(6)
  })

  it('copes with columns of different depths', () => {
    // A provider with one usable model must not leave a hole in the rotation,
    // nor cut the chain short while another column still has models.
    const ragged = [
      column('gemini', [model({ id: 'g/1', source: 'gemini' })]),
      column('groq', [
        model({ id: 'q/1', source: 'groq' }),
        model({ id: 'q/2', source: 'groq' }),
      ]),
    ]
    expect(chainFrom(ragged, 'g/1').map((row) => row.id)).toEqual(['g/1', 'q/1', 'q/2'])
  })

  it('leaves out a model the picker would hide', () => {
    const rows = [
      model({ id: 'a/mid-70b:free' }),
      model({ id: 'x/guard:free', name: 'Guard', description: 'A safety classifier.' }),
    ]
    expect(chainFrom(grid(rows), undefined).map((row) => row.id)).not.toContain('x/guard:free')
  })
})

describe('arrange', () => {
  const rows = [
    model({ id: 'g/small-8b', name: 'Small 8B', source: 'gemini' }),
    model({ id: 'g/huge-400b', name: 'Huge 400B', source: 'gemini' }),
    model({ id: 'o/mid-70b', name: 'Mid 70B' }),
    model({ id: 'q/large-120b', name: 'Large 120B', source: 'groq' }),
  ]

  it('groups the roster into one column per provider', () => {
    expect(arrange(rows).map((entry) => entry.source)).toEqual(['gemini', 'openrouter', 'groq'])
  })

  it('ranks the strongest first inside each column', () => {
    const [google] = arrange(rows)
    expect(google.models.map((row) => row.id)).toEqual(['g/huge-400b', 'g/small-8b'])
  })

  it('drops a column no provider serves today', () => {
    // Two keys out of three is a normal deployment, not a fault. An empty
    // column would read as "Groq has no models", which is a different claim.
    expect(arrange([model({ id: 'o/a' })]).map((entry) => entry.source)).toEqual(['openrouter'])
  })

  it('honours the column order the reader chose', () => {
    const order = { columns: ['groq', 'gemini', 'openrouter'] as Provider[], rows: {} }
    expect(arrange(rows, order).map((entry) => entry.source)).toEqual([
      'groq',
      'gemini',
      'openrouter',
    ])
  })

  it('honours the ranking the reader chose inside a column', () => {
    const order = { columns: ['gemini'] as Provider[], rows: { gemini: ['g/small-8b'] } }
    const [google] = arrange(rows, order)
    expect(google.models.map((row) => row.id)).toEqual(['g/small-8b', 'g/huge-400b'])
  })

  it('keeps a new model below what the reader ranked, never above it', () => {
    /*
     * The rule that lets a saved arrangement survive a churning roster. The
     * reader promoted an 8B over a 400B, which is an opinion about those two
     * models and not about a 900B that appears next week. Sorting the newcomer
     * in by strength would silently undo their choice.
     */
    const order = { columns: ['gemini'] as Provider[], rows: { gemini: ['g/small-8b'] } }
    const later = [...rows, model({ id: 'g/giant-900b', name: 'Giant 900B', source: 'gemini' })]
    const [google] = arrange(later, order)
    expect(google.models.map((row) => row.id)).toEqual([
      'g/small-8b',
      'g/giant-900b',
      'g/huge-400b',
    ])
  })

  it('forgets a ranked model that has been delisted', () => {
    const order = { columns: ['gemini'] as Provider[], rows: { gemini: ['g/gone', 'g/small-8b'] } }
    const [google] = arrange(rows, order)
    expect(google.models.map((row) => row.id)).toEqual(['g/small-8b', 'g/huge-400b'])
  })

  it('appends a provider the saved arrangement never heard of', () => {
    // What happens the first time a fourth provider is added. It must not need
    // a migration, and it must not vanish.
    const order = { columns: ['groq'] as Provider[], rows: {} }
    expect(arrange(rows, order).map((entry) => entry.source)).toEqual([
      'groq',
      'gemini',
      'openrouter',
    ])
  })
})

describe('a busy model', () => {
  it('sinks below every model that answers', () => {
    const rows = [
      model({ id: 'a/huge-400b', name: 'Huge 400B', busy: true }),
      model({ id: 'a/small-8b', name: 'Small 8B' }),
    ]
    // A 400B that will not answer is worth less to the reader than an 8B that
    // will. Burying it is the reason it was kept rather than dropped.
    expect(offerable(rows).map((row) => row.id)).toEqual(['a/small-8b', 'a/huge-400b'])
  })

  it('is still offered, because one refusal is not proof of death', () => {
    /*
     * Measured, not assumed. Probing the same 56 models twice, minutes apart,
     * disagreed on three of them. Deleting on a single failure would have
     * thrown away three good models for being busy in the second we asked.
     */
    expect(offerable([model({ id: 'a/glm', name: 'GLM', busy: true })])).toHaveLength(1)
  })
})

describe('the stored arrangement', () => {
  /* Same scratch store as the stored pick above: the suite runs in node, where
     there is no `localStorage` to borrow. */
  function scratch(seed?: string) {
    const store = new Map<string, string>()
    if (seed !== undefined) store.set('reading-buddy:tutor-order', seed)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('comes back after it is remembered', () => {
    scratch()
    const order = {
      columns: ['groq', 'gemini', 'openrouter'] as Provider[],
      rows: { groq: ['q/1'] },
    }
    rememberArrangement(order)
    expect(storedArrangement()).toEqual(order)
  })

  it('falls back to the shipped order when nothing is stored', () => {
    scratch()
    expect(storedArrangement().columns).toEqual(['gemini', 'openrouter', 'groq'])
  })

  it('survives a corrupted entry', () => {
    // The one stored value that is a structure rather than a string, so a
    // half-written entry is possible, and the cost of trusting one is a picker
    // that throws the moment it opens.
    scratch('{ not json')
    expect(storedArrangement().columns).toEqual(['gemini', 'openrouter', 'groq'])
  })

  it('ignores a provider it does not know', () => {
    scratch(JSON.stringify({ columns: ['groq', 'made-up'], rows: {} }))
    expect(storedArrangement().columns).toEqual(['groq'])
  })

  it('round-trips the grid the reader is looking at', () => {
    const roster = [model({ id: 'o/a' }), model({ id: 'g/a', source: 'gemini' })]
    const columns = arrange(roster)
    expect(arrange(roster, arrangementOf(columns))).toEqual(columns)
  })
})

describe('a chain for a question that carries a picture', () => {
  const seeing = [
    column('gemini', [
      model({ id: 'g/blind', source: 'gemini' }),
      model({ id: 'g/sees', source: 'gemini', sees: true }),
    ]),
    column('openrouter', [
      model({ id: 'o/sees', sees: true }),
      model({ id: 'o/blind' }),
    ]),
  ]

  it('keeps only the models that can see', () => {
    const ids = chainFrom(seeing, undefined, true).map((row) => row.id)
    expect(ids).toEqual(['g/sees', 'o/sees'])
  })

  it('keeps every model when no picture is being sent', () => {
    const ids = chainFrom(seeing, undefined).map((row) => row.id)
    expect(ids).toContain('g/blind')
  })

  it('drops a blind pick rather than leading with it', () => {
    const ids = chainFrom(seeing, 'g/blind', true).map((row) => row.id)
    expect(ids).not.toContain('g/blind')
    expect(ids[0]).toBe('g/sees')
  })

  it('leads with a seeing pick, as it does for text', () => {
    expect(chainFrom(seeing, 'o/sees', true).map((row) => row.id)[0]).toBe('o/sees')
  })

  it('is empty when nothing on the roster can see', () => {
    const blind = [column('gemini', [model({ id: 'g/blind', source: 'gemini' })])]
    expect(chainFrom(blind, undefined, true)).toEqual([])
  })

  it('carries the flag through stepsFrom', () => {
    expect(stepsFrom(seeing, undefined, true).map((step) => step.id)).toEqual(['g/sees', 'o/sees'])
  })
})

describe('anySees', () => {
  it('is true when one model on the roster can read a picture', () => {
    expect(anySees([column('openrouter', [model({ sees: true })])])).toBe(true)
  })

  it('is false for a roster of text-only models', () => {
    expect(anySees([column('openrouter', [model()])])).toBe(false)
  })

  it('is false for an empty roster', () => {
    expect(anySees([])).toBe(false)
  })
})
