import { describe, expect, it } from 'vitest'

import { recapSoFar } from './streaming.ts'

/*
 * Cut at every character, because that is what a network read does. The
 * property these cases all check is the same one: whatever arrives, the reader
 * sees text or nothing — never a brace, a quote or half an escape.
 */
describe('the recap, read out of a half-written answer', () => {
  it('gives nothing until the recap starts', () => {
    expect(recapSoFar('')).toBe('')
    expect(recapSoFar('{')).toBe('')
    expect(recapSoFar('{"rec')).toBe('')
    expect(recapSoFar('{"recap"')).toBe('')
    expect(recapSoFar('{"recap":')).toBe('')
    expect(recapSoFar('{"recap": "')).toBe('')
  })

  it('grows as the words arrive', () => {
    expect(recapSoFar('{"recap": "Jung')).toBe('Jung')
    expect(recapSoFar('{"recap": "Jung reads a dream')).toBe('Jung reads a dream')
  })

  it('stops at the end of the recap and never shows what follows', () => {
    const whole = '{"recap": "A dream is a letter.", "concepts": [{"name": "dream"}]}'
    expect(recapSoFar(whole)).toBe('A dream is a letter.')
  })

  it('reads the recap when the model puts concepts first', () => {
    // Both orders are valid JSON, and the schema does not bind one.
    expect(recapSoFar('{"concepts": [], "recap": "Second, but still first here.')).toBe(
      'Second, but still first here.',
    )
  })

  it('undoes the escapes rather than printing them', () => {
    expect(recapSoFar('{"recap": "He said \\"no\\" twice')).toBe('He said "no" twice')
    expect(recapSoFar('{"recap": "One.\\n\\nTwo.')).toBe('One.\n\nTwo.')
    expect(recapSoFar('{"recap": "A back\\\\slash')).toBe('A back\\slash')
    expect(recapSoFar('{"recap": "caf\\u00e9')).toBe('café')
  })

  it('waits rather than showing half an escape', () => {
    // The delta ended on the backslash. A lone backslash on screen for one
    // frame is a flicker the reader would see.
    expect(recapSoFar('{"recap": "He said \\')).toBe('He said ')
    expect(recapSoFar('{"recap": "caf\\u00')).toBe('caf')
  })

  it('survives a cut at every single character of a whole answer', () => {
    const whole = '{"recap": "A dream is a letter to \\"you\\".", "concepts": []}'
    const finished = 'A dream is a letter to "you".'

    for (let cut = 0; cut <= whole.length; cut += 1) {
      const shown = recapSoFar(whole.slice(0, cut))
      // Always a prefix of the finished recap, and never anything else.
      expect(finished.startsWith(shown)).toBe(true)
    }
    expect(recapSoFar(whole)).toBe(finished)
  })
})
