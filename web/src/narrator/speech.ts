/**
 * The narrator, wearing the shape the reading rules already expect.
 *
 * ## Why an adapter instead of a rewrite
 *
 * `AloudReader` decides what to say next. It knows things that took a while to
 * learn and are invisible in the code that uses it: that a sentence running off
 * the foot of a page must be cut in two so the page turns on the right word;
 * that `cancel()` fires `onend`, so every utterance has to carry the generation
 * it was made in or pressing stop starts the reading again; that pausing the
 * engine on Android is a trap and cancelling is the only safe pause.
 *
 * None of that is about *which* engine makes the sound. So swapping the browser
 * for a neural model is a swap of this one file — the rules stay, and so do
 * their fixes. A fresh controller would have had to earn all three bugs again.
 *
 * ## What does not survive the swap
 *
 * `pause` and `resume` become nothing. That is not a gap: `AloudReader.pause`
 * never asked the engine to pause — it cancels and says the sentence again from
 * its start on resume, for reasons written out on that method. The two calls
 * exist in the interface because `speechSynthesis` has them, and the neural
 * narrator has nothing for them to do.
 */

import type { SpeechLike, SpokenLike } from '../reader/readAloud.ts'
import type { NarratorEngine } from './NarratorEngine.ts'
import { DEFAULT_NARRATOR } from './voices.ts'

/**
 * One thing to say, as a plain object.
 *
 * `SpeechSynthesisUtterance` was a real browser object with a dozen members and
 * an event on every handler. This is the four fields the rules actually set.
 */
export function utteranceOf(text: string): SpokenLike {
  return { text, voice: null, rate: 1, onend: null, onerror: null }
}

/**
 * Drive the narrator through the reading rules' own interface.
 *
 * `speed` is the rate the rules were already carrying for the browser engine,
 * and Kokoro means the same thing by it, so nothing is converted.
 */
export function speechOf(engine: NarratorEngine): SpeechLike {
  return {
    speak(spoken: SpokenLike) {
      engine.play(
        {
          text: spoken.text,
          voice: spoken.voice?.id ?? DEFAULT_NARRATOR,
          speed: spoken.rate,
        },
        {
          onEnd: () => spoken.onend?.(),
          /*
           * `onerror` is deliberately not passed through.
           *
           * The rules set `onend` and `onerror` to the *same* function — move
           * on to the next sentence — because on a browser engine only one of
           * the two ever fires. This engine reports a failure and then reports
           * the sentence as finished, which through both handlers would skip
           * two sentences instead of one. The end is the one that matters, and
           * the failure is already logged where it happened.
           */
        },
      )
    },

    cancel() {
      engine.stop()
    },

    // See the note at the top: both are no-ops by design, not by omission.
    pause() {},
    resume() {},
  }
}
