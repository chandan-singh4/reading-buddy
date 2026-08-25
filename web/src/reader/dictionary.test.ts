/**
 * Turning MW's JSON into an entry.
 *
 * The fixtures are cut down from real responses and keep their real shapes —
 * the homograph ids, the four-deep `sseq`, the `meta.syns` array of arrays. A
 * fixture tidied into the shape the parser wants would test nothing.
 */

import { describe, expect, it } from 'vitest'

import {
  audioUrl,
  clean,
  etymologyTextOf,
  firstUseOf,
  isNotFound,
  normalize,
  suggestionsOf,
  syllablesOf,
  synonymsOf,
} from './dictionary.ts'

/** `fundamental`, as MW answers it: an adjective and a noun. */
const FUNDAMENTAL = [
  {
    meta: { id: 'fundamental:1' },
    hwi: {
      hw: 'fun*da*men*tal',
      prs: [{ mw: 'ˌfən-də-ˈmen-tᵊl', sound: { audio: 'fundam01' } }],
    },
    fl: 'adjective',
    def: [
      {
        sseq: [
          [
            [
              'sense',
              {
                sn: '1',
                dt: [
                  ['text', '{bc}serving as an original or generating source'],
                  ['vis', [{ t: 'the {wi}fundamental{/wi} principles of justice' }]],
                ],
              },
            ],
          ],
        ],
      },
    ],
    et: [['text', 'Middle English, borrowed from Late Latin {it}fundāmentālis{/it} "serving as a foundation"']],
    date: '15th century, in the meaning defined at sense 1a',
    shortdef: ['serving as an original or generating source', 'of central importance'],
  },
  {
    meta: { id: 'fundamental:2' },
    hwi: { hw: 'fun*da*men*tal' },
    fl: 'noun',
    def: [{ sseq: [[['sense', { dt: [['text', '{bc}a basic principle']] }]]] }],
    shortdef: ['one of the minimum constituents without which a thing would not be what it is'],
  },
  // MW returns entries for the phrases built on the word too. They are not the
  // word the reader tapped.
  {
    meta: { id: 'fundamental particle' },
    fl: 'noun',
    shortdef: ['elementary particle'],
  },
]

const THESAURUS = [
  {
    meta: {
      syns: [
        ['basic', 'basal', 'primary', 'elemental'],
        ['cardinal', 'central', 'principal'],
      ],
    },
  },
]

describe('cleaning MW’s markup', () => {
  it('turns the boldface colon into what it means', () => {
    expect(clean('{bc}serving as a source')).toBe(': serving as a source')
  })

  it('keeps the word inside a formatting tag', () => {
    expect(clean('the {it}fundamental{/it} rule')).toBe('the fundamental rule')
  })

  it('unwraps a link to the word it names', () => {
    expect(clean('see {sx|foundation||}')).toBe('see foundation')
    expect(clean('{d_link|basis|basis:1}')).toBe('basis')
  })

  it('takes the display text of an etymology link, not its target', () => {
    // `{et_link|target|shown}` is the one link written the other way round.
    expect(clean('{et_link|fundus:1|fundus}')).toBe('fundus')
  })

  it('drops a cross-reference along with its contents', () => {
    expect(clean('a basis {dx}see {dxt|foundation||}{/dx}')).toBe('a basis')
  })

  it('turns MW’s quote tokens into quotation marks', () => {
    expect(clean('{ldquo}a foundation{rdquo}')).toBe('“a foundation”')
  })

  it('deletes a token it has never heard of', () => {
    /*
     * The promise the whole file rests on. MW adds tokens; a reader must never
     * meet one. Anything left in braces goes, known or not.
     */
    expect(clean('a word {newtoken}and more{/newtoken}')).toBe('a word and more')
    expect(clean('{unknown|with|fields}word')).toBe('word')
  })
})

describe('the small conversions', () => {
  it('turns MW’s asterisks into syllable dots', () => {
    expect(syllablesOf('fun*da*men*tal')).toBe('fun·da·men·tal')
  })

  it('cuts a date back to the century', () => {
    expect(firstUseOf('15th century, in the meaning defined at sense 1b')).toBe('15th century')
  })

  it('builds an audio URL from the file name’s own first letter', () => {
    expect(audioUrl('fundam01')).toBe(
      'https://media.merriam-webster.com/audio/pronunciation/mp3/f/fundam01.mp3',
    )
  })

  it('follows MW’s three special folders', () => {
    // Documented rule, not a guess. Getting it wrong is a 404 behind a button
    // that looks perfectly healthy.
    expect(audioUrl('bixat01')).toContain('/mp3/bix/')
    expect(audioUrl('gggame01')).toContain('/mp3/gg/')
    expect(audioUrl('_4word01')).toContain('/mp3/number/')
    expect(audioUrl('3dprint')).toContain('/mp3/number/')
  })

  it('has no URL for a word with no recording', () => {
    expect(audioUrl('')).toBeUndefined()
  })
})

