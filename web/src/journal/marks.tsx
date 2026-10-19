/**
 * The marks for the journal's three shapes, and for the reader's own words.
 *
 * Four small drawings, not a font and not a sprite: each is three or four
 * lines, and an icon file for that would cost more than it saves.
 *
 * The idea behind them is one idea drawn four ways — lines on a page, gaining
 * structure as the shape gets stronger. Tidy is plain lines. Shape puts a
 * title bar over them. Unpack indents them under headings. The reader's own
 * words are not lines at all: they are a waveform, because they were spoken
 * and never written.
 *
 * Every one is `aria-hidden`. The word beside it is what a screen reader
 * announces, so a mark that also announced itself would say it twice.
 */

import type { ReactNode } from 'react'

import type { ShapeLevel } from './shape.ts'

interface MarkProps {
  className?: string
}

function frame(children: ReactNode, className?: string) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Tidy: the same words, now in lines that end where sentences end. */
export function TidyMark({ className }: MarkProps) {
  return frame(
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h9" />
    </>,
    className,
  )
}

/** Shape: a title over the lines, and the lines gathered into a block. */
export function ShapeMark({ className }: MarkProps) {
  return frame(
    <>
      <path d="M4 5.5h9" strokeWidth="3" />
      <path d="M4 12h16" />
      <path d="M4 16.5h16" />
      <path d="M4 21h11" />
    </>,
    className,
  )
}

/** Unpack: headings with their own lines stepped in underneath them. */
export function UnpackMark({ className }: MarkProps) {
  return frame(
    <>
      <path d="M4 5.5h10" strokeWidth="3" />
      <path d="M8 11h12" />
      <path d="M4 16h8" strokeWidth="3" />
      <path d="M8 21h12" />
    </>,
    className,
  )
}

/** The reader's own words: a voice, not a page. */
export function VoiceMark({ className }: MarkProps) {
  return frame(
    <>
      <path d="M4 10v4" />
      <path d="M8.5 6.5v11" />
      <path d="M13 9v6" />
      <path d="M17.5 5v14" />
      <path d="M21 10.5v3" />
    </>,
    className,
  )
}

/** The mark for one shape level. */
export function LevelMark({ level, className }: MarkProps & { level: ShapeLevel }) {
  switch (level) {
    case 'tidy':
      return <TidyMark className={className} />
    case 'shape':
      return <ShapeMark className={className} />
    default:
      return <UnpackMark className={className} />
  }
}
