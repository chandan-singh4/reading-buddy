/**
 * What "Aa" opens: the reading-comfort controls, rebuilt.
 *
 * The old panel was five stacked rows of small pill buttons — every setting
 * shown at once, each one named in words. It worked, and it read like a form.
 * This is the same five settings arranged the way a reading app arranges them:
 *
 * - **Three tabs** — Text, Themes, Margins — so the panel is short enough to
 *   see without scrolling, and so "change the font" and "change the colours"
 *   are not the same visual problem.
 * - **Sliders** for the two settings that are really a dial with an order to it
 *   (size, line spacing). A row of three buttons hides the fact that "compact"
 *   and "relaxed" are two ends of one thing.
 * - **Swatches** for themes. "Sepia" is a word for a colour; showing the colour
 *   skips the translation.
 * - **A drawn page** for margins, because the setting is about a shape, and no
 *   arrangement of the words narrow/normal/wide describes a shape.
 *
 * ## Getting out of the way while you drag
 *
 * The point of these controls is the text behind them, and a sheet covering the
 * bottom two thirds of the screen is covering most of the evidence. So while a
 * slider is being dragged the rest of the panel fades out and the sheet's own
 * background goes with it: what is left is the one control under your thumb, a
 * small pill saying where it is now, and the book, live, changing as you move.
 * Let go and the panel comes back.
 *
 * Presentational, like `Chrome` itself: handed the settings, told what to call.
 * The only state it owns is which tab is showing and whether a drag is in
 * progress, both of which are about this panel and nothing else.
 */

import { useState } from 'react'

import {
  MAX_TEXT_STEP,
  MIN_TEXT_STEP,
  READING_FONTS,
  THEMES,
  type Margins,
  type ReaderSettings,
  type Spacing,
} from './readerSettings.ts'
import {
  HIGHLIGHTER_CHOICES,
  resolveHighlighter,
  type HighlighterChoice,
} from './highlightStyle.ts'
import styles from './TextSettings.module.css'

/** Which group of settings is showing. */
type Pane = 'text' | 'mode' | 'margins'

/*
 * The third tab is named after the one thing in it. It was called "More",
 * which is a promise of several things and a tab you have to open to find out
 * what is behind it — for a single setting that is a worse label than the
 * setting's own name. If a second margin-ish control ever joins it, that is the
 * moment to reconsider, not before.
 */
const PANES: readonly { id: Pane; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'mode', label: 'Themes' },
  { id: 'margins', label: 'Margins' },
]

/*
 * The two settings that are stored as words but behave as a scale. A slider
 * speaks in numbers, so each list is also the mapping between the two — index
 * plus one going out, `[value - 1]` coming back.
 */
const SPACING_ORDER: readonly Spacing[] = ['compact', 'normal', 'relaxed']
const SPACING_NAMES: Record<Spacing, string> = {
  compact: 'Tight',
  normal: 'Normal',
  relaxed: 'Airy',
}

const MARGIN_ORDER: readonly Margins[] = ['narrow', 'normal', 'wide']
const MARGIN_NAMES: Record<Margins, string> = {
  narrow: 'Narrow',
  normal: 'Normal',
  wide: 'Wide',
}

/** Which slider is currently being dragged, if any — what fades everything else. */
type Adjusting = null | 'size' | 'spacing' | 'margins'

export interface TextSettingsProps {
  settings: ReaderSettings
  onSettingsChange: (patch: Partial<ReaderSettings>) => void
  /**
   * How highlights are painted in this book, and how to change it.
   *
   * Both optional. The setting is kept per book rather than in `settings`, so a
   * caller with no book open — and the panel's own tests — simply leave the
   * control out.
   */
  highlighter?: HighlighterChoice
  onHighlighterChange?: (choice: HighlighterChoice) => void
  /**
   * The voices this device offers for reading the book out loud (WP-16).
   *
   * Optional, and for the same reason the highlighter is: the list comes from
   * the browser's speech engine, which a caller without one — a test, a screen
   * with no book open — has no way to supply. Left out, the row is not drawn.
   */
  voices?: readonly SpeechSynthesisVoice[]
}

