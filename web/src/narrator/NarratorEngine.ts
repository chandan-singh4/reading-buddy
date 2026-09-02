/**
 * The narrator, on the page's side of the worker.
 *
 * `kokoro.worker.ts` makes the sound. This owns the worker, turns the samples
 * it sends back into scheduled audio, and hides both behind something small
 * enough for the reading screen to use.
 *
 * ## Why the audio is scheduled and not chained
 *
 * The obvious way to play a queue of clips is to start the next one when the
 * last one ends. It is also the way to get a gap between every sentence: an
 * `onended` handler runs on the main thread, at the mercy of whatever else is
 * on it, and the clip after it starts whenever that turn comes round. On a
 * phone mid-page-turn, that is tens of milliseconds, every sentence, audibly.
 *
 * So nothing is chained. Every clip is scheduled on the `AudioContext`'s own
 * clock, at the exact time the clip before it ends. The audio thread honours
 * those times whatever the main thread is doing, and the sentences meet
 * seamlessly. `onended` is still used — but only to *report* that a sentence
 * finished, never to start the next one.
 *
 * ## Why a job can be made before it is played
 *
 * Synthesis takes about as long as a short sentence takes to say. Made only
 * when needed, every sentence would begin with that delay. So the screen primes
 * the sentences it expects next: they are synthesised while the current one
 * plays and held, silent, until asked for. A primed sentence starts instantly.
 *
 * `held` is what makes that possible — a job exists in two states, made and
 * playing, and `play()` is the promotion.
 */

import { FALLBACK_VOICES, rosterOf, type NarratorVoice, type VoiceRecord } from './voices.ts'
import type { FromWorker, ToWorker } from './messages.ts'

export type NarratorState = 'idle' | 'loading' | 'ready' | 'failed'

export interface NarratorStatus {
  state: NarratorState
  /** Weights arriving: `0` to `1`, or `null` when the size is unknown. */
  progress: number | null
  device?: 'webgpu' | 'wasm'
  /** The model's own roster once it is up, this app's list until then. */
  roster: NarratorVoice[]
  /** Why the voice is unavailable, when it is. */
  problem?: string
}

/** How a caller names the sound it wants. */
export interface Saying {
  text: string
  voice: string
  speed: number
}

interface Job {
  id: number
  saying: Saying
  /** Clips made but not yet scheduled. Emptied when the job is played. */
  held: AudioBuffer[]
  playing: boolean
  /** The worker has no more audio for this job. */
  complete: boolean
  /**
   * Every clip of this job that is on the clock.
   *
   * All of them, not just the one being heard. A stop has to take the future
   * ones off too — they are already scheduled, and the audio thread will play
   * them on time whatever the page has since decided.
   */
  sources: AudioBufferSourceNode[]
  onEnd?: () => void
  onError?: (message: string) => void
}

/**
 * How far ahead of "now" a clip is allowed to be scheduled.
 *
 * Scheduling at `currentTime` exactly asks the audio thread to start something
 * in the past, which it renders as a click or drops. A few milliseconds of
 * headroom costs nothing a listener can hear and removes both.
 */
const LEAD = 0.02

/**
 * How many made-but-unplayed sentences may be kept.
 *
 * There has to be a cap, because a primed sentence is not always the one that
 * gets asked for. The reading screen cuts a sentence in two when it runs off
 * the page, so the half that is actually spoken is not the whole one that was
 * primed — and the whole one is then never claimed. Uncapped, an hour of
 * listening leaves an hour of orphaned audio in memory.
 *
 * Three is two sentences of lookahead and one for the cut to land on.
 */
const KEEP = 3

export class NarratorEngine {
  private worker: Worker | null = null
  private context: AudioContext | null = null

  private status: NarratorStatus = {
    state: 'idle',
    progress: null,
    roster: rosterOf(FALLBACK_VOICES),
  }

  private readonly watchers = new Set<(status: NarratorStatus) => void>()
  private readonly jobs = new Map<number, Job>()

