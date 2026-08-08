// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `splash.ts` records the launch time and whether it has already run in module
 * scope — both are per-page-load facts, and neither should be resettable by
 * anything but a new page load. So every test loads a fresh copy rather than
 * reaching in to reset them.
 */
async function loadSplash() {
  vi.resetModules()
  return import('./splash.ts')
}

function putSplashOnThePage(): HTMLElement {
  document.body.innerHTML = '<div id="root"></div><div id="splash">Reading Buddy</div>'
  return document.getElementById('splash')!
}

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom has no real frame loop. Running the callback immediately is the
  // honest stand-in: it says "the paint happened", which is exactly the event
  // the double rAF is waiting for.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('dismissing the launch screen', () => {
  it('takes the splash off the page once the app has painted', async () => {
    const splash = putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    dismissSplash()
    vi.advanceTimersByTime(2000)

    expect(document.getElementById('splash')).toBeNull()
    expect(splash.isConnected).toBe(false)
  })

  it('marks it as leaving before removing it, so the fade has something to run on', async () => {
    const splash = putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    dismissSplash()
    // Past the minimum it stays visible, but not yet past the fade.
    vi.advanceTimersByTime(300)

    expect(splash.dataset.leaving).toBe('true')
    expect(splash.isConnected).toBe(true)
  })

  it('does not flicker: a launch that is ready instantly still shows the mark', async () => {
    // The failure this rules out is the splash appearing and vanishing inside a
    // couple of frames, which reads as the screen glitching rather than as the
    // app starting.
    const splash = putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    dismissSplash()
    vi.advanceTimersByTime(100)

    expect(splash.dataset.leaving).toBeUndefined()
    expect(splash.isConnected).toBe(true)
  })

  it('never holds a slow launch back once it is finally ready', async () => {
    // The mirror of the test above, and the more important one: the minimum is
    // a floor on a *short* life, never an extra wait added to a long one.
    const splash = putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    // A boot that took a second and a half. By the time the app is ready the
    // splash has long outstayed the minimum, so it should start leaving on the
    // very next frame rather than waiting again.
    vi.advanceTimersByTime(1500)
    dismissSplash()

    expect(splash.dataset.leaving).toBe('true')
  })

  it('ignores a second call rather than restarting the fade', async () => {
    const splash = putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    dismissSplash()
    vi.advanceTimersByTime(2000)
    // The `index.html` watchdog fires on a timer regardless, so a double call
    // is expected rather than exceptional.
    expect(() => dismissSplash()).not.toThrow()
    expect(splash.isConnected).toBe(false)
  })

  it('survives the watchdog having already removed it', async () => {
    putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    document.getElementById('splash')!.remove()

    expect(() => dismissSplash()).not.toThrow()
  })

  it('still clears the splash where there are no animation frames to wait for', async () => {
    // A backgrounded tab may never run a frame callback. The launch screen must
    // not be able to outlive the app because of it.
    vi.stubGlobal('requestAnimationFrame', undefined)
    putSplashOnThePage()
    const { dismissSplash } = await loadSplash()

    dismissSplash()

    expect(document.getElementById('splash')).toBeNull()
  })
})
