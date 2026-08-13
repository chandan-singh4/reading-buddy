import { describe, expect, it } from 'vitest'

import { dimensionsOf, millimetresOf } from './dimensions.ts'

describe('millimetresOf', () => {
  // The real shape, measured on Breath: {"height":"24.00 cm","width":"16.40 cm"}
  it('reads the centimetres Google actually sends', () => {
    expect(millimetresOf('24.00 cm')).toBe(240)
    expect(millimetresOf('16.40 cm')).toBe(164)
    expect(millimetresOf('2.80 cm')).toBe(28)
  })

  it('converts inches rather than trusting the number', () => {
    expect(millimetresOf('9.5 inches')).toBe(241)
  })

  // The whole reason the unit is parsed instead of assumed: read as
  // centimetres, a 9.5-inch book becomes 95 mm — plausible, and the smallest
  // thing on the shelf.
  it('refuses a unit it does not recognise', () => {
    expect(millimetresOf('9.5 cubits')).toBeUndefined()
    expect(millimetresOf('24.00')).toBeUndefined()
  })

  it('refuses what is not a measurement at all', () => {
    expect(millimetresOf(undefined)).toBeUndefined()
    expect(millimetresOf('')).toBeUndefined()
    expect(millimetresOf('tall')).toBeUndefined()
    expect(millimetresOf('0 cm')).toBeUndefined()
  })

  // A book is neither 4 metres tall nor a tenth of a millimetre. Either is a
  // parse that went wrong, and a wrong number outlives a missing one.
  it('refuses a size no book has', () => {
    expect(millimetresOf('400 cm')).toBeUndefined()
    expect(millimetresOf('0.01 mm')).toBeUndefined()
    expect(millimetresOf('100 cm')).toBe(1000)
  })
})

describe('dimensionsOf', () => {
  it('reads all three', () => {
    expect(dimensionsOf({ height: '24.00 cm', width: '16.40 cm', thickness: '2.80 cm' })).toEqual({
      heightMm: 240,
      widthMm: 164,
      thicknessMm: 28,
    })
  })

  // They arrive together but do not stand or fall together.
  it('keeps the measurements it can read and omits the rest', () => {
    expect(dimensionsOf({ height: '24.00 cm', thickness: 'thick' })).toEqual({ heightMm: 240 })
  })

  it('gives back nothing for a volume that reports no size', () => {
    expect(dimensionsOf(undefined)).toEqual({})
    expect(dimensionsOf({})).toEqual({})
  })
})
