// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AppRoutes } from '../App.tsx'

afterEach(cleanup)

function open(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('the Commonplace Book', () => {
  it('opens on a heading and gathers its passages from every book', async () => {
    open('/commonplace')

    expect(
      await screen.findByRole('heading', { name: 'prospective function of dreams' }),
    ).toBeTruthy()
    // The count is the claim the page makes about itself, so it is worth
    // asserting rather than trusting.
    await waitFor(() => expect(screen.getByText(/2 passages/)).toBeTruthy())
    expect(screen.getByText(/gathered from 2 books/)).toBeTruthy()
    expect(screen.getByText('Memories, Dreams, Reflections')).toBeTruthy()
    expect(screen.getByText('Why We Sleep')).toBeTruthy()
  })

  it('never shows a passage whose concept is still a candidate', async () => {
    // The rule that separates the two lenses. This text exists in the fixture
    // and belongs to the pending item, so finding it anywhere on this page
    // means a candidate has been filed under a heading it has not earned.
    open('/commonplace')
    await screen.findByRole('heading', { name: 'prospective function of dreams' })
    expect(screen.queryByText(/hindsight reading pattern into coincidence/)).toBeNull()
    expect(screen.queryByText('survivorship in dream interpretation')).toBeNull()
  })

  it('opens the heading named in the URL', async () => {
    // How a chip in the Chapter View arrives here.
    open('/commonplace?concept=the%20unconscious')
    expect(await screen.findByRole('heading', { name: 'the unconscious' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/1 passage\b/)).toBeTruthy())
  })

  it('switches the gathered passages when a heading in the rail is tapped', async () => {
    open('/commonplace')
    await screen.findByRole('heading', { name: 'prospective function of dreams' })

    fireEvent.click(screen.getByRole('button', { name: 'the unconscious' }))

    expect(await screen.findByRole('heading', { name: 'the unconscious' })).toBeTruthy()
    expect(screen.getByText(/storage closet/)).toBeTruthy()
  })

  it('says so plainly when a heading holds nothing yet', async () => {
    // Six of the seven headings are empty. That is the normal state of a
    // growing vocabulary, so it must not read as an error.
    open('/commonplace?concept=individuation')
    expect(await screen.findByText(/No passages yet/)).toBeTruthy()
    expect(screen.getByText(/nothing has been filed under it/i)).toBeTruthy()
  })

  it('renders emphasis inside a claim as emphasis, not as characters', async () => {
    open('/commonplace')
    const forward = await screen.findByText('forward')
    expect(forward.tagName).toBe('EM')
  })

  it('keeps Veda quiet until there is a seam to point at', async () => {
    // She speaks under the two-book heading, and nowhere else.
    open('/commonplace')
    expect(await screen.findByText(/circling the same idea from opposite ends/)).toBeTruthy()

    cleanup()
    open('/commonplace?concept=the%20unconscious')
    await screen.findByRole('heading', { name: 'the unconscious' })
    expect(screen.queryByText(/circling the same idea/)).toBeNull()
  })

  it('offers a way back to wherever the reader came from', async () => {
    open('/commonplace?from=%2Fbook%2Fabc%2Finfo')
    const back = await screen.findByRole('link', { name: /Book details/ })
    expect(back.getAttribute('href')).toBe('/book/abc/info')
  })
})
