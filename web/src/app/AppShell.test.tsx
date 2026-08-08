// @vitest-environment jsdom
//
// Component tests need a DOM; the pure unit tests elsewhere stay on the faster
// node environment. fake-indexeddb must load first — Library reads through the
// real repository, so there has to be a real database underneath it.
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../App.tsx'
import { forgetScrollMemory } from './scrollMemory.ts'
import { forgetTabHistory } from './tabHistory.ts'

afterEach(cleanup)

// Module-level by design — see `tabHistory.ts`; cleared so one case's history
// memory cannot answer the next case's assertions.
beforeEach(forgetTabHistory)

// Also module-level, and for the same reason: it has to outlive `AppShell`,
// which unmounts whenever a book is open. One case's remembered position must
// not decide the next one's.
beforeEach(forgetScrollMemory)

// The Reader scrolls to the top of each new section. jsdom has no layout, so
// its `scrollTo` exists only to complain — stubbed rather than left to warn.
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/**
 * The device's Back button, as something a test can press.
 *
 * There is no way to observe a history *stack* from the outside — `useLocation`
 * only ever reports the top of it. So the way to ask "did that swipe leave an
 * entry behind?" is to go back once and see where you land: if the four screens
 * push, Back undoes the last swipe; if they replace, Back leaves the level
 * altogether. Rendered as a sibling of the app so it survives every navigation.
 */
function Back() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      device back
    </button>
  )
}

function renderFrom(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <AppRoutes />
      <Back />
    </MemoryRouter>,
  )
}

