/**
 * Reading-comfort settings: theme, font, text size, line spacing, margins.
 *
 * One object, one `localStorage` key — unlike `focusMode.ts`'s single boolean,
 * these five choices are made together in the same sheet, so they are read and
 * written together too. Same defensive pattern as `focusMode.ts`: storage can
 * throw (private browsing, locked-down settings), and a preference is never
 * worth failing to open a book over.
 *
 * Every default below matches what the reading page already looked like before
 * this existed — 'auto' theme, the existing serif stack, the existing size and
 * line height, the existing column width. A reader who never opens the Aa tab
 * sees no change at all.
 */

export type Theme = 'auto' | 'light' | 'dark' | 'sepia'
export type ReadingFont = 'serif' | 'serif-alt' | 'sans'
export type Spacing = 'compact' | 'normal' | 'relaxed'
export type Margins = 'narrow' | 'normal' | 'wide'

export interface ReaderSettings {
  theme: Theme
  font: ReadingFont
  /** 1–5, steps around the size the reading page has always used. */
  textStep: number
  spacing: Spacing
  margins: Margins
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'auto',
  font: 'serif',
  textStep: 3,
  spacing: 'normal',
  margins: 'normal',
}

export const TEXT_STEPS = ['0.875rem', '1rem', '1.125rem', '1.3125rem', '1.5rem'] as const
export const MIN_TEXT_STEP = 1
export const MAX_TEXT_STEP = TEXT_STEPS.length

const SPACING_VALUES: Record<Spacing, string> = {
  compact: '1.4',
  normal: '1.7',
  relaxed: '2',
}

const MARGIN_VALUES: Record<Margins, string> = {
  narrow: '40rem',
  normal: '34rem',
  wide: '28rem',
}

/** The line-height for a given spacing choice, as a CSS value. */
export function leadingOf(spacing: Spacing): string {
  return SPACING_VALUES[spacing]
}

/** The comfortable column width for a given margins choice, as a CSS value. */
export function measureOf(margins: Margins): string {
  return MARGIN_VALUES[margins]
}

/** The font size for a given step, clamped to the range that exists. */
export function textSizeOf(step: number): string {
  const clamped = Math.min(MAX_TEXT_STEP, Math.max(MIN_TEXT_STEP, Math.round(step)))
  return TEXT_STEPS[clamped - 1]
}

const KEY = 'reading-buddy:reader-settings'

function isTheme(value: unknown): value is Theme {
  return value === 'auto' || value === 'light' || value === 'dark' || value === 'sepia'
}

function isFont(value: unknown): value is ReadingFont {
  return value === 'serif' || value === 'serif-alt' || value === 'sans'
}

function isSpacing(value: unknown): value is Spacing {
  return value === 'compact' || value === 'normal' || value === 'relaxed'
}

function isMargins(value: unknown): value is Margins {
  return value === 'narrow' || value === 'normal' || value === 'wide'
}

/**
 * Reads what was saved, filling in defaults for anything missing or malformed
 * rather than rejecting the whole object — an older version of the app or a
 * hand-edited value should degrade one field at a time, not reset everything.
 */
export function readReaderSettings(): ReaderSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS

    const parsed = JSON.parse(raw) as Partial<Record<keyof ReaderSettings, unknown>>
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      font: isFont(parsed.font) ? parsed.font : DEFAULT_SETTINGS.font,
      textStep:
        typeof parsed.textStep === 'number' &&
        parsed.textStep >= MIN_TEXT_STEP &&
        parsed.textStep <= MAX_TEXT_STEP
          ? parsed.textStep
          : DEFAULT_SETTINGS.textStep,
      spacing: isSpacing(parsed.spacing) ? parsed.spacing : DEFAULT_SETTINGS.spacing,
      margins: isMargins(parsed.margins) ? parsed.margins : DEFAULT_SETTINGS.margins,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeReaderSettings(settings: ReaderSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* Same as focusMode.ts: the setting simply won't persist. */
  }
}

/**
 * Apply the persisted theme and reading font to `<html>`.
 *
 * Called from two places, on purpose. `main.tsx` calls it once at boot, before
 * React renders anything — without that, a session that opens straight to
 * Home shows the OS's `prefers-color-scheme` guess instead of whatever theme
 * the reader actually chose, right up until a book happens to be opened. Since
 * the reader's own effect writes to `<html>` rather than scoping the change to
 * the reading screen (see its doc comment — that's deliberate, the reader's
 * choice is a setting about the whole app), the *first* time it ran used to be
 * the moment the reader's real choice suddenly appeared and started sticking
 * everywhere — which read as "opening a book changed my theme," when what
 * actually happened was Home never applying it in the first place. `Reader.tsx`
 * still calls this too, from the effect that reacts to the Aa tab changing the
 * setting live.
 */
export function applyStoredTheme(settings: ReaderSettings = readReaderSettings()): void {
  const root = document.documentElement
  if (settings.theme === 'auto') root.removeAttribute('data-theme')
  else root.dataset.theme = settings.theme

  if (settings.font === 'serif') root.removeAttribute('data-reading-font')
  else root.dataset.readingFont = settings.font
}