export function TextSettings({
  settings,
  onSettingsChange,
  highlighter,
  onHighlighterChange,
  voices,
}: TextSettingsProps) {
  const [pane, setPane] = useState<Pane>('text')
  const [adjusting, setAdjusting] = useState<Adjusting>(null)

  /**
   * Everything a slider needs to say "I am the one being moved".
   *
   * Pointer *and* focus, because a slider is also a keyboard control: arrow
   * keys move it with no pointer involved, and a reader doing that deserves the
   * same clear view of the text as a reader dragging it.
   */
  const grip = (which: Exclude<Adjusting, null>) => ({
    onPointerDown: () => setAdjusting(which),
    onPointerUp: () => setAdjusting(null),
    onPointerCancel: () => setAdjusting(null),
    onFocus: () => setAdjusting(which),
    onBlur: () => setAdjusting(null),
  })

  /** The pill that floats over the book while a slider is moving. */
  const readout =
    adjusting === 'size'
      ? `Size ${settings.textStep}`
      : adjusting === 'spacing'
        ? SPACING_NAMES[settings.spacing]
        : adjusting === 'margins'
          ? MARGIN_NAMES[settings.margins]
          : null

  /** A row dims when a *different* row is the one being dragged. */
  const dim = (which: Adjusting) =>
    adjusting !== null && adjusting !== which ? 'true' : undefined

  return (
    <div className={styles.panel} data-adjusting={adjusting !== null ? 'true' : undefined}>
      {readout && (
        <p className={styles.readout} role="status">
          {readout}
        </p>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Reading mode" data-dimmed={dim(null)}>
        {PANES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={pane === option.id}
            onClick={() => setPane(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {pane === 'text' && (
        <div className={styles.pane} role="tabpanel">
          {/*
            The faces, each one set in itself and led by a big `Aa`. The name
            underneath is the label; the `Aa` is the actual information.
          */}
          <div className={styles.row} data-dimmed={dim(null)}>
            <span className={styles.rowLabel}>Font</span>
            <div className={styles.faces} role="group" aria-label="Reading font">
              {READING_FONTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.face}
                  data-face={option.value}
                  aria-pressed={settings.font === option.value}
                  onClick={() => onSettingsChange({ font: option.value })}
                >
                  <span className={styles.faceSpecimen} aria-hidden="true">
                    Aa
                  </span>
                  <span className={styles.faceName}>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/*
            Size and spacing, as dials. The small and large `A` either side are
            the scale — a slider with nothing at its ends is a slider you have
            to drag once to understand.
          */}
          <div className={styles.row} data-dimmed={dim('size')}>
            <span className={styles.rowLabel}>Text size</span>
            <div className={styles.slide}>
              <span className={styles.slideEnd} aria-hidden="true">
                A
              </span>
              <input
                className={styles.slider}
                type="range"
                min={MIN_TEXT_STEP}
                max={MAX_TEXT_STEP}
                step={1}
                value={settings.textStep}
                aria-label="Text size"
                aria-valuetext={`Size ${settings.textStep} of ${MAX_TEXT_STEP}`}
                onChange={(event) =>
                  onSettingsChange({ textStep: Number(event.target.value) })
                }
                {...grip('size')}
              />
              <span className={`${styles.slideEnd} ${styles.slideEndBig}`} aria-hidden="true">
                A
              </span>
            </div>
          </div>

          <div className={styles.row} data-dimmed={dim('spacing')}>
            <span className={styles.rowLabel}>Line spacing</span>
            <div className={styles.slide}>
              <span className={styles.lines} data-lines="tight" aria-hidden="true" />
              <input
                className={styles.slider}
                type="range"
                min={1}
                max={SPACING_ORDER.length}
                step={1}
                value={SPACING_ORDER.indexOf(settings.spacing) + 1}
                aria-label="Line spacing"
                aria-valuetext={SPACING_NAMES[settings.spacing]}
                onChange={(event) =>
                  onSettingsChange({ spacing: SPACING_ORDER[Number(event.target.value) - 1] })
                }
                {...grip('spacing')}
              />
              <span className={styles.lines} data-lines="airy" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      {pane === 'mode' && (
        <div className={styles.pane} role="tabpanel">
          {/*
            Themes as the colours they are. Each swatch is painted in that
            theme's own page and ink, so the choice is made by looking rather
            than by remembering what "Dim" turned out to mean last time.
          */}
          {/* No row label, for the reason the margins pane has none: the tab
              above already says it, and there is nothing else in here. */}
          <div className={styles.row}>
            <div className={styles.swatches} role="group" aria-label="Theme">
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.swatch}
                  data-swatch={option.value}
                  aria-pressed={settings.theme === option.value}
                  aria-label={option.label}
                  onClick={() => onSettingsChange({ theme: option.value })}
                >
                  <span className={styles.swatchChip} aria-hidden="true">
                    Aa
                  </span>
                  <span className={styles.swatchName}>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/*
            The highlighter, under the themes and not beside them.

            It belongs on this tab because it is the same kind of choice — how
            the page looks, not what it says — and because its default follows
            the theme directly above it: a paper theme gets marker strokes, a
            flat one gets a clean wash.

            Two buttons, no Auto. A book nobody has set still starts from the
            theme, so the button that is lit is the look on the page. Tapping
            either one settles it for this book and is never overwritten.
          */}
          {highlighter && onHighlighterChange && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Highlighter</span>
              <div className={styles.choices} role="group" aria-label="Highlighter style">
                {HIGHLIGHTER_CHOICES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={styles.choice}
                    aria-pressed={resolveHighlighter(highlighter, settings.theme) === option.value}
                    onClick={() => onHighlighterChange(option.value)}
                  >
                    <span className={styles.choiceMark} data-style={option.value} aria-hidden="true">
                      Aa
                    </span>
                    <span className={styles.choiceName}>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/*
            The reading voice.

            A plain `<select>`, and deliberately so. A device can offer forty
            voices, the names are the system's own — "Microsoft Zira", "Daniel"
            — and no set of buttons makes that list better. The phone already
            draws a good picker for a long list, and this is the one control in
            the panel where the platform's own is the right one.

            Chosen here rather than on the transport bar: it is decided once,
            and the bar has to stay small enough to use without looking.
          */}
          {voices && voices.length > 0 && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Reading voice</span>
              <select
                className={styles.picker}
                value={settings.aloudVoice ?? ''}
                aria-label="Reading voice"
                onChange={(event) =>
                  onSettingsChange(
                    // An empty choice clears the setting rather than storing an
                    // empty name: "this device's own voice" is the absence of a
                    // choice, and it has to survive being chosen again.
                    event.target.value
                      ? { aloudVoice: event.target.value }
                      : { aloudVoice: undefined },
                  )
                }
              >
                <option value="">This device’s voice</option>
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {pane === 'margins' && (
        <div className={styles.pane} role="tabpanel">
          {/*
            Margins, drawn. The rectangle is a page with lines of type on it and
            the chosen gutter either side, so the setting is previewed at the
            moment it is chosen instead of after the sheet has been dismissed.
          */}
          {/* No row label: the tab above it already says "Margins", and this
              pane holds nothing else to tell it apart from. */}
          <div className={styles.row} data-dimmed={dim('margins')}>
            <div className={styles.page} data-width={settings.margins} aria-hidden="true">
              <span className={styles.pageInk}>
                {Array.from({ length: 7 }, (_, index) => (
                  <span key={index} className={styles.pageLine} />
                ))}
              </span>
            </div>

            <div className={styles.slide}>
              <input
                className={styles.slider}
                type="range"
                min={1}
                max={MARGIN_ORDER.length}
                step={1}
                value={MARGIN_ORDER.indexOf(settings.margins) + 1}
                aria-label="Margins"
                aria-valuetext={MARGIN_NAMES[settings.margins]}
                onChange={(event) =>
                  onSettingsChange({ margins: MARGIN_ORDER[Number(event.target.value) - 1] })
                }
                {...grip('margins')}
              />
            </div>
            <p className={styles.hint}>{MARGIN_NAMES[settings.margins]}</p>
          </div>
        </div>
      )}
    </div>
  )
}
