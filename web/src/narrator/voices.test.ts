import { describe, expect, it } from 'vitest'

import {
  DEFAULT_NARRATOR,
  FALLBACK_VOICES,
  VEDA_VOICE,
  groupsOf,
  resolveVoice,
  rosterOf,
} from './voices.ts'

describe('the roster', () => {
  it('reads a voice record into a list the picker can draw', () => {
    const roster = rosterOf({
      af_heart: { name: 'Heart', language: 'en-us', gender: 'Female', overallGrade: 'A' },
    })
    expect(roster).toEqual([
      { id: 'af_heart', name: 'Heart', language: 'en-us', gender: 'Female', grade: 'A' },
    ])
  })

  it('falls back to the id when a voice has no name', () => {
    expect(rosterOf({ zz_new: {} })[0]?.name).toBe('zz_new')
  })

  it('is empty when there is nothing to read', () => {
    expect(rosterOf(undefined)).toEqual([])
  })
})

describe('the built-in list', () => {
  /*
   * Not a test of the model. A test that the two defaults this app names are
   * really in the list it ships, because a default that names a voice nobody
   * has is a reader pressing play and hearing nothing.
   */
  it('contains both of the voices the app names by hand', () => {
    const ids = rosterOf(FALLBACK_VOICES).map((one) => one.id)
    expect(ids).toContain(DEFAULT_NARRATOR)
    expect(ids).toContain(VEDA_VOICE)
  })

  it("keeps Veda's voice apart from the book's", () => {
    // The audible half of the rule that gives Veda her own violet. If these two
    // are ever the same id, a listener cannot tell the tutor from the author.
    expect(VEDA_VOICE).not.toBe(DEFAULT_NARRATOR)
  })
})

describe('grouping', () => {
  it('groups by accent and names the two the model speaks', () => {
    const groups = groupsOf(rosterOf(FALLBACK_VOICES))
    expect(groups.map((one) => one.label)).toEqual(['American', 'British'])
  })

  it('keeps a language it has no name for rather than dropping it', () => {
    const groups = groupsOf(rosterOf({ xx_one: { name: 'One', language: 'xx-yy' } }))
    expect(groups).toEqual([
      {
        label: 'XX-YY',
        voices: [{ id: 'xx_one', name: 'One', language: 'xx-yy', gender: '' }],
      },
    ])
  })
})

describe('resolving a saved choice', () => {
  const roster = rosterOf(FALLBACK_VOICES)

  it('honours a voice the model still has', () => {
    expect(resolveVoice(roster, 'bm_george')).toEqual({ id: 'bm_george', changed: false })
  })

  it('falls back to the default when the saved voice is gone', () => {
    // The case this whole function exists for: a reader chose a voice, a model
    // release renamed it, and the alternative to falling back is silence.
    expect(resolveVoice(roster, 'af_gone')).toEqual({ id: DEFAULT_NARRATOR, changed: true })
  })

  it('does not call it a change when nothing was ever chosen', () => {
    expect(resolveVoice(roster, undefined)).toEqual({ id: DEFAULT_NARRATOR, changed: false })
  })

  it('takes the first voice when even the default is gone', () => {
    const odd = rosterOf({ zz_one: { name: 'One' }, zz_two: { name: 'Two' } })
    expect(resolveVoice(odd, 'af_gone').id).toBe('zz_one')
  })

  it('leaves the choice alone while the roster is still unknown', () => {
    // Before the model has answered there is nothing to check a saved id
    // against, and "I cannot see it" must not be read as "it is gone".
    expect(resolveVoice([], 'af_heart')).toEqual({ id: 'af_heart', changed: false })
  })
})
