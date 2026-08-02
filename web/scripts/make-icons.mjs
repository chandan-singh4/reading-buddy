/**
 * Generate the app icons.
 *
 * `node scripts/make-icons.mjs` — run by hand, whenever the mark changes.
 *
 * A script rather than four committed PNGs, because a binary in a repo is a
 * thing nobody can edit or explain later. The icon is drawn from the same theme
 * tokens the app uses (`styles/theme.css`), so it can't drift from the product
 * it stands for, and a phone home screen is the one place the app is seen
 * without any of its own interface around it.
 *
 * No image library: PNG is a handful of chunks around a zlib stream, and Node
 * ships zlib. Pulling in a dependency to draw two rectangles would cost more
 * than it saves.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// From `styles/theme.css`, dark palette — an icon sits on a home screen, not on
// the app's own background, so the dark one reads better against both.
const INK = [0x14, 0x13, 0x0f]
const PAGE = [0xec, 0xe7, 0xdf]
const GOLD = [0xc9, 0xa2, 0x27]

// --- The mark ---------------------------------------------------------------

/**
 * An open book: two pages drooping away from a gold spine.
 *
 * Written in coordinates from 0 to 1 so one description serves every size, and
 * sampled 3×3 per pixel — at 192 px a hard edge on a diagonal is visibly
 * jagged, and averaging nine samples is the cheapest possible antialiasing.
 *
 * `scale` shrinks the mark without shrinking the background, which is what a
 * maskable icon needs: Android crops it to whatever shape the launcher uses, so
 * the mark has to sit inside a safe circle with the background running to the
 * edges.
 */
function colourAt(x, y, scale) {
  // Pull the point back towards the centre — drawing the same mark smaller.
  const u = 0.5 + (x - 0.5) / scale
  const v = 0.5 + (y - 0.5) / scale

  const fromSpine = Math.abs(u - 0.5)

  if (fromSpine <= 0.02 && v >= 0.29 && v <= 0.73) return GOLD

  if (fromSpine > 0.02 && fromSpine <= 0.32) {
    // How far out towards the outer edge of the page, 0 at the spine and 1 at
    // the fore-edge. The droop is what makes it read as an open book rather
    // than as two plain rectangles.
    const across = (fromSpine - 0.02) / 0.3
    const top = 0.3 + 0.09 * across
    const bottom = 0.72 + 0.03 * across
    if (v >= top && v <= bottom) return PAGE
  }

  return null
}

/** `step` is one pixel's width in the 0–1 space, so the nine samples stay
 *  inside the pixel being drawn rather than across a third of the icon. */
function pixel(x, y, step, scale) {
  let r = 0
  let g = 0
  let b = 0

  for (let sy = 0; sy < 3; sy += 1) {
    for (let sx = 0; sx < 3; sx += 1) {
      const colour =
        colourAt(x + ((sx + 0.5) / 3) * step, y + ((sy + 0.5) / 3) * step, scale) ?? INK
      r += colour[0]
      g += colour[1]
      b += colour[2]
    }
  }

  return [Math.round(r / 9), Math.round(g / 9), Math.round(b / 9)]
}

// --- PNG --------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, crc])
}

function png(size, scale) {
  // Each row is prefixed with a filter byte; 0 means "stored as is". Real
  // encoders pick a filter per row to compress better — pointless here, where
  // the image is a few flat colours and already compresses to nothing.
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x / size, y / size, 1 / size, scale)
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bits per channel
  header[9] = 2 // truecolour RGB
  // The remaining three bytes — compression, filter and interlace method — are
  // zero, and zero is the only value any of them is allowed to take.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Output -----------------------------------------------------------------

const icons = [
  // Android's two required sizes.
  { name: 'icon-192.png', size: 192, scale: 1 },
  { name: 'icon-512.png', size: 512, scale: 1 },
  // Maskable: the launcher crops this to its own shape, so the mark is pulled
  // in to survive the worst crop (a circle) and the background runs to the edge.
  { name: 'icon-maskable-512.png', size: 512, scale: 0.62 },
  // iOS ignores the manifest's icons and reads this one from a <link> tag. It
  // also has no maskable notion — it rounds the corners itself — so this is the
  // plain mark at the size Apple asks for.
  { name: 'apple-touch-icon.png', size: 180, scale: 1 },
]

mkdirSync(PUBLIC_DIR, { recursive: true })

for (const { name, size, scale } of icons) {
  const bytes = png(size, scale)
  writeFileSync(join(PUBLIC_DIR, name), bytes)
  console.log(`${name} — ${size}×${size}, ${(bytes.length / 1024).toFixed(1)} kB`)
}