describe('a word MW does not have', () => {
  it('is told apart from a word it does', () => {
    expect(isNotFound(['asdf', 'asdfg'])).toBe(true)
    expect(isNotFound([])).toBe(true)
    expect(isNotFound(FUNDAMENTAL)).toBe(false)
  })

  it('offers the spellings MW suggested', () => {
    expect(suggestionsOf(['fundamental', 'fundamentals'])).toEqual(['fundamental', 'fundamentals'])
  })

  it('normalizes to nothing, so the caller shows the empty state', () => {
    expect(normalize('asdfghjkl', ['asdf'], [])).toBeNull()
  })
})

describe('normalizing an entry', () => {
  const entry = normalize('fundamental', FUNDAMENTAL, THESAURUS)!

  it('groups the senses by part of speech, in MW’s order', () => {
    expect(entry.partsOfSpeech).toEqual(['adjective', 'noun'])
    expect(entry.senseGroups[0]?.pos).toBe('adjective')
    expect(entry.senseGroups[0]?.senses).toHaveLength(2)
  })

  it('keeps only the entries for the word that was tapped', () => {
    // "fundamental particle" is a different headword wearing the same first
    // word, and its definition under "fundamental" would read as a mistake.
    const said = entry.senseGroups.flatMap((group) => group.senses.map((sense) => sense.text))
    expect(said.join(' ')).not.toContain('elementary particle')
  })

  it('reads the example out of the nested sense sequence', () => {
    expect(entry.senseGroups[0]?.senses[0]?.example).toBe('the fundamental principles of justice')
  })

  it('takes the pronunciation and its audio from the entry that has them', () => {
    expect(entry.pronunciation?.respelling).toBe('ˌfən-də-ˈmen-tᵊl')
    expect(entry.pronunciation?.audioUrl).toContain('fundam01.mp3')
  })

  it('reads the syllables', () => {
    expect(entry.syllables).toBe('fun·da·men·tal')
  })

  it('takes the synonyms from the first sense, then the second', () => {
    expect(entry.synonyms.slice(0, 4)).toEqual(['basic', 'basal', 'primary', 'elemental'])
    expect(entry.synonyms).toContain('cardinal')
  })

  it('names its source', () => {
    expect(entry.source).toBe('Merriam-Webster')
  })
})

describe('what is missing simply is not there', () => {
  it('has no pronunciation when MW gave none', () => {
    const bare = normalize(
      'thing',
      [{ meta: { id: 'thing' }, fl: 'noun', shortdef: ['a thing'] }],
      [],
    )!
    expect(bare.pronunciation).toBeUndefined()
    expect(bare.synonyms).toEqual([])
    expect(bare.etymology).toBeUndefined()
  })

  it('has no synonyms when the thesaurus only offered spellings', () => {
    // The thesaurus 404s as a list of strings, exactly like the dictionary.
    expect(synonymsOf(['fundamentals'])).toEqual([])
    expect(synonymsOf(null)).toEqual([])
  })

  it('falls back to the plain word when there are no syllables', () => {
    const bare = normalize('thing', [{ meta: { id: 'thing' }, fl: 'noun', shortdef: ['a thing'] }], [])!
    expect(bare.syllables).toBe('thing')
  })

  it('is null when every entry has senses we cannot read', () => {
    expect(normalize('thing', [{ meta: { id: 'thing' }, fl: 'noun', shortdef: [] }], [])).toBeNull()
  })
})

describe('finding the etymology to parse', () => {
  it('takes it from the first entry that has one', () => {
    /*
     * MW often leaves the adjective bare and puts the derivation on the noun.
     * Reading only the first entry would show an empty Origin on a word that
     * plainly has one.
     */
    const found = etymologyTextOf(
      [
        { meta: { id: 'word:1' }, fl: 'adjective', shortdef: ['one'] },
        {
          meta: { id: 'word:2' },
          fl: 'noun',
          shortdef: ['two'],
          et: [['text', 'Middle English {it}word{/it}']],
          date: '12th century',
        },
      ],
      'word',
    )
    expect(found.et).toContain('Middle English')
    expect(found.date).toBe('12th century')
  })

  it('still finds the date when there is no etymology at all', () => {
    const found = etymologyTextOf(
      [{ meta: { id: 'word' }, fl: 'noun', shortdef: ['one'], date: '1904' }],
      'word',
    )
    expect(found.et).toBeUndefined()
    expect(found.date).toBe('1904')
  })
})
