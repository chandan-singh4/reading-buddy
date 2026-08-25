/**
 * Turning a stored plate into something a model can be sent.
 *
 * The bytes in the `assets` table are the publisher's own: a full-page plate in
 * a picture book is routinely 2,000 pixels on its long edge and several
 * megabytes. Sent as it is, base64 inflates it by a third, and the request is
 * larger than some relays accept and slower than a reader will wait for on a
 * phone. So a picture is scaled down and re-encoded before it goes.
 *
 * ## Why the arithmetic is a separate function
 *
 * Everything here that needs a canvas needs a browser, and a test that needs a
 * browser is a test that does not run. `fitWithin` is the whole judgment — what
 * size a picture becomes — and it is pure, so it is tested properly and the
 * drawing around it stays thin enough to read.
 *
 * ## The long edge, not the area
 *
 * A model reads a picture as tiles, and what decides the tile count is the
 * larger side. Capping the long edge treats a panorama and a portrait plate
 * alike, which capping the area does not.
 */

/**
 * The longest edge a picture is sent at.
 *
 * 1,024 is the size at which the major vision models stop gaining detail — they
 * tile at or near it — so a larger picture costs more and shows the model
 * nothing further. A diagram whose labels are unreadable at 1,024 is unreadable
 * to the model at any size, because the tiling is what limits it.
 */
export const MAX_EDGE = 1024

/** Above this, the encoded picture is refused rather than sent. */
export const MAX_BYTES = 4_000_000

/**
 * The size a picture becomes: the same shape, with its long edge capped.
 *
 * A picture already inside the cap is left alone. Enlarging a small one would
 * add no detail and cost bytes for the interpolation.
 */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }

  const longest = Math.max(width, height)
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) }

  const factor = max / longest
  // At least one pixel each way: a 4000×3 rule would otherwise round the short
  // edge to zero, and a zero-height canvas throws rather than draws.
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
}

/** A picture ready to send. */
export interface Picture {
  /** `data:image/jpeg;base64,…` — the form every relay on the chain takes. */
  dataUrl: string
  width: number
  height: number
}

/**
 * JPEG, not the original format, and not PNG.
 *
 * A plate is a photograph or a painting far more often than it is a line
 * drawing, and JPEG at 0.82 is a third of the bytes of the same picture as PNG.
 * The exception that would matter — a diagram of thin black lines, where JPEG
 * rings around the strokes — is also the case that survives the ringing well
 * enough to read, and the alternative is a PNG four times the size on the
 * pictures that are not diagrams.
 */
const TYPE = 'image/jpeg'
const QUALITY = 0.82

/**
 * Scale a stored picture down and encode it.
 *
 * `null` rather than a throw when the picture cannot be read or comes back
 * larger than the cap: a figure that cannot be sent is a chip the reader does
 * not get, not an error interrupting their reading.
 *
 * The decode and the canvas are taken as arguments so a test can drive this
 * without a browser. Both default to the real thing.
 */
export async function pictureOf(
  blob: Blob,
  {
    decode = createImageBitmap,
    canvasFor = defaultCanvas,
    max = MAX_EDGE,
  }: {
    decode?: (blob: Blob) => Promise<ImageBitmapLike>
    canvasFor?: (width: number, height: number) => CanvasLike | null
    max?: number
  } = {},
): Promise<Picture | null> {
  let bitmap: ImageBitmapLike
  try {
    bitmap = await decode(blob)
  } catch {
    return null
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height, max)
    if (size.width === 0 || size.height === 0) return null

    const canvas = canvasFor(size.width, size.height)
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return null

    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const dataUrl = canvas.toDataURL(TYPE, QUALITY)
    if (!dataUrl.startsWith('data:image/')) return null
    if (dataUrl.length > MAX_BYTES) return null

    return { dataUrl, width: size.width, height: size.height }
  } catch {
    return null
  } finally {
    bitmap.close?.()
  }
}

/** The parts of an `ImageBitmap` this module uses. */
export interface ImageBitmapLike {
  width: number
  height: number
  close?: () => void
}

/** The parts of a `<canvas>` this module uses. */
export interface CanvasLike {
  getContext: (kind: '2d') => {
    drawImage: (source: ImageBitmapLike, x: number, y: number, w: number, h: number) => void
  } | null
  toDataURL: (type: string, quality: number) => string
}

function defaultCanvas(width: number, height: number): CanvasLike | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas as unknown as CanvasLike
}
