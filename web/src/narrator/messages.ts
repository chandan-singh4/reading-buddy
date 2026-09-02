/**
 * What the page and the narrator's worker say to each other.
 *
 * A file of its own so the two halves cannot drift. A worker is the one place
 * in a TypeScript app where a wrong shape is invisible to the compiler on both
 * sides — `postMessage` takes `any` and the handler receives `any` — so the
 * only thing keeping them honest is that they both import this.
 */

import type { VoiceRecord } from './voices.ts'

/** Sent to the worker. */
export type ToWorker =
  | { type: 'init' }
  /**
   * Say one piece of text. `job` comes back on every reply about it.
   *
   * The id is the page's, not the worker's, because the page needs to talk
   * about a job before the worker has heard of it — cancelling a sentence that
   * is still sitting in the queue is the ordinary case, not the rare one.
   */
  | {
      type: 'speak'
      job: number
      text: string
      voice: string
      speed: number
      /**
       * Put this at the head of the queue, not the tail.
       *
       * Set when the reader is waiting on this exact sentence — a first play, a
       * skip, the half of a sentence after a page break. Without it, a sentence
       * somebody is waiting for is made *after* the two nobody has reached yet,
       * which is a wait of two whole sentences for no reason.
       */
      urgent?: boolean
    }
  /** Drop one job, whether it is running, queued, or already finished. */
  | { type: 'cancel'; job: number }
  /** Drop everything. What a reader pressing stop means. */
  | { type: 'cancelAll' }

/** Sent back to the page. */
export type FromWorker =
  /** The model's weights are arriving. `0` to `1`, or `null` when unknown. */
  | { type: 'loading'; progress: number | null }
  /**
   * The model is up. `device` says which path it took, for the diagnostics.
   *
   * `voices` is the model's own roster, which is the authority — see the note
   * on `FALLBACK_VOICES` for why the app carries a list of its own as well.
   */
  | { type: 'ready'; device: 'webgpu' | 'wasm'; voices: VoiceRecord }
  /** The model could not be loaded at all. The voice is unavailable. */
  | { type: 'failed'; message: string }
  /**
   * One piece of audio, ready to play.
   *
   * `samples` is transferred rather than copied. A minute of speech at 24 kHz
   * is nearly six megabytes of `Float32Array`, and structured-cloning that on
   * every sentence is a copy the phone pays for in dropped frames.
   */
  | { type: 'chunk'; job: number; index: number; samples: Float32Array; sampleRate: number }
  /** That job has no more audio coming. */
  | { type: 'done'; job: number }
  /** That job failed. The page treats it as an empty one and moves on. */
  | { type: 'error'; job: number; message: string }
