/// <reference lib="webworker" />
/**
 * Where the voice is actually made.
 *
 * ## Why this is a worker and not a module
 *
 * Kokoro is an 82-million-parameter neural network. Running it on the main
 * thread would be correct, simple, and unusable: every sentence would freeze
 * the reading screen for as long as it took to synthesise. Not "stutter" —
 * freeze. Scrolling stops, the page turn stops, the tap that says *stop* is not
 * heard until the sentence the reader wanted to stop has finished rendering.
 *
 * So the model lives here, on its own thread, and the page only ever sends text
 * and receives samples. This is the whole reason the module is split in two.
 *
 * ## One model, one queue
 *
 * The instance is loaded once and never reloaded. Loading costs the weights
 * again, and the weights are 86 MB.
 *
 * Jobs run strictly one at a time. There is no parallelism to win — a single
 * model on a single thread is a single pipeline — and running them in order is
 * what lets the page schedule the audio it gets back without sorting it.
 *
 * ## Cancelling
 *
 * A cancelled job stops at its next chunk boundary and is dropped. It cannot
 * stop mid-chunk: the synthesis of one chunk is a single call into the model
 * and there is nothing to interrupt it with. That is why chunks are kept small
 * — the wasted work at a stop is bounded by one clause, not one paragraph.
 */

import { KokoroTTS, TextSplitterStream } from 'kokoro-js'

import type { FromWorker, ToWorker } from './messages.ts'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

const scope = self as unknown as DedicatedWorkerGlobalScope

function tell(message: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer)
}

/**
 * Can this browser really run on the GPU?
 *
 * Asks for an adapter, and the asking is the point. The obvious check is
 * `'gpu' in navigator`, and it is wrong in a way that only shows up on a real
 * machine: the object is present on browsers that expose the API and cannot
 * actually give you a device — a laptop with no supported GPU, a headless
 * browser, a phone with the feature behind a flag. This was not a theory. The
 * first run of this code reported `no available backend found. ERR: [webgpu]
 * Failed to get GPU adapter`, and the narrator failed instead of falling back.
 *
 * So the presence of the API buys nothing and an adapter is the only honest
 * answer. It costs one await, once, for the life of the worker.
 */
async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

/**
 * The two paths, and they are not the same precision on purpose.
 *
 * WebGPU has the memory and the throughput for `fp32`; a phone CPU running wasm
 * does not, and `q8` is the quantisation that keeps a sentence inside the time
 * a sentence takes to say.
 */
function dtypeFor(device: 'webgpu' | 'wasm'): 'fp32' | 'q8' {
  return device === 'webgpu' ? 'fp32' : 'q8'
}

/**
 * Load on `device`, and say so.
 *
 * Split out from `model` so the fallback below can call it twice without the
 * fallback itself having to know how loading works.
 */
function loadOn(device: 'webgpu' | 'wasm'): Promise<KokoroTTS> {
  return KokoroTTS.from_pretrained(MODEL, {
    device,
    dtype: dtypeFor(device),
    progress_callback: (event: unknown) => {
      const one = event as { status?: string; progress?: number }
      if (one?.status !== 'progress') return
      // `progress` arrives as a percentage. The page thinks in fractions, and
      // converting here keeps the unit in one place rather than in every bar
      // that ever draws it.
      tell({
        type: 'loading',
        progress: typeof one.progress === 'number' ? one.progress / 100 : null,
      })
    },
  })
}

let loading: Promise<KokoroTTS> | null = null

function model(): Promise<KokoroTTS> {
  if (loading) return loading

  loading = (async () => {
    const wanted: 'webgpu' | 'wasm' = (await hasGpu()) ? 'webgpu' : 'wasm'

    try {
      const tts = await loadOn(wanted)
      tell({ type: 'ready', device: wanted, voices: tts.voices })
      return tts
    } catch (error: unknown) {
      /*
       * The second chance, and it is not belt-and-braces.
       *
       * An adapter can be handed out and the model still refuse to run on it —
       * a driver the runtime will not touch, a device too small for the
       * weights, a browser that reports WebGPU and ships half of it. The check
       * above cannot see any of that; only trying can. Falling back to wasm
       * here turns every one of those into "slower" rather than "silent".
       */
      if (wanted === 'webgpu') {
        const tts = await loadOn('wasm')
        tell({ type: 'ready', device: 'wasm', voices: tts.voices })
        return tts
      }
      throw error
    }
  })().catch((error: unknown) => {
    tell({ type: 'failed', message: String((error as Error)?.message ?? error) })
    // Cleared, so a later attempt can try again. A model that failed once
    // because the phone was on a dead connection is not a model that is
    // broken forever.
    loading = null
    throw error
  })

  return loading
}

/** Jobs waiting their turn, oldest first. */
const queue: Extract<ToWorker, { type: 'speak' }>[] = []
/** Jobs the page has withdrawn. Checked at every chunk boundary. */
const dropped = new Set<number>()
let running = false

async function drain(): Promise<void> {
  if (running) return
  running = true

  try {
    while (queue.length > 0) {
      const job = queue.shift()
      if (!job || dropped.has(job.job)) continue
      await say(job)
    }
  } finally {
    running = false
  }
}

async function say(job: Extract<ToWorker, { type: 'speak' }>): Promise<void> {
  try {
    const tts = await model()
    if (dropped.has(job.job)) return

    /*
     * A splitter even though the page already sends one sentence.
     *
     * The page's idea of a sentence comes from the book, and a book contains
     * sentences of two hundred words. Handed to the model whole, the first
     * audio arrives only when the last clause has been rendered, and the reader
     * hears silence in the meantime. The splitter cuts it again, so the first
     * clause plays while the rest is still being made.
     *
     * On an ordinary sentence it splits into one piece and costs nothing.
     */
    const splitter = new TextSplitterStream()
    splitter.push(job.text)
    splitter.close()

    let index = 0
    for await (const piece of tts.stream(splitter, {
      /*
       * Cast, because kokoro-js types `voice` as a union of the ids in the
       * version it was published with. The roster is read from the model at run
       * time on purpose (see `voices.ts`), so a plain string is exactly what
       * this has, and a compile-time union of last year's ids is not a check
       * worth having.
       */
      voice: job.voice as never,
      speed: job.speed,
    })) {
      if (dropped.has(job.job)) return

      const samples = piece.audio.audio as Float32Array
      tell(
        {
          type: 'chunk',
          job: job.job,
          index,
          samples,
          sampleRate: piece.audio.sampling_rate,
        },
        // Transferred, not cloned. See `FromWorker.chunk`.
        [samples.buffer as ArrayBuffer],
      )
      index += 1
    }

    if (!dropped.has(job.job)) tell({ type: 'done', job: job.job })
  } catch (error: unknown) {
    if (dropped.has(job.job)) return
    tell({ type: 'error', job: job.job, message: String((error as Error)?.message ?? error) })
  } finally {
    dropped.delete(job.job)
  }
}

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data

  switch (message.type) {
    case 'init':
      void model().catch(() => {})
      return

    case 'speak':
      // A job cancelled and then re-sent under the same id would otherwise be
      // dropped on arrival. Clearing first makes re-use of an id safe.
      dropped.delete(message.job)
      // The head for a sentence somebody is waiting on, the tail for the
      // lookahead. See `ToWorker.speak.urgent`.
      if (message.urgent) queue.unshift(message)
      else queue.push(message)
      void drain()
      return

    case 'cancel':
      dropped.add(message.job)
      return

    case 'cancelAll':
      for (const job of queue) dropped.add(job.job)
      queue.length = 0
      return
  }
}
