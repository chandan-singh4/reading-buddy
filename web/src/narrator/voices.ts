/**
 * The narrator's voices.
 *
 * Kokoro ships its roster inside the model package rather than on the device,
 * which is the whole reason this file exists. The old reading voice came from
 * `speechSynthesis.getVoices()` — a different list on every phone, with names
 * like "Microsoft Zira Desktop" that mean nothing to a reader and change when
 * the OS updates. This list is the same on every device the app runs on, so a
 * voice chosen on a laptop is the same voice on the phone.
 *
 * ## Why the roster is read, not written down
 *
 * The obvious thing is a constant array of 28 ids. It would be wrong within one
 * model release: the roster moves between versions, and a hardcoded list either
 * offers a voice the model no longer has or hides one it gained. So the ids come
 * from the model itself at run time and only the two *defaults* are named here.
 *
 * The one thing that is written down is what to do when a saved id is gone —
 * see `resolveVoice`. A reader who chose a voice a year ago must not open the
 * app to silence.
 */

/** One voice the model can speak in. */
export interface NarratorVoice {
  /** The model's own id, e.g. `af_heart`. This is what gets stored. */
  id: string
  /** What to call it on screen, e.g. "Heart". */
  name: string
  /** A BCP-47-ish tag as the model reports it, e.g. `en-us`. */
  language: string
  gender: string
  /** The model's own quality letter. Shown, because the spread is real. */
  grade?: string
}

/** The shape kokoro-js exposes as `tts.voices`. Read structurally, not by name. */
export type VoiceRecord = Readonly<
  Record<string, { name?: string; language?: string; gender?: string; overallGrade?: string }>
>

/**
 * The voice that reads books, until the reader chooses another.
 *
 * `af_heart` is the only voice the model grades A on both counts, and a book is
 * hours of listening — the one place in the app where the best voice, not the
 * most interesting one, is the right default.
 */
export const DEFAULT_NARRATOR = 'af_heart'

/**
 * Veda's voice, and it is hers alone.
 *
 * The same rule as her violet: one identity, never shared with the book. A
 * tutor who sounds exactly like the narrator is a tutor the listener cannot
 * tell from the author, and the whole point of her is that she is a second
 * person in the room.
 *
 * British where the narrator default is American, so the two are apart at the
 * first syllable rather than at the third sentence.
 */
export const VEDA_VOICE = 'bf_emma'

/**
 * The roster as of kokoro-js 1.2.1, used only until the model says otherwise.
 *
 * ## Why a hardcoded list exists after all
 *
 * The rule above still holds: the model is the authority, and `NarratorEngine`
 * replaces this the moment the real roster arrives. But the model is 86 MB, and
 * a reader who opens Settings on a fresh install must not be told to download
 * an audiobook engine before they are allowed to see which voices it has. So
 * the picker is drawn from this, and corrected in place a moment later.
 *
 * If the two ever disagree, the model wins and this is stale. That is a
 * cosmetic fault for one screen, not a broken narrator: `resolveVoice` runs
 * against the *real* roster, so a voice listed here and gone from the model
 * falls back rather than failing.
 */
export const FALLBACK_VOICES: VoiceRecord = {
  af_heart: { name: 'Heart', language: 'en-us', gender: 'Female', overallGrade: 'A' },
  af_alloy: { name: 'Alloy', language: 'en-us', gender: 'Female', overallGrade: 'C' },
  af_aoede: { name: 'Aoede', language: 'en-us', gender: 'Female', overallGrade: 'C+' },
  af_bella: { name: 'Bella', language: 'en-us', gender: 'Female', overallGrade: 'A-' },
  af_jessica: { name: 'Jessica', language: 'en-us', gender: 'Female', overallGrade: 'D' },
  af_kore: { name: 'Kore', language: 'en-us', gender: 'Female', overallGrade: 'C+' },
  af_nicole: { name: 'Nicole', language: 'en-us', gender: 'Female', overallGrade: 'B-' },
  af_nova: { name: 'Nova', language: 'en-us', gender: 'Female', overallGrade: 'C' },
  af_river: { name: 'River', language: 'en-us', gender: 'Female', overallGrade: 'D' },
  af_sarah: { name: 'Sarah', language: 'en-us', gender: 'Female', overallGrade: 'C+' },
  af_sky: { name: 'Sky', language: 'en-us', gender: 'Female', overallGrade: 'C-' },
  am_adam: { name: 'Adam', language: 'en-us', gender: 'Male', overallGrade: 'F+' },
  am_echo: { name: 'Echo', language: 'en-us', gender: 'Male', overallGrade: 'D' },
  am_eric: { name: 'Eric', language: 'en-us', gender: 'Male', overallGrade: 'D' },
  am_fenrir: { name: 'Fenrir', language: 'en-us', gender: 'Male', overallGrade: 'C+' },
  am_liam: { name: 'Liam', language: 'en-us', gender: 'Male', overallGrade: 'D' },
  am_michael: { name: 'Michael', language: 'en-us', gender: 'Male', overallGrade: 'C+' },
  am_onyx: { name: 'Onyx', language: 'en-us', gender: 'Male', overallGrade: 'D' },
  am_puck: { name: 'Puck', language: 'en-us', gender: 'Male', overallGrade: 'C+' },
  am_santa: { name: 'Santa', language: 'en-us', gender: 'Male', overallGrade: 'D-' },
  bf_emma: { name: 'Emma', language: 'en-gb', gender: 'Female', overallGrade: 'B-' },
  bf_isabella: { name: 'Isabella', language: 'en-gb', gender: 'Female', overallGrade: 'C' },
  bm_george: { name: 'George', language: 'en-gb', gender: 'Male', overallGrade: 'C' },
  bm_lewis: { name: 'Lewis', language: 'en-gb', gender: 'Male', overallGrade: 'D+' },
  bf_alice: { name: 'Alice', language: 'en-gb', gender: 'Female', overallGrade: 'D' },
  bf_lily: { name: 'Lily', language: 'en-gb', gender: 'Female', overallGrade: 'D' },
  bm_daniel: { name: 'Daniel', language: 'en-gb', gender: 'Male', overallGrade: 'D' },
  bm_fable: { name: 'Fable', language: 'en-gb', gender: 'Male', overallGrade: 'C' },
}

