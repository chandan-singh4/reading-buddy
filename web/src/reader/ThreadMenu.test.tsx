// @vitest-environment jsdom
//
// The menu a held conversation mark raises. Small, but it is the only place in
// the app where a conversation can be destroyed from the page — so "delete
// reports the right thread" and "a stray tap does not delete anything" are
// both worth holding down.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThreadMenu } from './ThreadMenu.tsx'

afterEach(cleanup)

function open(at = { x: 100, y: 100 }) {
  const onContinue = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(
    <ThreadMenu
      excerpt="Entropy always rises."
      at={at}
      onContinue={onContinue}
      onDelete={onDelete}
      onClose={onClose}
    />,
  )
  return { onContinue, onDelete, onClose }
}

describe('the held-mark menu', () => {
  it('names the passage it is about', () => {
    open()
    expect(screen.getByText('“Entropy always rises.”')).toBeTruthy()
  })

  it('offers continuing and deleting, and nothing else', () => {
    open()
    const labels = screen.getAllByRole('button').map((button) => button.textContent)
    expect(labels).toEqual(['Continue the conversation', 'Delete the conversation'])
  })

  it('continues the conversation', () => {
    const { onContinue, onDelete } = open()
    fireEvent.click(screen.getByText('Continue the conversation'))
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes the conversation', () => {
    const { onDelete, onContinue } = open()
    fireEvent.click(screen.getByText('Delete the conversation'))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('closes on a tap outside, and deletes nothing', () => {
    const { onClose, onDelete } = open()
    const backdrop = document.querySelector('[aria-hidden="true"]')
    fireEvent.pointerDown(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('sits below the finger in the top half of the screen', () => {
    open({ x: 100, y: 100 })
    const menu = screen.getByRole('dialog') as HTMLElement
    expect(menu.style.top).toBe('116px')
    expect(menu.style.bottom).toBe('')
  })

  it('flips above the finger in the bottom half, so it is not under the hand', () => {
    // jsdom reports 768 high, so anything past 384 is the lower half.
    open({ x: 100, y: 700 })
    const menu = screen.getByRole('dialog') as HTMLElement
    expect(menu.style.bottom).toBe('84px')
    expect(menu.style.top).toBe('')
  })

  it('keeps clear of the screen edges', () => {
    open({ x: 2, y: 100 })
    const menu = screen.getByRole('dialog') as HTMLElement
    expect(menu.style.left).toBe('100px')
  })
})
