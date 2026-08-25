import { describe, expect, it, vi } from 'vitest'

import {
  fitWithin,
  MAX_BYTES,
  MAX_EDGE,
  pictureOf,
  type CanvasLike,
  type ImageBitmapLike,
} from './figurePicture.ts'

const bitmap = (width: number, height: number): ImageBitmapLike => ({ width, height })

function canvas(url = 'data:image/jpeg;base64,abc') {
  const drawImage = vi.fn()
  const toDataURL = vi.fn(() => url)
  const made: { width: number; height: number }[] = []
  const canvasFor = (width: number, height: number): CanvasLike => {
    made.push({ width, height })
    return { getContext: () => ({ drawImage }), toDataURL }
  }
  return { canvasFor, drawImage, toDataURL, made }
}

describe('fitWithin', () => {
  it('leaves a picture inside the cap alone', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('caps the long edge and keeps the shape', () => {
    expect(fitWithin(2048, 1024)).toEqual({ width: 1024, height: 512 })
  })

  it('caps the long edge when it is the height', () => {
    expect(fitWithin(1024, 4096)).toEqual({ width: 256, height: 1024 })
  })

  it('never rounds an edge away to nothing', () => {
    expect(fitWithin(4000, 3).height).toBe(1)
  })

  it('answers zero for a picture with no size', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(Number.NaN, 100)).toEqual({ width: 0, height: 0 })
  })
})

describe('pictureOf', () => {
  it('scales the picture down and reports the size it sent', async () => {
    const { canvasFor, made, drawImage } = canvas()
    const picture = await pictureOf(new Blob(), {
      decode: async () => bitmap(2048, 1024),
      canvasFor,
    })

    expect(picture).toEqual({ dataUrl: 'data:image/jpeg;base64,abc', width: 1024, height: 512 })
    expect(made).toEqual([{ width: 1024, height: 512 }])
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 512)
  })

  it('honours a smaller cap', async () => {
    const { canvasFor, made } = canvas()
    await pictureOf(new Blob(), { decode: async () => bitmap(800, 400), canvasFor, max: 200 })
    expect(made).toEqual([{ width: 200, height: 100 }])
  })

  it('is null when the picture cannot be decoded', async () => {
    const { canvasFor } = canvas()
    const picture = await pictureOf(new Blob(), {
      decode: () => Promise.reject(new Error('not an image')),
      canvasFor,
    })
    expect(picture).toBeNull()
  })

  it('is null when there is no canvas to draw on', async () => {
    const picture = await pictureOf(new Blob(), {
      decode: async () => bitmap(100, 100),
      canvasFor: () => null,
    })
    expect(picture).toBeNull()
  })

  it('is null when the encoded picture is over the cap', async () => {
    const { canvasFor } = canvas(`data:image/jpeg;base64,${'a'.repeat(MAX_BYTES)}`)
    const picture = await pictureOf(new Blob(), { decode: async () => bitmap(100, 100), canvasFor })
    expect(picture).toBeNull()
  })

  it('is null when the canvas hands back something that is not a picture', async () => {
    const { canvasFor } = canvas('data:,')
    const picture = await pictureOf(new Blob(), { decode: async () => bitmap(100, 100), canvasFor })
    expect(picture).toBeNull()
  })

  it('closes the bitmap even when the drawing fails', async () => {
    const close = vi.fn()
    await pictureOf(new Blob(), {
      decode: async () => ({ width: 100, height: 100, close }),
      canvasFor: () => {
        throw new Error('no context')
      },
    })
    expect(close).toHaveBeenCalled()
  })

  it('caps at 1024, the size vision models stop gaining detail at', () => {
    expect(MAX_EDGE).toBe(1024)
  })
})
