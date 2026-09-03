// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acquireNarrator, releaseNarrator, resetNarrator } from './shared.ts'

/**
 * One narrator, however many screens can speak.
 *
 * This is worth a test rather than a comment because the cost of getting it
 * wrong is invisible in every way a developer looks at it. Four engines behave
 * exactly like one — the buttons work, the audio is right, the tests pass — and
 * the only symptom is four workers holding four copies of an 86 MB model on a
 * phone.
 */

let made = 0
let terminated = 0

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor() {
    made += 1
  }
  postMessage() {}
  terminate() {
    terminated += 1
  }
}

beforeEach(() => {
  made = 0
  terminated = 0
  vi.stubGlobal('Worker', FakeWorker)
  resetNarrator()
})

afterEach(() => {
  resetNarrator()
  vi.unstubAllGlobals()
})

describe('sharing the narrator', () => {
  it('hands the same engine to every holder', () => {
    expect(acquireNarrator()).toBe(acquireNarrator())
  })

  it('starts no worker merely by being taken', () => {
    // Holding the narrator must cost nothing. A reader who opens a book and
    // never presses play downloads no model and starts no thread.
    acquireNarrator()
    expect(made).toBe(0)
  })

  it('keeps the model while anything still holds it', () => {
    const engine = acquireNarrator()
    acquireNarrator()
    engine.wake()

    releaseNarrator()

    expect(terminated).toBe(0)
    // And it is still the same engine, so the model does not reload.
    expect(acquireNarrator()).toBe(engine)
  })

  it('gives the model back when the last holder goes', () => {
    acquireNarrator().wake()
    expect(made).toBe(1)

    releaseNarrator()

    expect(terminated).toBe(1)
  })

  it('makes a fresh engine after the last holder has gone', () => {
    const first = acquireNarrator()
    first.wake()
    releaseNarrator()

    expect(acquireNarrator()).not.toBe(first)
  })

  it('does not go below zero when released too often', () => {
    // Defensive, and the reason is StrictMode: an effect's cleanup can run more
    // than once, and a count that goes negative would keep the model alive for
    // the life of the tab.
    acquireNarrator().wake()
    releaseNarrator()
    releaseNarrator()
    releaseNarrator()

    // A fresh holder still gets a working engine afterwards, and releasing it
    // still gives the model back exactly once.
    acquireNarrator().wake()
    releaseNarrator()

    expect(made).toBe(2)
    expect(terminated).toBe(2)
  })
})
