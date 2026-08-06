/**
 * Renders its children into `<body>`, outside the app's frame.
 *
 * **Why anything needs this.** `AppShell`'s `.frame` carries a CSS `filter` at
 * all times — written at no-op values (`blur(0) saturate(1)`) rather than
 * `none`, because a browser can only interpolate between two filter lists of
 * the same shape and `none → blur()` snaps. The cost of that trick is easy to
 * miss: **an element with a `filter` is a containing block for every
 * `position: fixed` descendant.** So a "fixed" element rendered inside a page
 * is not fixed to the viewport at all — it is fixed to the frame, which is as
 * tall as the whole scrolling document.
 *
 * That is exactly what happened to the library's floating "+" (it sat at the
 * bottom of the *document*, reachable only by scrolling to the end of the
 * shelf) and to its filter sheet (it slid up from the bottom of the document,
 * far below the fold, so tapping the button looked like it did nothing).
 *
 * The drawer and the update panel avoid this by being *siblings* of the frame
 * rather than descendants. Anything inside a page can't be written that way, so
 * it comes here instead. **Any future sheet, menu, toast or dialog that means
 * "fixed to the screen" must go through this.**
 *
 * Layering is the other half. The drawer's scrim and panel sit at z-index 8 and
 * 9; everything portalled must stay *below* that, so opening the drawer covers
 * it rather than leaving a floating button on top of the frosted glass.
 */

import { createPortal } from 'react-dom'

export function Portal({ children }: { children: React.ReactNode }) {
  // Guarded for a server or test environment with no document. Returning null
  // rather than throwing: a missing button is a degraded screen, a thrown error
  // is no screen at all.
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