describe('app shell', () => {
  it('lands on Home and reports an empty shelf', async () => {
    renderAt('/')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
    // Resolves only once the repository has actually answered.
    expect(await screen.findByText('No books yet')).toBeDefined()
  })

  it('opens the drawer from the hamburger and offers all four destinations', () => {
    renderAt('/')

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toBeDefined()
    // Home is in the drawer now. It was left out when swiping didn't exist and
    // Home was simply the screen the ☰ sat on; once Home became one page among
    // four, "swipe right three times" stopped being a way back to it.
    expect(screen.getByRole('link', { name: /Home/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Library/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Stats/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Settings/ })).toBeDefined()
  })

  /**
   * A swipe, as the sequence a real finger produces: down, a run of moves, then
   * an end.
   *
   * The moves are not decoration. A browser seizes a pan gesture and fires
   * `pointercancel` after a few pixels, so `pointerup` often never arrives and
   * its coordinates are worthless when it does — the hook reads the *last move*
   * instead. An earlier version of both the hook and this helper measured the
   * distance at `pointerup` only, which is why the feature passed its tests and
   * did nothing at all on a phone. Ending on `pointercancel` is therefore the
   * case worth covering, not an edge case.
   *
   * `pointerType: 'touch'` matters too — a mouse drag across a page is a text
   * selection, and hijacking it would make the library impossible to select
   * text on, so the hook ignores the mouse entirely.
   */
  function swipe(dx: number, dy = 0, end: 'up' | 'cancel' = 'up') {
    const at = (fraction: number) => ({
      pointerId: 1,
      pointerType: 'touch' as const,
      clientX: 200 + dx * fraction,
      clientY: 300 + dy * fraction,
    })

    fireEvent.pointerDown(document, at(0))
    fireEvent.pointerMove(document, at(0.5))
    fireEvent.pointerMove(document, at(1))
    // A cancel carries stale coordinates — the browser is reporting where it
    // seized the gesture, not where the finger got to. Reading the event
    // itself, rather than the last move, is precisely the bug being guarded.
    if (end === 'cancel') fireEvent.pointerCancel(document, at(0))
    else fireEvent.pointerUp(document, at(1))
  }

  it('swipes left from Home to the library, and right back again', async () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)

    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeDefined()

    swipe(150)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('does not swipe past the ends', async () => {
    // A list that loops has no edges, and an edge is how a reader learns where
    // they are.
    renderAt('/')

    swipe(150)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('ignores a swipe that was really a scroll', async () => {
    // A finger arcs. Without a ratio guard, flicking down a long shelf with a
    // slightly curved movement navigates away from it.
    renderAt('/')

    swipe(-150, 300)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('ignores a movement too short to be a swipe', () => {
    renderAt('/')

    swipe(-20)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('still navigates when the browser cancels the gesture', async () => {
    // The bug that shipped: a browser takes a pan over and fires
    // `pointercancel` instead of `pointerup`, so a handler that only measured
    // at `pointerup` measured nothing. On a phone this meant swiping did
    // absolutely nothing, while the tests stayed green.
    renderAt('/')

    swipe(-150, 0, 'cancel')
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeDefined()
  })

  /** Did the app leave? MemoryRouter has nowhere to go, so it sits still. */
  const stillOn = (name: RegExp | string) =>
    typeof name === 'string'
      ? screen.getByRole('heading', { name })
      : screen.getByRole('heading', { level: 1 })

  it('retraces exactly one tab move on Back, then leaves', async () => {
    // Stated by the reader in as many words: "Home - Library - Stats. Then
    // swiping back should take me to Library, and then another swipe out of
    // the app." Both halves matter, and the two earlier attempts each got one
    // of them: pushing every move retraced correctly but took a press per swipe
    // to escape; replacing every move left immediately but retraced to whatever
    // the level was entered on — Home, from wherever the reader actually was.
    renderFrom(['/'])

    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeDefined()
    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()

    // One: the tab actually visited before this one.
    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeDefined()

    // Two: out. Not Home, which is where the reader started but not where they
    // were. MemoryRouter cannot leave, so "out" shows as the app standing still
    // on the screen it was already on.
    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    await Promise.resolve()
    expect(stillOn('Library')).toBeDefined()
  })

  it('retraces the last move however much swiping came before it', async () => {
    // The retrace is one *move*, not one entry out of a growing pile — the pile
    // is what made Back feel like rewinding. Four moves in, Back still means
    // "the screen I was just looking at".
    renderFrom(['/'])

    swipe(-150)
    swipe(-150)
    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()
    swipe(150)
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    await Promise.resolve()
    expect(stillOn('Settings')).toBeDefined()
  })

  it('leaves the four screens for whatever was there before them', async () => {
    // Retracing one tab move must not cost the reader the way out. Here Home
    // was reached from a book, so Back retraces the swipe to Home and the press
    // after it returns to the book — never a loop around the four screens.
    renderFrom(['/book/does-not-exist', '/'])

    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toMatch(/^Good /)

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('moves the drawer through exactly the same history as a swipe', async () => {
    // One move by two routes. If they disagreed, Back would depend on which the
    // reader had happened to reach for.
    renderFrom(['/'])

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Settings/ }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Stats/ }))
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()

    // Back to Settings — the screen before this one — not to Home.
    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    await Promise.resolve()
    expect(stillOn('Settings')).toBeDefined()
  })

  it('retraces a swipe made after a drawer tap, and the other way round', async () => {
    renderFrom(['/'])

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Stats/ }))
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()

    swipe(-150)
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'device back' }))
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeDefined()
  })


  it('ignores a drag that starts inside the drawer', () => {
    // The drawer is a panel over the page, not part of it; dragging across its
    // links must not navigate the page underneath.
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    const drawer = screen.getByRole('navigation', { name: 'Main' })
    fireEvent.pointerDown(drawer, { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 300 })
    fireEvent.pointerMove(document, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 300 })
    fireEvent.pointerUp(document, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 300 })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })

  it('closes the drawer on Escape', () => {

    renderAt('/')

    const trigger = screen.getByRole('button', { name: 'Open menu' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('has no bottom tab bar', () => {
    renderAt('/')

    // The drawer is the only navigation landmark, and it starts closed.
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
  })

  it('renders Settings on its route', () => {
    renderAt('/settings')

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined()
  })

  it('renders the full catalogue at /library', async () => {
    renderAt('/library')

    expect(screen.getByRole('heading', { name: 'Library' })).toBeDefined()
    expect(await screen.findByText('No books yet')).toBeDefined()
  })

  it('renders Stats on its route', () => {
    renderAt('/stats')

    expect(screen.getByRole('heading', { name: 'Stats' })).toBeDefined()
  })

  it('renders the Reader full-bleed, outside the shell', async () => {
    renderAt('/book/does-not-exist')

    // No tab bar while reading — that is the point of the route sitting
    // outside AppShell.
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(await screen.findByRole('alert')).toBeDefined()
  })

  it('falls back to Home for an unknown route', () => {
    renderAt('/nowhere')

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /)
  })
})

/**
 * The crossing between two tabs, which needs the Web Animations API to happen
 * at all — and jsdom has none.
 *
 * That absence is not a detail. Without a stub, `AppShell` correctly declines to
 * animate, the outgoing screen is never revealed, and every assertion below
 * would pass against code that does nothing. So `animate` is stubbed with
 * something that records what it was asked to play and hands back a promise the
 * test controls. What is being checked is the *shape* of the move — which layer
 * fades, which layer is on top, and that the outgoing one is put away again —
 * none of which needs a real animation, and all of which has been got wrong here
 * before.
 */
/**
 * Each screen keeping its own place in the document.
 *
 * ## What jsdom can and cannot say about this
 *
 * It has no layout, so it cannot reproduce the actual fault — nothing here is
 * ever tall enough for a browser to clamp `scrollY` against, which is the
 * mechanism (`scrollMemory.ts` sets it out). What it *can* pin down is the rule
 * that fixes it, and that rule is a bookkeeping one: **the offset restored on
 * arrival is the one that screen was left at, and never the other screen's.**
 * That is the part a future change would break by accident, and it is exactly
 * the part the shipped bug got wrong — two pages sharing one number.
 *
 * The layout half of it is verified on the reader's phone or not at all, which
 * is this project's standing conclusion about anything to do with scrolling.
 */
describe('each screen keeps its own scroll position', () => {
  /** Where the shell has asked the window to go, oldest first. */
  function scrolls(): number[] {
    const calls = vi.mocked(window.scrollTo).mock.calls
    return calls.map((call) => (typeof call[1] === 'number' ? call[1] : 0))
  }

  /**
   * Scroll the window as a finger would, and let the shell notice.
   *
   * The `pointerdown` is not decoration. A reader's scroll always begins with a
   * touch, and the shell now uses exactly that to tell a scroll the reader asked
   * for from the tail of a fling arriving from the screen they have just left —
   * see `settling` in `AppShell.tsx`. A bare `scroll` event with no touch in
   * front of it *is* the fling, which `carries no momentum onto the next screen`
   * below relies on.
   */
  function scrollTo(offset: number) {
    fireEvent.pointerDown(window)
    drift(offset)
  }

  /** A scroll with no finger behind it — momentum, or the browser clamping. */
  function drift(offset: number) {
    Object.defineProperty(window, 'scrollY', { value: offset, configurable: true })
    fireEvent.scroll(window)
  }

  beforeEach(() => {
    vi.mocked(window.scrollTo).mockClear()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('brings Library back to where it was left', async () => {
    renderAt('/')
    await screen.findByText('No books yet')

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())

    scrollTo(1200)

    // Back to Home, which was at the top and must arrive at the top.
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Home/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /))

    expect(scrolls().at(-1)).toBe(0)

    // And back to Library, which must arrive where it was left — not at the
    // top, and not at Home's position.
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())

    expect(scrolls().at(-1)).toBe(1200)
  })

  it('does not let one screen inherit the other screen\u2019s position', async () => {
    // The shipped bug, stated as a rule. Both screens scrolled, to different
    // places; each must get its own number back.
    renderAt('/')
    await screen.findByText('No books yet')
    scrollTo(300)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())
    scrollTo(1200)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Home/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /))

    expect(scrolls().at(-1)).toBe(300)
  })

  it('starts a screen it has never been to at the top', async () => {
    renderAt('/')
    await screen.findByText('No books yet')
    scrollTo(500)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Settings/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy())

    // Not 500. Arriving somewhere new part-way down is the fault, not the fix.
    expect(scrolls().at(-1)).toBe(0)
  })

  /**
   * The reader's report, in the order they gave it: *scroll all the way down*,
   * come back, and Home is at the bottom.
   *
   * Flicking a shelf to its end hands the scroll to the browser's momentum, and
   * momentum outlives the tab change — so `scroll` events from Library go on
   * arriving after Home is the screen on show. Two things must not happen: the
   * page must not be carried away, and Home's *memory* must not be written with
   * Library's number, which is what made this survive every later visit.
   */
  it('carries no momentum onto the next screen', async () => {
    renderAt('/')
    await screen.findByText('No books yet')

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())

    scrollTo(4000)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Home/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /))

    expect(scrolls().at(-1)).toBe(0)

    // The fling, still going, with no finger behind it.
    vi.mocked(window.scrollTo).mockClear()
    drift(3800)
    drift(3600)

    // Put back, both times, rather than merely ignored.
    expect(scrolls()).toEqual([0, 0])

    // And Home's memory is untouched by any of it: leaving and returning must
    // still be the top. This is the assertion that would have caught the
    // shipped fault, which was sticky rather than momentary.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Home/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /))

    expect(scrolls().at(-1)).toBe(0)
  })

  it('lets the reader scroll the moment they arrive', async () => {
    // The defence above must not become a 700 ms window in which the app
    // ignores its reader. A touch ends it immediately, whenever it comes.
    renderAt('/')
    await screen.findByText('No books yet')

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())

    // Straight away, with a finger: their scroll, and it must be remembered.
    scrollTo(900)

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Home/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good /))
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    fireEvent.click(screen.getByRole('link', { name: /Library/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy())

    expect(scrolls().at(-1)).toBe(900)
  })
})

