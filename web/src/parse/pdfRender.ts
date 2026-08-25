/**
 * Photographing a band of a PDF page.
 *
 * `pdfFigures.ts` says *where* a picture is; this turns that into bytes. It is
 * the only part of the PDF path that needs a browser, and it is kept in its own
 * module for exactly that reason: the detection is arithmetic and is tested
 * without one.
 *
 * ## The whole page is rendered, then cropped
 *
 * pdf.js can be told to draw part of a page, by handing it a viewport with an
 * offset. It is also the step where a sign or a scale goes wrong quietly — the
 * output is a picture, and a picture of the wrong part of the page looks
 * exactly like a picture. Rendering the page whole and cutting the band out of
 * it with `drawImage` uses coordinates that can be checked by eye, and costs
 * one render per page that has a band at all.
 *
 * ## A blank band is thrown away here
 *
 * The detector deliberately does not judge what is in a band; it only knows
 * that no *text* is there. Blank paper therefore reaches this point, and this
 * is where it stops: a rendered band with no ink in it is discarded, so the
 * reader never gets an Ask button under a picture of nothing. That check has to
 * come after the render, because until the page is drawn nobody knows whether
 * the gap held a diagram or a margin.
 */

import type { Band } from './pdfFigures.ts'

/** How wide a rendered band is, at most. Matches `reader/figurePicture.ts`. */
const MAX_EDGE = 1024

/**
 * How much ink a band needs before it counts as a picture.
 *
 * A twentieth of the samples. Below that, what is on the page is a stray rule,
 * a page number the text pass missed, or a speck of scanner noise — not
 * something a reader would call a figure. Deliberately generous: a line drawing
 * on white paper is mostly white, and a stricter rule would throw away exactly
 * the diagrams this feature is for.
 */
const MIN_INK = 0.05

/** How far off white a pixel must be to count as ink. */
const INK_DISTANCE = 24

/** The bit of pdf.js this module uses. */
export interface RenderablePage {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> }
}

/**
 * Draw one page and cut its bands out.
 *
 * Answers an empty map rather than throwing when there is no canvas to draw on
 * — under test, and in any worker this might one day run in. A book then
 * imports exactly as it did before, with no figures.
 */
export async function renderBands(
  page: RenderablePage,
  bands: readonly Band[],
  pageHeight: number,
): Promise<Map<Band, Blob>> {
  const found = new Map<Band, Blob>()
  if (bands.length === 0 || typeof document === 'undefined') return found

  const tallest = Math.max(...bands.map((band) => band.top - band.bottom))
  if (!(tallest > 0) || !(pageHeight > 0)) return found

  // Scaled so the tallest band lands near the cap, and never enlarged past the
  // page's own resolution — a 300% render of a 72dpi scan is bytes for nothing.
  const scale = Math.min(2, MAX_EDGE / tallest)
  const viewport = page.getViewport({ scale })

  const sheet = canvasOf(viewport.width, viewport.height)
  const paper = sheet?.getContext('2d')
  if (!sheet || !paper) return found

  // White, because a PDF page is paper and a canvas starts transparent. Without
  // this every band would be cut out of a transparent sheet, and the ink test
  // below would read the emptiness as ink.
  paper.fillStyle = '#ffffff'
  paper.fillRect(0, 0, viewport.width, viewport.height)

  try {
    await page.render({ canvasContext: paper, viewport }).promise
  } catch {
    return found
  }

  for (const band of bands) {
    // PDF counts up from the foot of the page and a canvas counts down from the
    // top, so the band's *top* edge is the smaller number here.
    const top = (pageHeight - band.top) * scale
    const height = (band.top - band.bottom) * scale
    if (!(height >= 1)) continue

    const cut = canvasOf(viewport.width, height)
    const ink = cut?.getContext('2d')
    if (!cut || !ink) continue

    ink.drawImage(sheet, 0, top, viewport.width, height, 0, 0, viewport.width, height)
    if (!hasInk(ink, viewport.width, height)) continue

    const bytes = await blobOf(cut)
    if (bytes) found.set(band, bytes)
  }

  return found
}

/** Whether anything was actually drawn in this band. */
export function hasInk(
  context: { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } },
  width: number,
  height: number,
): boolean {
  const across = Math.max(1, Math.floor(width))
  const down = Math.max(1, Math.floor(height))

  let pixels: Uint8ClampedArray
  try {
    pixels = context.getImageData(0, 0, across, down).data
  } catch {
    // A tainted canvas, which cannot happen here — nothing cross-origin is
    // drawn — but reading pixels is the one call in this file that can throw
    // for reasons outside it. Keeping the band is the safe way to be wrong.
    return true
  }

  // Every 40th pixel, which on a 1,000×1,000 band is 25,000 samples: enough to
  // find a thin diagram, cheap enough to run on every band of a long book.
  const step = 40 * 4
  let inked = 0
  let looked = 0

  for (let at = 0; at + 3 < pixels.length; at += step) {
    looked += 1
    // Colour only. Alpha is deliberately not part of this: the sheet was
    // filled white before the render, so every pixel is opaque, and counting a
    // transparent pixel as ink is how an empty band would pass.
    const off = 765 - pixels[at]! - pixels[at + 1]! - pixels[at + 2]!
    if (off > INK_DISTANCE) inked += 1
  }

  return looked > 0 && inked / looked >= MIN_INK
}

function canvasOf(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function blobOf(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82)
  })
}
