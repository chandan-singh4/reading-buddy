/**
 * A book's physical size, as a number.
 *
 * Google reports dimensions as strings with the unit baked in — `"24.00 cm"`,
 * and occasionally `"9.5 inches"`. That is a reasonable thing to print and a
 * useless thing to compare, so the conversion happens once here, on the way in,
 * rather than at every place that ever wants to draw a shelf to scale.
 *
 * Millimetres, as integers. The source was rounded to two decimals of a
 * centimetre, so a tenth of a millimetre is precision the number never had.
 */

/** What one unit is worth in millimetres. Google's spelling, plus the obvious. */
const MILLIMETRES: Readonly<Record<string, number>> = {
  mm: 1,
  millimeters: 1,
  millimetres: 1,
  cm: 10,
  centimeters: 10,
  centimetres: 10,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
}

/**
 * A single measurement in millimetres, or `undefined` when the string isn't one.
 *
 * **An unrecognised unit is refused, never assumed.** Defaulting to centimetres
 * would turn a 9.5-inch book into a 95 mm one — a number that is wrong, looks
 * plausible, and would quietly rank it as the smallest thing on the shelf.
 */
export function millimetresOf(value: string | undefined): number | undefined {
  const match = /^\s*([\d.]+)\s*([a-z]+)\s*$/i.exec(value ?? '')
  if (!match) return undefined

  const size = Number(match[1])
  const unit = MILLIMETRES[match[2].toLowerCase()]
  if (!Number.isFinite(size) || size <= 0 || unit === undefined) return undefined

  const mm = Math.round(size * unit)
  // A book is not 4 metres tall, and it is not 0 mm either. A measurement this
  // far out is a parse that went wrong, and a wrong number is worse than none.
  return mm >= 1 && mm <= 1000 ? mm : undefined
}

export interface VolumeDimensions {
  height?: string
  width?: string
  thickness?: string
}

export interface BookDimensions {
  heightMm?: number
  widthMm?: number
  thicknessMm?: number
}

/**
 * All three, each independently. A volume that gives a height and no thickness
 * keeps its height — the three arrive together but do not stand or fall
 * together.
 */
export function dimensionsOf(source: VolumeDimensions | undefined): BookDimensions {
  const found: BookDimensions = {}
  if (!source) return found

  const height = millimetresOf(source.height)
  const width = millimetresOf(source.width)
  const thickness = millimetresOf(source.thickness)

  if (height !== undefined) found.heightMm = height
  if (width !== undefined) found.widthMm = width
  if (thickness !== undefined) found.thicknessMm = thickness

  return found
}
