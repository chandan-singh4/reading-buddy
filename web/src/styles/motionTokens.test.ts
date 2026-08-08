/**
 * The motion tokens, guarded.
 *
 * `theme.css` argues that the app should have one tempo rather than ten, and
 * the CSS mostly enforces that by construction — a rule reading
 * `var(--motion-ui)` cannot drift from one reading `var(--motion-ui)`.
 *
 * Two things escape that, and this file is about them.
 *
 * The first is `AppShell.tsx`, which drives the tab slide through the Web
 * Animations API. WAAPI takes numbers and strings, not custom properties, so
 * the duration and curve are written there as literals. That is exactly the
 * arrangement the app has already been bitten by twice — the slide sitting at
 * 300 against the drawer's 320, and `transitions.css` claiming for months to
 * match a `MOVE_MS` it was 20 ms away from. Both were comments asserting a
 * relationship that nothing checked. This checks it.
 *
 * The second is the launch screen, whose fade lives inline in `index.html`
 * (it has to paint before any stylesheet) and is *also* stated as a number in
 * `app/splash.ts`, which removes the element when the fade ends. Those two
 * being different is not a cosmetic bug: too short and the splash is deleted
 * mid-fade, too long and a dead overlay sits over the app.
 *
 * Reading the files as text is crude and is the point — it is the only way to
 * compare a value in a stylesheet with a value in a module, and a crude test
 * that catches a real drift beats an elegant one that cannot see across the
 * boundary.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const theme = read('./theme.css')

function token(name: string): string {
  const found = new RegExp(`--${name}:\\s*([^;]+);`).exec(theme)
  if (!found) throw new Error(`theme.css no longer declares --${name}`)
  return found[1]!.trim()
}

describe('the motion tokens', () => {
  it('declares exactly the three durations the app is allowed to use', () => {
    // Not a style rule for its own sake. The whole argument in `theme.css` is
    // that a reader can learn three speeds and cannot learn seven, so a fourth
    // being added quietly is the thing worth noticing.
    expect(token('motion-micro')).toBe('140ms')
    expect(token('motion-ui')).toBe('240ms')
    expect(token('motion-screen')).toBe('300ms')
  })

  it('keeps them in the bands they were specified against', () => {
    const ms = (name: string) => Number.parseInt(token(name), 10)
    // Micro: attached to a finger. UI: something arriving. Screen: a change of
    // scene. Overlapping ranges, deliberately — the bands are about intent.
    expect(ms('motion-micro')).toBeGreaterThanOrEqual(100)
    expect(ms('motion-micro')).toBeLessThanOrEqual(180)
    expect(ms('motion-ui')).toBeGreaterThanOrEqual(180)
    expect(ms('motion-ui')).toBeLessThanOrEqual(300)
    expect(ms('motion-screen')).toBeGreaterThanOrEqual(250)
    expect(ms('motion-screen')).toBeLessThanOrEqual(350)
  })

  it('orders them: a press is quicker than a panel, a panel quicker than a screen', () => {
    const ms = (name: string) => Number.parseInt(token(name), 10)
    expect(ms('motion-micro')).toBeLessThan(ms('motion-ui'))
    expect(ms('motion-ui')).toBeLessThan(ms('motion-screen'))
  })
})

describe('the timings written outside the stylesheet', () => {
  it("times the tab slide exactly as the token does, not 'very nearly'", () => {
    const shell = read('../app/AppShell.tsx')
    const slide = /const SLIDE_MS = (\d+)/.exec(shell)
    expect(slide, 'AppShell.tsx no longer declares SLIDE_MS').not.toBeNull()
    expect(`${slide![1]}ms`).toBe(token('motion-screen'))
  })

  it('gives the tab slide the same curve as everything else that crosses the screen', () => {
    const shell = read('../app/AppShell.tsx')
    const easing = /const SLIDE_EASING = '([^']+)'/.exec(shell)
    expect(easing, 'AppShell.tsx no longer declares SLIDE_EASING').not.toBeNull()
    expect(easing![1]).toBe(token('ease-emphasis'))
  })

  it('removes the launch screen only once its fade has finished', () => {
    // `splash.ts` waits `FADE_MS` and then removes the element; `index.html`
    // owns the transition it is waiting on. Removing early would cut the fade
    // off part-way, which is the abrupt launch this work set out to fix.
    const splash = read('../app/splash.ts')
    const fade = /const FADE_MS = (\d+)/.exec(splash)
    expect(fade, 'splash.ts no longer declares FADE_MS').not.toBeNull()

    const html = read('../../index.html')
    const inline = /#splash\s*\{[\s\S]*?transition:\s*([\s\S]*?);/.exec(html)
    expect(inline, 'index.html no longer transitions #splash').not.toBeNull()
    expect(inline![1]).toContain(`${fade![1]}ms`)
  })

  it('takes the launch screen away at screen-transition speed', () => {
    // Arriving at the shelf from a cold start and arriving at it from a book
    // are the same event to the eye; timing them differently is a seam.
    const splash = read('../app/splash.ts')
    const fade = /const FADE_MS = (\d+)/.exec(splash)
    expect(`${fade![1]}ms`).toBe(token('motion-screen'))
  })
})
