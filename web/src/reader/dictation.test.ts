// @vitest-environment jsdom

/**
 * Dictation, under test.
 *
 * The browser's recogniser is replaced by a fake that the test drives by hand:
 * there is no microphone in a test runner, and the parts worth proving are the
 * ones around the API rather than inside it — that an unsupported browser draws
 * nothing, that interim words are corrected in place instead of being typed
 * twice, and that a run ends when it should.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { dictationSupported, heardIn, joinSaid, useDictation } from './dictation.ts'

interface Fake {
  started: number
  stopped: number
  aborted: number
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

let last: Fake | undefined

function fakeRecogniser() {
  class Machine {
    started = 0
    stopped = 0
    aborted = 0
    continuous = false
    interimResults = false
    lang = ''
    onresult = null
    onerror = null
    onend = null
    constructor() {
      last = this as unknown as Fake
    }
    start() {
      this.started += 1
    }
    stop() {
      this.stopped += 1
    }
    abort() {
      this.aborted += 1
    }
  }
  vi.stubGlobal('SpeechRecognition', Machine)
}

/** What the API hands back: chunks, each with alternatives. */
/*
 * One `onresult` event.
 *
 * A chunk written as `'the words'` is still being revised; one written as
 * `['the words']` is finished and will not be sent again. `from` is the
 * recogniser's `resultIndex` — where this event's new chunks start.
 */
function heard(chunks: (string | string[])[], from = 0) {
  return {
    resultIndex: from,
    results: chunks.map((chunk) => {
      const final = Array.isArray(chunk)
      const said = final ? chunk[0]! : chunk
      return Object.assign([{ transcript: said }], { isFinal: final })
    }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  last = undefined
})

describe('joinSaid', () => {
  it('starts an empty box with no leading space', () => {
    expect(joinSaid('', 'what does this mean')).toBe('what does this mean')
  })

  it('puts one space between what was typed and what was said', () => {
    expect(joinSaid('So ', 'what does this mean')).toBe('So what does this mean')
  })

  it('leaves the box alone when nothing was heard yet', () => {
    expect(joinSaid('half a question ', '')).toBe('half a question ')
  })
})

describe('heardIn', () => {
  it('separates the settled words from the guess at the tail', () => {
    const event = heard([['what does '], 'this word mean'])
    expect(heardIn(event)).toEqual({ settled: 'what does ', pending: 'this word mean' })
  })

  it('reads only from where this event begins', () => {
    /*
     * The reader's bug: every word typed twice.
     *
     * Safari re-delivers chunks it has already finished, so a reader that adds
     * up the whole list types those words again. `resultIndex` says where the
     * new ones start, and everything before it is already in the box.
     */
    const event = heard([['what does '], ['Nietzsche '], 'mean'], 2)
    expect(heardIn(event)).toEqual({ settled: '', pending: 'mean' })
  })

  it('takes the first alternative and ignores the rest', () => {
    const event = {
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: 'Nietzsche' }, { transcript: 'niche' }], { isFinal: true }),
      ],
    }
    expect(heardIn(event).settled).toBe('Nietzsche')
  })
})

describe('dictationSupported', () => {
  it('is false on a browser without the API', () => {
    expect(dictationSupported()).toBe(false)
  })

  it('is true on one with the prefixed name', () => {
    vi.stubGlobal('webkitSpeechRecognition', class {})
    expect(dictationSupported()).toBe(true)
  })
})

describe('useDictation', () => {
  function lamp(base = '') {
    const onText = vi.fn()
    const view = renderHook(() => useDictation({ baseText: () => base, onText }))
    return { onText, view }
  }

  it('reports nothing to draw where the browser has no API', () => {
    expect(lamp().view.result.current.supported).toBe(false)
  })

  it('starts listening on the first tap and stops on the second', () => {
    fakeRecogniser()
    const { view } = lamp()

    act(() => view.result.current.toggle())
    expect(view.result.current.listening).toBe(true)
    expect(last?.started).toBe(1)
    // Words must keep arriving while the reader speaks, and arrive early
    // enough to be seen.
    expect(last?.continuous).toBe(true)
    expect(last?.interimResults).toBe(true)

    act(() => view.result.current.toggle())
    expect(view.result.current.listening).toBe(false)
    expect(last?.stopped).toBe(1)
  })

  it('corrects an interim guess in place rather than typing it twice', () => {
    fakeRecogniser()
    const { view, onText } = lamp('So ')

    act(() => view.result.current.toggle())
    act(() => last?.onresult?.(heard(['what does niche'])))
    act(() => last?.onresult?.(heard(['what does Nietzsche mean'])))

    expect(onText.mock.calls.map((call) => call[0])).toEqual([
      'So what does niche',
      'So what does Nietzsche mean',
    ])
  })

  it('does not type a word twice when the phone sends it twice', () => {
    /*
     * The reader's own report, and the reason they went back to the keyboard's
     * microphone: every word appeared twice.
     *
     * Safari settles a chunk, then keeps handing it back at the front of the
     * list on later events. Adding the list up types it again. What is drawn
     * here is one settled chunk, then a second event that re-delivers it and
     * adds a new one.
     */
    fakeRecogniser()
    const { view, onText } = lamp('')

    act(() => view.result.current.toggle())
    act(() => last?.onresult?.(heard([['what does ']])))
    // Chunk 0 again, plus chunk 1. `resultIndex` says only chunk 1 is new.
    act(() => last?.onresult?.(heard([['what does '], ['Nietzsche mean']], 1)))

    expect(onText.mock.calls.map((call) => call[0])).toEqual([
      'what does',
      'what does Nietzsche mean',
    ])
  })

  it('keeps the words it already settled when the tail is revised', () => {
    // The other half of the same rule: a settled chunk must survive every later
    // event, and only the unfinished tail may be redrawn.
    fakeRecogniser()
    const { view, onText } = lamp('')

    act(() => view.result.current.toggle())
    act(() => last?.onresult?.(heard([['what does '], 'niche'])))
    act(() => last?.onresult?.(heard([['what does '], 'Nietzsche mean'], 1)))

    expect(onText.mock.calls.map((call) => call[0])).toEqual([
      'what does niche',
      'what does Nietzsche mean',
    ])
  })

  it('stops listening when the browser refuses the microphone', () => {
    fakeRecogniser()
    const { view } = lamp()

    act(() => view.result.current.toggle())
    act(() => last?.onerror?.())

    expect(view.result.current.listening).toBe(false)
  })

  it('stops listening when the recogniser ends on its own', () => {
    fakeRecogniser()
    const { view } = lamp()

    act(() => view.result.current.toggle())
    act(() => last?.onend?.())

    expect(view.result.current.listening).toBe(false)
  })

  it('closes the microphone when the lamp closes', () => {
    fakeRecogniser()
    const { view } = lamp()

    act(() => view.result.current.toggle())
    view.unmount()

    expect(last?.aborted).toBe(1)
  })
})