  private nextId = 1
  /** The point on the audio clock where the next clip begins. */
  private nextAt = 0

  /** What the screen shows about the narrator right now. */
  get now(): NarratorStatus {
    return this.status
  }

  /** Tell me when that changes. Returns the way to stop being told. */
  watch(fn: (status: NarratorStatus) => void): () => void {
    this.watchers.add(fn)
    return () => {
      this.watchers.delete(fn)
    }
  }

  private announce(patch: Partial<NarratorStatus>): void {
    this.status = { ...this.status, ...patch }
    for (const fn of this.watchers) fn(this.status)
  }

  /**
   * Start loading the model.
   *
   * Safe to call as often as you like; the second call does nothing. Separate
   * from the constructor because *making* the engine happens when the reading
   * screen mounts and *loading* it should happen when a reader asks to be read
   * to — 86 MB is not something to spend because somebody opened a book.
   */
  wake(): void {
    this.boot().postMessage({ type: 'init' } satisfies ToWorker)
  }

  private boot(): Worker {
    if (this.worker) return this.worker

    this.worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.heard(event.data)
    this.announce({ state: 'loading' })
    return this.worker
  }

  /**
   * The `AudioContext`, made on first use.
   *
   * Made late on purpose. A context created before the reader has touched
   * anything starts `suspended` under every browser's autoplay rule, and a
   * suspended context silently swallows everything scheduled on it. Built here
   * — inside the gesture that asked for a voice — it starts running.
   */
  private audio(): AudioContext {
    if (!this.context) this.context = new AudioContext()
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  private heard(message: FromWorker): void {
    switch (message.type) {
      case 'loading':
        this.announce({ state: 'loading', progress: message.progress })
        return

      case 'ready':
        this.announce({
          state: 'ready',
          progress: 1,
          device: message.device,
          // The model's own roster replaces the built-in one here. See
          // `FALLBACK_VOICES`.
          roster: rosterOf(message.voices as VoiceRecord),
        })
        return

      case 'failed':
        this.announce({ state: 'failed', problem: message.message })
        return

      case 'chunk':
        this.received(message.job, message.samples, message.sampleRate)
        return

      case 'done': {
        const job = this.jobs.get(message.job)
        if (!job) return
        job.complete = true
        this.settle(job)
        return
      }

      case 'error': {
        const job = this.jobs.get(message.job)
        if (!job) return
        job.onError?.(message.message)
        // Treated as an empty sentence rather than as the end of the reading.
        // One sentence the model choked on must not stop a book.
        job.complete = true
        this.settle(job)
        return
      }
    }
  }

  private received(id: number, samples: Float32Array, sampleRate: number): void {
    const job = this.jobs.get(id)
    if (!job) return

    const context = this.audio()
    const buffer = context.createBuffer(1, samples.length, sampleRate)
    // Cast, because lib.dom types `copyToChannel` as taking a Float32Array
    // backed by a plain ArrayBuffer, and a transferred one is typed as backed
    // by `ArrayBufferLike`. The two are the same object here — the worker never
    // makes a SharedArrayBuffer.
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)

    if (!job.playing) {
      job.held.push(buffer)
      return
    }
    this.schedule(job, buffer)
  }

  private schedule(job: Job, buffer: AudioBuffer): void {
    const context = this.audio()
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)

    const at = Math.max(context.currentTime + LEAD, this.nextAt)
    source.start(at)
    this.nextAt = at + buffer.duration

