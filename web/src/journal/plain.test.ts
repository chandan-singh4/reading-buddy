// Markdown read back as plain words, for a card that has no room to render it.
import { describe, expect, it } from 'vitest'

import { plainWords } from './plain.ts'

describe('plainWords', () => {
  it('drops a heading and starts at the first real sentence', () => {
    const text = '## Dream recollection\n\nI had a dream last night. Parts are vivid.'

    expect(plainWords(text)).toBe('I had a dream last night. Parts are vivid.')
  })

  it('keeps the headings when there is nothing else', () => {
    expect(plainWords('# A title\n\n## And a heading')).toBe('A title And a heading')
  })

  it('takes the marks off emphasis, lists, quotes and links', () => {
    expect(plainWords('- **bold** and *soft*')).toBe('bold and soft')
    expect(plainWords('> a quoted line')).toBe('a quoted line')
    expect(plainWords('1. first thing')).toBe('first thing')
    expect(plainWords('see [the note](https://example.com)')).toBe('see the note')
    expect(plainWords('`code` and ~~gone~~')).toBe('code and gone')
  })

  it('leaves plain words exactly as they are', () => {
    const spoken = 'um so the thing is i was thinking about it'

    expect(plainWords(spoken)).toBe(spoken)
  })

  it('says a table as its cells', () => {
    expect(plainWords('| Term | Meaning |\n|---|---|\n| One | Two |')).toBe(
      'Term · Meaning One · Two',
    )
  })
})
