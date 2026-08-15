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

import { clampDim } from './paperDim'

export type Theme =
  | 'auto'
  | 'paper'
  | 'vintage'
  | 'paperback'
  | 'light'
  | 'dark'
  | 'sepia'
  | 'dim'
  | 'slate'
  | 'forest'
  | 'contrast'
export type ReadingFont =
  | 'serif'
  | 'serif-alt'
  | 'sans'
  | 'literata'
  | 'garamond'
  | 'lora'
  | 'merriweather'
  | 'caslon'
  | 'inter'
  | 'atkinson'
  | 'dyslexic'

/**
 * Every theme, in the order the Aa tab offers them: the plain ones first, then
 * the tinted, then the accessibility one. A single list so the type, the
 * validator and the UI can never drift apart — adding a theme means adding it
 * here and writing its tokens in `theme.css`, and nothing else.
 */
export const THEMES: readonly { value: Theme; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'paperback', label: 'Paperback' },
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'dim', label: 'Dim' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'slate', label: 'Slate' },
  { value: 'forest', label: 'Forest' },
  { value: 'contrast', label: 'High contrast' },
]

/**
 * Every reading face. The three system stacks stay first and keep their names:
 * they cost nothing to load and they are what existing readers already have
 * selected, so they must not move or be renamed out from under a saved setting.
 */
export const READING_FONTS: readonly { value: ReadingFont; label: string; note?: string }[] = [
  { value: 'serif', label: 'Serif', note: 'System' },
  { value: 'serif-alt', label: 'Palatino', note: 'System' },
  { value: 'sans', label: 'Sans', note: 'System' },
  { value: 'literata', label: 'Literata', note: 'Made for reading' },
  { value: 'garamond', label: 'EB Garamond', note: 'Classic book' },
  { value: 'lora', label: 'Lora', note: 'Warm serif' },
  { value: 'caslon', label: 'Libre Caslon', note: 'Historical' },
  { value: 'merriweather', label: 'Merriweather', note: 'Modern paperback' },
  { value: 'inter', label: 'Inter', note: 'Modern sans' },
  { value: 'atkinson', label: 'Atkinson', note: 'Low vision' },
  { value: 'dyslexic', label: 'OpenDyslexic', note: 'Dyslexia' },
]
export type Spacing = 'compact' | 'normal' | 'relaxed'
export type Margins = 'narrow' | 'normal' | 'wide'

export interface ReaderSettings {
  theme: Theme
  font: ReadingFont
  /** 1–5, steps around the size the reading page has always used. */
  textStep: number
  spacing: Spacing
  margins: Margins
  /**
   * How far the paper is turned down, 0 to `MAX_DIM`. Set by dragging on the
   * right-hand deck rather than in the Aa tab — see `paperDim.ts` — but stored
   * here, because it is the same kind of thing as the theme and a reader who
   * dimmed the page last night expects it dim tonight.
   */
  dim: number
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  /*
   * Paper, not `auto`. The app's job is a book, and a book is not white — a
   * reader who never opens the Aa tab should get the page the reading screen
   * was designed around rather than the plainest thing available.
   *
   * Only ever seen by someone who has not chosen: a saved setting is read back
   * before this is consulted, so nobody's theme changes under them.
   */
  theme: 'paper',
  font: 'serif',
  textStep: 3,
  spacing: 'normal',
  margins: 'normal',
  /* Full brightness. The theme already decides what the paper is; this only
     ever takes light away from it, and taking light away is the reader's move
     to make. */
  dim: 0,
}

export const TEXT_STEPS = ['0.875rem', '1rem', '1.125rem', '1.3125rem', '1.5rem'] as const
export const MIN_TEXT_STEP = 1
export const MAX_TEXT_STEP = TEXT_STEPS.length

const SPACING_VALUES: Record<Spacing, string> = {
  compact: '1.4',
  normal: '1.7',
  relaxed: '2',
}

/**
 * The widest the text column is allowed to get. Narrow margins mean a wider
 * column, which is why the numbers run the other way from the names.
 *
 * This is a *cap*, and on a phone it never bites: the narrowest of the three is
 * still wider than a phone screen, so all three looked identical there. That is
 * what `GUTTER_VALUES` below is for — the cap shapes a wide window, the gutter
 * shapes a phone, and between them the setting does something everywhere.
 */
const MARGIN_VALUES: Record<Margins, string> = {
  narrow: '40rem',
  normal: '34rem',
  wide: '28rem',
}

/**
 * The space either side of the text, inside the page.
 *
 * The real margins control on a phone, where the cap above is irrelevant. Set
 * as padding on the blocks rather than on the page itself, deliberately: the
 * page is a column in a horizontal strip, and narrowing the *column* would
 * change how far one page turn travels. Padding leaves the pitch of the strip
 * exactly where it was and moves only the words inside it.
 */
const GUTTER_VALUES: Record<Margins, string> = {
  narrow: '1rem',
  normal: '1.75rem',
  wide: '2.75rem',
}

/** The line-height for a given spacing choice, as a CSS value. */
export function leadingOf(spacing: Spacing): string {
  return SPACING_VALUES[spacing]
}

/** The comfortable column width for a given margins choice, as a CSS value. */
export function measureOf(margins: Margins): string {
  return MARGIN_VALUES[margins]
}

/** The space either side of the text for a given margins choice. */
export function gutterOf(margins: Margins): string {
  return GUTTER_VALUES[margins]
}

/** The font size for a given step, clamped to the range that exists. */
export function textSizeOf(step: number): string {
  const clamped = Math.min(MAX_TEXT_STEP, Math.max(MIN_TEXT_STEP, Math.round(step)))
  return TEXT_STEPS[clamped - 1]
}

const KEY = 'reading-buddy:reader-settings'

// Both read from the lists above rather than repeating their members: a theme
// added there but forgotten here would be saveable and then silently rejected
// on the next read, which is a maddening bug to chase.
function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme.value === value)
}

function isFont(value: unknown): value is ReadingFont {
  return READING_FONTS.some((font) => font.value === value)
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
      // Clamped rather than rejected: the value comes from a drag, so an old
      // build with a wider range should come back as "as dark as we now go"
      // and not as "full brightness, and your setting is gone".
      dim: typeof parsed.dim === 'number' ? clampDim(parsed.dim) : DEFAULT_SETTINGS.dim,
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

  // On `<html>` with the theme, and for the same reason: it is a fact about
  // how bright this device should be, not about one screen. Written at boot so
  // a reader who dimmed the page last night does not get one bright frame
  // before React catches up.
  root.style.setProperty('--reader-dim', String(clampDim(settings.dim)))
}
