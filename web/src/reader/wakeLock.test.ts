import { describe, expect, it, vi } from 'vitest'

import { keepScreenAwake, type VisibilityCapable, type WakeLockLike } from './wakeLock.ts'

/** A document whose visibility a test can change, and then announce. */
function fakeDocument(visibilityState = 'visible') {
  const listeners = new Set<() => void>()
  const doc: VisibilityCapable & { show(): void; hide(): void } = {
    visibilityState,
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    show() {
      doc.visibilityState = 'visible'
      listeners.forEach((listener) => listener())
    },
    hide() {
      doc.visibilityState = 'hidden'
      listeners.forEach((listener) => listener())
    },
  }
  return doc
}

/** A wake lock API that counts its requests and hands back releasable locks. */
function fakeWakeLock() {
  const released: WakeLockLike[] = []
  const granted: WakeLockLike[] = []
  return {
    granted,
    released,
    api: {
      wakeLock: {
        request: vi.fn(async () => {
          const lock = { release: vi.fn(async () => void released.push(lock)) }
          granted.push(lock)
          return lock
        }),
      },
    },
  }
}

describe('keepScreenAwake', () => {
  it('takes a lock when a book opens', async () => {
    const lock = fakeWakeLock()
    keepScreenAwake(lock.api, fakeDocument())
    await vi.waitFor(() => expect(lock.granted).toHaveLength(1))
  })

  it('releases the lock when the book closes', async () => {
    const lock = fakeWakeLock()
    const stop = keepScreenAwake(lock.api, fakeDocument())
    await vi.waitFor(() => expect(lock.granted).toHaveLength(1))
    stop()
    await vi.waitFor(() => expect(lock.released).toHaveLength(1))
  })

  /*
   * The one that matters. The browser drops the lock when the page hides and
   * does not give it back, so a single request at open stops working after the
   * reader's first interruption.
   */
  it('takes the lock again when the reader comes back', async () => {
    const lock = fakeWakeLock()
    const doc = fakeDocument()
    keepScreenAwake(lock.api, doc)
    await vi.waitFor(() => expect(lock.granted).toHaveLength(1))

    doc.hide()
    doc.show()

    await vi.waitFor(() => expect(lock.granted).toHaveLength(2))
  })

  it('does not ask for a lock while the page is hidden', async () => {
    const lock = fakeWakeLock()
    const doc = fakeDocument()
    keepScreenAwake(lock.api, doc)
    await vi.waitFor(() => expect(lock.granted).toHaveLength(1))

    doc.hide()

    expect(lock.api.wakeLock.request).toHaveBeenCalledTimes(1)
  })

  /* The reader can close the book before the request settles. A lock that
   * arrives after that has nobody left to release it. */
  it('releases a lock that arrives after the book closed', async () => {
    const lock = fakeWakeLock()
    const stop = keepScreenAwake(lock.api, fakeDocument())
    stop()
    await vi.waitFor(() => expect(lock.released).toHaveLength(1))
  })

  it('does nothing, and does not throw, where the API is missing', () => {
    const stop = keepScreenAwake({}, fakeDocument())
    expect(() => stop()).not.toThrow()
  })

  it('survives a browser that offers the API and then refuses it', async () => {
    const api = { wakeLock: { request: vi.fn(async () => Promise.reject(new Error('denied'))) } }
    const stop = keepScreenAwake(api, fakeDocument())
    await vi.waitFor(() => expect(api.wakeLock.request).toHaveBeenCalled())
    expect(() => stop()).not.toThrow()
  })
})
