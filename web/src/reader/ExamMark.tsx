/**
 * The way into Veda's Examination, drawn as a question on a page.
 *
 * A page outline with a question mark set into it, rather than a bare "?" or a
 * speech bubble. A lone question mark in a reading app's top bar reads as help,
 * which is the one thing this is not; a speech bubble is already Veda's
 * conversation. The page says the questions are about *this book*, and the mark
 * says they are questions rather than a summary.
 *
 * Drawn in `currentColor` like every other control in the bar, so the corner
 * stays one family. The violet arrives from the button's own rule, not from
 * here — Veda's colour belongs to whatever is Veda-powered, and an icon that
 * hardcoded it could not be reused anywhere else.
 */
export function ExamMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* The page, with a turned corner — the same shape the chapter-summaries
          button uses, so the two Veda doors look related. */}
      <path d="M5 3.5h9l5 5v12H5z" />
      <path d="M14 3.5v5h5" />
      {/* The question, set in the body of the page rather than floating over
          it. Two strokes: the hook and the point. */}
      <path d="M9.6 12.1a2.4 2.4 0 1 1 3.2 2.26c-.5.19-.8.66-.8 1.19v.45" />
      <path d="M12 17.9v.01" />
    </svg>
  )
}