describe('crossing between two tabs', () => {
  interface Played {
    node: HTMLElement
    frames: Keyframe[]
    finish: () => void
  }

  let played: Played[] = []
  let original: typeof Element.prototype.animate | undefined

  beforeEach(() => {
    played = []
    original = Element.prototype.animate
    Element.prototype.animate = function (this: HTMLElement, frames: unknown): Animation {
      let settle = () => {}
      const finished = new Promise<void>((resolve) => {
        settle = resolve
      })
      played.push({
        node: this,
        frames: (frames as Keyframe[]) ?? [],
        finish: settle,
      })
      return { finished, cancel: settle } as unknown as Animation
    } as typeof Element.prototype.animate
  })

  afterEach(() => {
    if (original) Element.prototype.animate = original
  })

  function pageFor(path: string): HTMLElement {
    const node = document.querySelector<HTMLElement>(`[data-path="${path}"]`)
    if (!node) throw new Error(`no screen rendered for ${path}`)
    return node
  }

  function swipeLeft() {
    const at = (fraction: number) => ({
      pointerId: 1,
      pointerType: 'touch' as const,
      clientX: 200 - 150 * fraction,
      clientY: 300,
    })
    fireEvent.pointerDown(document, at(0))
    fireEvent.pointerMove(document, at(0.5))
    fireEvent.pointerMove(document, at(1))
    fireEvent.pointerUp(document, at(1))
  }

  it('keeps the screen being left on show, and only it fades', async () => {
    renderAt('/')
    expect(await screen.findByText('Pick up where you left off.')).toBeDefined()

    swipeLeft()
    await screen.findByRole('heading', { name: 'Library' })

    // Both screens are on screen at once. That is the whole change: the shelf
    // used to be gone in the frame the library started moving, which reads as a
    // cut with a movement stuck on the end of it.
    const going = pageFor('/')
    const arriving = pageFor('/library')
    expect(going.hidden).toBe(false)
    expect(arriving.hidden).toBe(false)

    // …but the reader has been moved on, so the one that is leaving must not be
    // reachable by a screen reader or by the tab key.
    expect(going.getAttribute('aria-hidden')).toBe('true')
    expect(going.hasAttribute('inert')).toBe(true)

    const fade = (node: HTMLElement) =>
      played.find((play) => play.node === node)?.frames.some((frame) => 'opacity' in frame)

    /*
     * The load-bearing assertion, and the one this file exists for.
     *
     * Both screens are transparent, so whichever layer fades must be the upper
     * one with something opaque underneath it — otherwise the page background
     * shows through the seam and every swipe flashes. That fault has now been
     * shipped four times in this app under four different descriptions. The
     * rule is written out in `AppShell.module.css`; this is the rule as a test.
     */
    expect(fade(going)).toBe(true)
    expect(fade(arriving)).toBe(false)
  })

  it('puts the screen being left away once it has gone', async () => {
    renderAt('/')
    expect(await screen.findByText('Pick up where you left off.')).toBeDefined()

    swipeLeft()
    await screen.findByRole('heading', { name: 'Library' })
    expect(pageFor('/').hidden).toBe(false)

    // The animation ending is what hides it again. A screen left visible would
    // sit over the one the reader actually asked for — the failure mode of
    // driving this from state rather than from the animation's own promise.
    for (const play of played) play.finish()
    await waitFor(() => {
      expect(pageFor('/').hidden).toBe(true)
    })
    expect(pageFor('/library').hidden).toBe(false)
  })
})
