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

import { dictationSupported, joinSaid, transcriptOf, useDictation } from './dictation.ts'

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
function heard(...chunks: string[]) {
  return { results: chunks.map((transcript) => [{ transcript }]) }
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

describe('transcriptOf', () => {
  it('joins every chunk, not only the newest', () => {
    expect(transcriptOf(heard('what does ', 'this word mean'))).toBe('what does this word mean')
  })

  it('takes the first alternative and ignores the rest', () => {
    const event = { results: [[{ transcript: 'Nietzsche' }, { transcript: 'niche' }]] }
    expect(transcriptOf(event)).toBe('Nietzsche')
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
    act(() => last?.onresult?.(heard('what does niche')))
    act(() => last?.onresult?.(heard('what does Nietzsche mean')))

    expect(onText.mock.calls.map((call) => call[0])).toEqual([
      'So what does niche',
      'So what does Nietzsche mean',
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
