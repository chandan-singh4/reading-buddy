import { describe, expect, it } from 'vitest'

import { hasInk } from './pdfRender.ts'

/** A band of one colour, as `getImageData` would hand it over. */
function sheet(width: number, height: number, fill: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let at = 0; at < data.length; at += 4) {
    data[at] = fill[0]
    data[at + 1] = fill[1]
    data[at + 2] = fill[2]
    data[at + 3] = 255
  }
  return {
    data,
    context: {
      getImageData: () => ({ data }),
    },
  }
}

describe('hasInk', () => {
  it('says no to blank paper', () => {
    const { context } = sheet(200, 200, [255, 255, 255])
    expect(hasInk(context, 200, 200)).toBe(false)
  })

  it('says yes to a page of black', () => {
    const { context } = sheet(200, 200, [0, 0, 0])
    expect(hasInk(context, 200, 200)).toBe(true)
  })

  it('says yes to a line drawing on white', () => {
    // A tenth of the samples inked: a sparse diagram, which is exactly the
    // case a stricter rule would throw away.
    const { data, context } = sheet(200, 200, [255, 255, 255])
    for (let at = 0; at < data.length; at += 40 * 4 * 10) {
      data[at] = 0
      data[at + 1] = 0
      data[at + 2] = 0
    }
    expect(hasInk(context, 200, 200)).toBe(true)
  })

  it('says no to a speck of scanner noise', () => {
    const { data, context } = sheet(200, 200, [255, 255, 255])
    data[0] = 0
    data[1] = 0
    data[2] = 0
    expect(hasInk(context, 200, 200)).toBe(false)
  })

  it('ignores a shade too close to white to see', () => {
    const { context } = sheet(200, 200, [253, 253, 253])
    expect(hasInk(context, 200, 200)).toBe(false)
  })

  it('keeps the band when the pixels cannot be read', () => {
    // A throw here is not the band's fault, and dropping a real figure is the
    // worse way to be wrong.
    const context = {
      getImageData: () => {
        throw new Error('tainted')
      },
    }
    expect(hasInk(context, 10, 10)).toBe(true)
  })
})
