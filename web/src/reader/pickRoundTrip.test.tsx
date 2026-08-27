// @vitest-environment jsdom
//
// A line picked out of a real answer, and saved.
//
// The tests in `pickMarkdown.test.ts` build the HTML by hand, which proves the
// serializer reads what it is given. It does not prove that what the renderer
// draws is what the serializer expects. The reader reported twice that a saved
// line still arrived flat, so this walks the whole road: markdown in, drawn as
// Veda draws it, picked, written back out.

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Markdown } from './markdown.tsx'
import { markdownOfRange } from './pickMarkdown.ts'

/** Everything inside a drawn answer, written back as markdown. */
function roundTrip(text: string): string {
  const { container } = render(<Markdown text={text} />)
  const range = document.createRange()
  range.selectNodeContents(container.firstElementChild ?? container)
  return markdownOfRange(range)
}

describe('picking a whole answer and saving it', () => {
  it('keeps a numbered list with bold lead-ins', () => {
    const said = [
      '1. **Experiences → Unconscious:** Everything you perceive.',
      '2. **Unconscious → Perception:** Later, that material *reaches back up*.',
    ].join('\n')

    expect(roundTrip(said)).toBe(
      [
        '1. **Experiences → Unconscious:** Everything you perceive.',
        '2. **Unconscious → Perception:** Later, that material _reaches back up_.',
      ].join('\n\n'),
    )
  })

  it('keeps a heading, a bold line and bullets apart', () => {
    const said = [
      '## A feedback loop',
      '',
      "**So it's not A or B.**",
      '',
      '- You are not the sole author of your life.',
      '- You are the editor.',
    ].join('\n')

    expect(roundTrip(said)).toBe(
      [
        '## A feedback loop',
        "**So it's not A or B.**",
        '- You are not the sole author of your life.',
        '- You are the editor.',
      ].join('\n\n'),
    )
  })
})

describe('the range a finger actually builds', () => {
  /*
   * The long press does not select nodes. It flattens the answer to one string,
   * finds the character the finger is over, and builds a range between two text
   * offsets — `flatten` plus `rangeOfSpan`, the same pair the book uses. That is
   * a different shape of range from `selectNodeContents`, and it is the only
   * shape a phone ever produces. The tests above never exercised it.
   */
  it('keeps the marks when the range runs between two text offsets', async () => {
    const { flatten, rangeOfSpan } = await import('./selection.ts')

    const said = [
      '1. **Experiences → Unconscious:** Everything you perceive.',
      '2. **Unconscious → Perception:** Later, that material *reaches back up*.',
    ].join('\n')

    const { container } = render(<Markdown text={said} />)
    const root = container.firstElementChild as HTMLElement
    const { flat, from } = flatten(root)
    const range = rangeOfSpan(from, 0, flat.length)!

    expect(markdownOfRange(range)).toBe(
      [
        '1. **Experiences → Unconscious:** Everything you perceive.',
        '2. **Unconscious → Perception:** Later, that material _reaches back up_.',
      ].join('\n\n'),
    )
  })
})
