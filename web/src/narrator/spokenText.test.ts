import { describe, expect, it } from 'vitest'

import { spokenText } from './spokenText.ts'

describe('marks that cannot be pronounced', () => {
  it('drops emphasis and keeps the words', () => {
    expect(spokenText('The **shadow** is not the *anima*.')).toBe(
      'The shadow is not the anima.',
    )
  })

  it('drops the hashes from a heading', () => {
    expect(spokenText('## What the chapter turns on')).toBe('What the chapter turns on.')
  })

  it('drops a bullet but keeps its line', () => {
    expect(spokenText('- One thing\n- Another thing')).toBe('One thing. Another thing.')
  })

  it('reads a link by its name, never its address', () => {
    // A URL read out is a minute of punctuation.
    expect(spokenText('See [the appendix](https://example.com/a/b?c=1) for more.')).toBe(
      'See the appendix for more.',
    )
  })

  it('keeps the words inside inline code', () => {
    // `anima` is a word Veda means to say, not a symbol.
    expect(spokenText('The term `anima` is Latin.')).toBe('The term anima is Latin.')
  })
})

describe('what is left out', () => {
  it('says nothing of a code block', () => {
    expect(spokenText('Before.\n\n```\nconst x = 1\n```\n\nAfter.')).toBe('Before. After.')
  })

  it('says nothing of a table', () => {
    const text = 'Look:\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nDone.'
    expect(spokenText(text)).toBe('Look: Done.')
  })

  it('says nothing of an image', () => {
    expect(spokenText('Here ![a plate of the mandala](plate.png) it is.')).toBe('Here it is.')
  })
})

describe('giving the ear what the eye gets from a line break', () => {
  it('ends a heading so it is not glued to the sentence after it', () => {
    /*
     * The regression this guards. The sentence splitter cuts on terminal
     * punctuation. Without a stop, a heading and the paragraph under it are one
     * utterance, said in one breath, with no pause where the page has a gap.
     */
    expect(spokenText('# Symbols\n\nA symbol points past what it names.')).toBe(
      'Symbols. A symbol points past what it names.',
    )
  })

  it('does not add a second stop to a line that has one', () => {
    expect(spokenText('One.\nTwo!')).toBe('One. Two!')
  })

  it('leaves a colon alone, because it is already a pause', () => {
    expect(spokenText('Three of them:\nThe first.')).toBe('Three of them: The first.')
  })
})

describe('nothing to say', () => {
  it('comes back empty when there were only marks', () => {
    expect(spokenText('---')).toBe('')
    expect(spokenText('   ')).toBe('')
  })
})
