/**
 * Telling a swipe from a scroll, a tap, or an unsteady thumb. All the
 * difficulty of a gesture is in this judgement, so it is tested directly.
 */

import { describe, expect, it } from 'vitest'

import { stepThrough, swipeOf } from './swipe.ts'

const from = { x: 200, y: 300 }

describe('recognising a swipe', () => {
  it('reads a clear sideways drag', () => {
    expect(swipeOf(from, { x: 100, y: 305 })).toBe('left')
    expect(swipeOf(from, { x: 300, y: 295 })).toBe('right')
  })

  it('ignores a short one', () => {
    // A tap with a wobble. Treating this as navigation makes an app feel like
    // it moves on its own.
    expect(swipeOf(from, { x: 180, y: 300 })).toBeNull()
  })

  it('ignores a scroll that drifts sideways', () => {
    expect(swipeOf(from, { x: 140, y: 500 })).toBeNull()
  })

  it('allows the arc a real thumb makes', () => {
    // Fingers travel in curves; demanding a straight line rejects most genuine
    // swipes.
    expect(swipeOf(from, { x: 100, y: 340 })).toBe('left')
  })

  it('ignores a finger that did not move', () => {
    expect(swipeOf(from, from)).toBeNull()
  })
})

describe('stepping through a row', () => {
  const tabs = ['contents', 'bookmarks', 'notes'] as const

  it('moves forward on a leftward swipe', () => {
    expect(stepThrough(tabs, 'contents', 'left')).toBe('bookmarks')
    expect(stepThrough(tabs, 'bookmarks', 'right')).toBe('contents')
  })

  it('stops at the ends rather than wrapping', () => {
    // The row visibly doesn't loop, so wrapping would contradict what the eye
    // just saw.
    expect(stepThrough(tabs, 'notes', 'left')).toBe('notes')
    expect(stepThrough(tabs, 'contents', 'right')).toBe('contents')
  })

  it('does nothing when there was no swipe', () => {
    expect(stepThrough(tabs, 'bookmarks', null)).toBe('bookmarks')
  })
})
