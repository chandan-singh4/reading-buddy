// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { rememberSummaryPick, storedSummaryPick } from '../reader/models.ts'

/*
 * The summary model is remembered apart from Veda's.
 *
 * They are different jobs. The lamp answers a reader mid-paragraph, where speed
 * is most of the experience. A summary runs in the background, once per
 * chapter, with nobody waiting on it — so the reader should be free to spend
 * the slower, stronger model there and a quick one in the lamp. One shared
 * setting would force one compromise on both.
 */

beforeEach(() => {
  localStorage.clear()
})

describe('the model that writes summaries', () => {
  it('starts unset, which means "follow Veda"', () => {
    expect(storedSummaryPick()).toBeNull()
  })

  it('remembers a choice across a reload', () => {
    rememberSummaryPick('z-ai/glm-5.2:free')
    expect(storedSummaryPick()).toBe('z-ai/glm-5.2:free')
  })

  it('goes back to following Veda when the choice is cleared', () => {
    rememberSummaryPick('z-ai/glm-5.2:free')
    rememberSummaryPick(undefined)
    expect(storedSummaryPick()).toBeNull()
  })

  it('does not disturb the lamp', () => {
    localStorage.setItem('reading-buddy:tutor-model', 'the-lamps-model')
    rememberSummaryPick('a-different-model')
    expect(localStorage.getItem('reading-buddy:tutor-model')).toBe('the-lamps-model')
  })
})