/** The model's roster, as a list this app can render. Sorted by name. */
export function rosterOf(voices: VoiceRecord | undefined): NarratorVoice[] {
  if (!voices) return []
  return Object.entries(voices)
    .map(([id, one]) => ({
      id,
      name: one.name || id,
      language: (one.language || '').toLowerCase(),
      gender: one.gender || '',
      ...(one.overallGrade ? { grade: one.overallGrade } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A named group of voices, as the picker draws them. */
export interface VoiceGroup {
  label: string
  voices: NarratorVoice[]
}

/**
 * What each language tag is called in English.
 *
 * Only the two the model speaks today have entries. The rest of the table is
 * the point: Kokoro's roster has grown once already, and the day it gains
 * Spanish the picker should say "Spanish", not "es".
 */
const LANGUAGES: Record<string, string> = {
  'en-us': 'American',
  'en-gb': 'British',
  'es-es': 'Spanish',
  'fr-fr': 'French',
  'hi-in': 'Hindi',
  'it-it': 'Italian',
  'ja-jp': 'Japanese',
  'pt-br': 'Brazilian Portuguese',
  'zh-cn': 'Mandarin',
}

/**
 * Group the roster by accent, because accent is what a reader is choosing.
 *
 * Not by gender, and not by the model's grade. A listener picking a narrator
 * for a book decides "British or American" first and everything else second —
 * ask anyone who has abandoned an audiobook over the wrong accent.
 *
 * The order is the roster's order of first appearance, so the default's own
 * group leads. Anything with a tag this app has no name for is grouped under
 * the tag itself rather than dropped: an unnamed voice is still a voice.
 */
export function groupsOf(roster: readonly NarratorVoice[]): VoiceGroup[] {
  const groups = new Map<string, VoiceGroup>()

  for (const voice of roster) {
    const key = voice.language || 'other'
    const existing = groups.get(key)
    if (existing) {
      existing.voices.push(voice)
      continue
    }
    groups.set(key, { label: LANGUAGES[key] ?? key.toUpperCase(), voices: [voice] })
  }

  return [...groups.values()]
}

/**
 * The voice to actually speak in, given what the reader once chose.
 *
 * Three answers, in order: the saved voice if the model still has it, the
 * default if the model has that, and the first voice in the roster if it has
 * neither. The last case is not paranoia — it is what happens the first time
 * this app meets a model release that renamed everything, and the alternative
 * to a fallback there is a reader pressing play and hearing nothing.
 *
 * `changed` says the choice was not honoured, so the screen can say so quietly
 * instead of pretending. Nothing loud: the reader asked to be read to, not to
 * be told about a roster.
 */
export function resolveVoice(
  roster: readonly NarratorVoice[],
  saved: string | undefined,
): { id: string | undefined; changed: boolean } {
  if (roster.length === 0) return { id: saved, changed: false }

  const has = (id: string | undefined) => !!id && roster.some((one) => one.id === id)

  if (has(saved)) return { id: saved, changed: false }
  if (has(DEFAULT_NARRATOR)) return { id: DEFAULT_NARRATOR, changed: !!saved }
  return { id: roster[0]?.id, changed: !!saved }
}
