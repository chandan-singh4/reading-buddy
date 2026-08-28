import { describe, expect, it } from 'vitest'

import { jsonFrom, librarianResult, scribeResult } from './parse.ts'

/*
 * What comes back from a model is the least trustworthy input in this app. It
 * is also stored, and a stored summary looks finished and is never rebuilt. So
 * the rules that protect the reader's vocabulary are tested here, not assumed.
 */

describe('finding the JSON', () => {
  it('reads a bare object', () => {
    expect(jsonFrom('{"recap":"hello"}')).toEqual({ recap: 'hello' })
  })

  it('reads it out of a fenced block', () => {
    expect(jsonFrom('```json\n{"recap":"hello"}\n```')).toEqual({ recap: 'hello' })
  })

  it('reads it out of surrounding prose', () => {
    const reply = 'Here is the result:\n{"recap":"hello"}\nLet me know if you need more.'
    expect(jsonFrom(reply)).toEqual({ recap: 'hello' })
  })

  it('throws rather than returning nothing', () => {
    // A silent null becomes an empty summary that looks finished and is never
    // built again. Failing loudly leaves the chapter to be retried.
    expect(() => jsonFrom('I am afraid I cannot do that.')).toThrow()
  })
})

describe('the Librarian’s reply', () => {
  it('takes the recap and the concepts', () => {
    const result = librarianResult(
      '{"recap":"The chapter argues that dreams do work.","concepts":[' +
        '{"name":"the unconscious","status":"existing-match"},' +
        '{"name":"prospective function","status":"new-addition"}]}',
    )
    expect(result.recap).toBe('The chapter argues that dreams do work.')
    expect(result.concepts).toEqual([
      { name: 'the unconscious', status: 'existing-match' },
      { name: 'prospective function', status: 'new-addition' },
    ])
  })

  it('treats a concept with no status as an existing one', () => {
    // The safe way round. Guessing "new" would put an unvetted name into the
    // controlled vocabulary, which is what both prompts exist to prevent.
    const result = librarianResult('{"recap":"x","concepts":[{"name":"dreams"}]}')
    expect(result.concepts[0].status).toBe('existing-match')
  })

  it('accepts a plain list of names', () => {
    const result = librarianResult('{"recap":"x","concepts":["dreams","alchemy"]}')
    expect(result.concepts.map((concept) => concept.name)).toEqual(['dreams', 'alchemy'])
  })

  it('drops a repeated name, whatever its case', () => {
    // Two rows for one idea is two notes in the reader's vault.
    const result = librarianResult('{"recap":"x","concepts":["dreams","Dreams"]}')
    expect(result.concepts).toHaveLength(1)
  })

  it('refuses a reply with no recap', () => {
    expect(() => librarianResult('{"concepts":[]}')).toThrow()
  })

  it('accepts a chapter that raised no concepts', () => {
    expect(librarianResult('{"recap":"x"}').concepts).toEqual([])
  })
})

describe('the Scribe’s reply', () => {
  const canonical = ['the unconscious', 'dreams']

  it('keeps an item whose concept is on the list', () => {
    const result = scribeResult(
      '{"items":[{"claim":"A dream can point forward.","concept":"dreams",' +
        '"status":"linked","anchor":"the annex-dream passage"}]}',
      canonical,
    )
    expect(result.items[0].status).toBe('linked')
    expect(result.items[0].anchor).toBe('the annex-dream passage')
  })

  it('demotes an invented concept to a candidate, whatever the model claimed', () => {
    // The load-bearing rule. The prompt forbids inventing an approved concept.
    // Enforced here rather than trusted: a model that marks its own invention
    // "linked" must not be able to write a new note into the vault.
    const result = scribeResult(
      '{"items":[{"claim":"x","concept":"survivorship bias in dreams","status":"linked"}]}',
      canonical,
    )
    expect(result.items[0].status).toBe('candidate')
  })

  it('keeps an item that names no concept at all', () => {
    // The knowledge is still worth having. It waits as a candidate.
    const result = scribeResult('{"items":[{"claim":"x"}]}', canonical)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].status).toBe('candidate')
  })

  it('drops an item with no claim', () => {
    // The claim is the only field the reader ever reads.
    expect(scribeResult('{"items":[{"concept":"dreams"}]}', canonical).items).toEqual([])
  })

  it('accepts a bare array, without the wrapper', () => {
    const result = scribeResult('[{"claim":"x","concept":"dreams"}]', canonical)
    expect(result.items).toHaveLength(1)
  })

  it('accepts a conversation that yielded nothing', () => {
    expect(scribeResult('{"items":[]}', canonical).items).toEqual([])
  })
})

describe('an answer that stopped before it closed', () => {
  it('keeps the recap the model did finish writing', () => {
    // The reader watched the whole recap appear, then was told the model did
    // not answer. The words were there; only the closing brace was missing.
    const cut = '{"recap": "Jung reads a dream as a message, not a riddle.", "concepts": [{"nam'
    const result = librarianResult(cut)
    expect(result.recap).toBe('Jung reads a dream as a message, not a riddle.')
    // The concept list is the part genuinely lost, so it is empty, not half read.
    expect(result.concepts).toEqual([])
  })

  it('still refuses an answer with no recap in it at all', () => {
    expect(() => librarianResult('I am sorry, I cannot do that.')).toThrow()
  })
})
