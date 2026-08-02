/**
 * Focus Mode's on/off state, remembered between sessions.
 *
 * Focus Mode *hides* chrome; it never removes it (decided 2026-08-02, see
 * `backlog.md`). Progress, the chapter list, the way back and — later —
 * highlights all stay one tap away. The setting only decides whether they are
 * showing when you arrive.
 *
 * Kept in `localStorage` rather than in the database: it is a preference about
 * the app, not something belonging to a book, and it is needed on the very
 * first render, before any async read could have finished.
 */

const KEY = 'reading-buddy:focus-mode'

export function readFocusMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'on'
  } catch {
    // Private browsing and locked-down settings can both make storage throw on
    // read. A preference is never worth failing to open a book over.
    return false
  }
}

export function writeFocusMode(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* Same: the setting simply won't persist. */
  }
}