    job.sources.push(source)
    this.settle(job)
  }

  /**
   * Report the end of a job, once there is an end to report.
   *
   * Called from several places because three things have to be true and they
   * can become true in any order: the job is playing, the worker has finished
   * with it, and its last clip is on the clock. A sentence primed early is
   * complete long before it is played; a long sentence is played long before it
   * is complete.
   */
  private settle(job: Job): void {
    if (!job.playing || !job.complete) return

    const last = job.sources[job.sources.length - 1]

    if (!last) {
      // Nothing was made — an empty sentence, or one the model failed on. Report
      // it done now, so the reading moves on instead of waiting for silence.
      this.finish(job)
      return
    }

    last.onended = () => this.finish(job)
  }

  private finish(job: Job): void {
    if (!this.jobs.has(job.id)) return
    this.jobs.delete(job.id)
    job.onEnd?.()
  }

  /**
   * Make a sentence now, to be played later. Returns its id.
   *
   * Nothing is heard. This is the whole of the lookahead: the screen calls it
   * for the two or three sentences after the one being read, and by the time
   * the voice reaches them they are already made.
   */
  prime(saying: Saying): number {
    this.evict()

    const id = this.nextId
    this.nextId += 1

    this.jobs.set(id, {
      id,
      saying,
      held: [],
      playing: false,
      complete: false,
      sources: [],
    })

    this.boot().postMessage({
      type: 'speak',
      job: id,
      text: saying.text,
      voice: saying.voice,
      speed: saying.speed,
    } satisfies ToWorker)

    return id
  }

  /**
   * Drop the oldest unclaimed sentences, so the lookahead cannot grow.
   *
   * Only unplayed ones, and never the newest: those are the ones about to be
   * asked for. See `KEEP`.
   */
  private evict(): void {
    const spare = [...this.jobs.values()].filter((job) => !job.playing)
    for (const job of spare.slice(0, Math.max(0, spare.length - KEEP + 1))) {
      this.jobs.delete(job.id)
      this.worker?.postMessage({ type: 'cancel', job: job.id } satisfies ToWorker)
    }
  }

  /** A job already made for exactly this, if there is one. */
  private waiting(saying: Saying): Job | undefined {
    for (const job of this.jobs.values()) {
      if (job.playing) continue
      if (
        job.saying.text === saying.text &&
        job.saying.voice === saying.voice &&
        job.saying.speed === saying.speed
      ) {
        return job
      }
    }
    return undefined
  }

  /**
   * Say it, using the primed job if one exists.
   *
   * The whole reason `prime` and `play` are one call from outside: the screen
   * asks for a sentence and does not care whether it was expected.
   */
  play(saying: Saying, told: { onEnd?: () => void; onError?: (message: string) => void }): number {
    const existing = this.waiting(saying)
    const job = existing ?? this.jobs.get(this.prime(saying))
    if (!job) return 0

    job.onEnd = told.onEnd
    job.onError = told.onError
    job.playing = true

    // A primed job has clips waiting. They go on the clock in the order they
    // were made, which is the order they were spoken in.
    const held = job.held
    job.held = []
    for (const buffer of held) this.schedule(job, buffer)

    this.settle(job)
    return job.id
  }

  /**
   * Stop everything and forget it.
   *
   * Every scheduled clip is stopped, not just the one being heard: they are all
   * already on the audio clock, and a clip scheduled for two seconds' time will
   * play on its own unless it is taken off.
   *
   * `onEnd` is deliberately not called for anything dropped here. A cancelled
   * sentence did not finish, and telling the caller it did is how a stop button
   * turns into a skip button.
   */
  stop(): void {
    for (const job of this.jobs.values()) {
      for (const source of job.sources) {
        // Handler off first. `stop()` fires `onended`, and a job reporting that
        // it finished because it was cancelled is exactly the fault this
        // ordering exists to prevent.
        source.onended = null
        source.stop()
      }
      job.sources = []
    }
    this.jobs.clear()
    this.worker?.postMessage({ type: 'cancelAll' } satisfies ToWorker)
    this.nextAt = this.context ? this.context.currentTime : 0
  }

  /** Give the worker and the audio hardware back. The screen is closing. */
  close(): void {
    this.stop()
    this.worker?.terminate()
    this.worker = null
    void this.context?.close()
    this.context = null
    this.watchers.clear()
  }
}
