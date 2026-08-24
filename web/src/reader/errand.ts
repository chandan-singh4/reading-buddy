/**
 * A question that outlives the panel it was asked from.
 *
 * ## Why this is not just a `useState` in the lamp
 *
 * The reader asks something, the model starts thinking, and then they do what
 * anyone does with a phone: close the panel, flick to another app, come back a
 * minute later. Every one of those unmounts the Study Lamp or hides the page.
 *
 * The ask itself was fine — `fetch` is not cancelled by a component going away
 * — but everything it fed was inside the component. `setMessages` on an
 * unmounted panel is dropped on the floor, and the save went through a
 * callback that gave up when the panel was closed. So the answer arrived,
 * found nobody home, and was thrown away. The reader came back to the question
 * they had asked and had to ask it again.
 *
 * So the ask lives here instead: in a module, which no re-render or unmount can
 * touch. The panel becomes one possible *watcher* of an errand rather than its
 * owner. Nothing about finishing an answer depends on anyone watching.
 *
 * ## What it does not promise
 *
 * This keeps an answer safe from React. It cannot keep it safe from the
 * operating system. A phone that is short of memory may freeze or discard a
 * backgrounded tab, and when that happens the connection goes with it — no web
 * page can prevent that, and any claim otherwise would be a lie told with a
 * progress bar.
 *
 * What is guaranteed is narrower and still worth having. As long as the tab is
 * alive, closing the panel, opening another book or looking at something else
 * does not cost the reader their answer. And when the tab *was* frozen, the ask
 * is made again by itself on the reader's return — they wait, but they are
 * never asked to press Retry on a question they have already asked.
 */

import {
  askTutor,
  type AskTutorReply,
  type AskTutorRequest,
  type TutorMessage,
  type TutorProgress,
} from './tutor.ts'

/**
 * What an errand leaves behind.
 *
 * The whole thread, not the bare reply. A panel that was closed while the
 * answer arrived has no idea what came before it — its own state went with it
 * — so the finished conversation has to be handed over complete.
 */
export interface ErrandResult {
  messages: TutorMessage[]
  /** Set when the ask failed. The question stays; this goes beside it. */
  failure?: string
  /** The answer to open at its first line, once it is drawn. */
  reveal?: number
}

/** An ask in flight, or one that has landed and is waiting to be collected. */
export interface Errand {
  /** The answer as it is being written. */
  progress: TutorProgress
  /** Set once, when the ask is done. Its presence is what "finished" means. */
  result?: ErrandResult
}

type Watcher = (errand: Errand) => void

/*
 * Both maps are keyed by passage, because that is what the reader thinks they
 * are asking about, and it is the one name that survives the panel being
 * rebuilt. A second question about the same passage replaces the first — which
 * is right: the lamp will not let two be in flight at once anyway.
 *
 * Watchers are held **apart from errands**, and that separation is the whole
 * trick. A panel subscribes when it opens, which is before any question has
 * been asked; if the subscription lived on the errand there would be nothing
 * to attach it to, and the panel would hear nothing about the question it went
 * on to ask. Keeping the two apart means the order does not matter.
 */
const errands = new Map<string, Errand>()
const watchers = new Map<string, Set<Watcher>>()
/*
 * Which ask currently speaks for a passage.
 *
 * An ask cannot be called back once it is in the air. When the reader retries a
 * question, or the panel is torn down and asks again, the old one is still out
 * there and will still come back with an answer — to a question nobody is
 * waiting on any more. Each ask holds a token, and only the ask holding the
 * current token may write. The rest land silently, which is what should happen
 * to an answer that has been superseded.
 */
const current = new Map<string, object>()

function tell(key: string): void {
  const errand = errands.get(key)
  if (!errand) return
  // Copied before the walk: a watcher is free to stop watching when it hears,
  // and a Set edited while it is being iterated is a bug waiting for a quiet
  // afternoon.
  for (const watcher of [...(watchers.get(key) ?? [])]) {
    /*
     * Each one is walled off. A watcher is React code, so one day one will
     * throw; without this, that one would swallow every watcher behind it in
     * the list and take the promise down with it. The errand is already saved
     * by the time this runs, so the worst a broken watcher can cost is its own
     * redraw.
     */
    try {
      watcher(errand)
    } catch (blew) {
      console.error('a watcher failed to hear an errand', blew)
    }
  }
}

/**
 * Ask, and keep asking whatever happens to the panel.
 *
 * `settle` turns the reply into the finished conversation **and saves it**. It
 * is called exactly once, whether or not anything is watching, and it must not
 * assume any component is still on screen. What it returns is kept for a panel
 * that comes back later to collect.
 */
export function askOnErrand(
  key: string,
  request: AskTutorRequest,
  settle: (reply: AskTutorReply) => ErrandResult,
): void {
  const token = {}
  current.set(key, token)
  const mine = () => current.get(key) === token

  errands.set(key, { progress: { text: '' } })

  /*
   * Whether the reader left the app while this was in the air.
   *
   * A phone that is short of memory freezes a backgrounded tab, and a frozen
   * tab's connection dies with it. Nothing in a web page can prevent that. What
   * a page *can* do is notice: an ask that failed while the reader was away
   * almost certainly failed *because* they were away, not because the model
   * refused. So it is asked again the moment they are back, rather than left as
   * a Retry button under the question they already asked.
   *
   * Once only. A second failure is a real one and is reported as itself.
   */
  const watchAway = typeof document !== 'undefined'
  let wentAway = watchAway && document.visibilityState === 'hidden'
  const noteAway = () => {
    if (document.visibilityState === 'hidden') wentAway = true
  }
  if (watchAway) document.addEventListener('visibilitychange', noteAway)

  const done = () => {
    if (watchAway) document.removeEventListener('visibilitychange', noteAway)
  }

  const run = (again: boolean) => {
    void askTutor(request, (progress) => {
      if (!mine()) return
      errands.set(key, { progress })
      tell(key)
    }).then((reply) => {
      if (!mine()) {
        done()
        return
      }

      if (reply.failed && wentAway && !again) {
        // Back from the freeze. Start over quietly: the reader's question is
        // still on screen and the answer simply resumes arriving under it.
        wentAway = false
        errands.set(key, { progress: { text: '' } })
        tell(key)
        run(true)
        return
      }

      done()
      /*
       * Saved first, told second. If a watcher throws — and a watcher is React
       * code, so one day it will — the answer is already on disk. The other way
       * round, a render error would cost the reader the answer, which is the
       * failure this whole file exists to prevent.
       */
      const result = settle(reply)
      errands.set(key, { progress: errands.get(key)?.progress ?? { text: '' }, result })
      tell(key)
    })
  }

  run(false)
}

/** The errand for this passage, live or landed. */
export function errandAt(key: string): Errand | undefined {
  return errands.get(key)
}

/**
 * Watch an errand, if there is one. Returns the way to stop.
 *
 * A panel calls this on mount so that reopening mid-answer shows the words
 * still arriving rather than an empty room.
 */
export function watchErrand(key: string, watcher: Watcher): () => void {
  let here = watchers.get(key)
  if (!here) {
    here = new Set()
    watchers.set(key, here)
  }
  here.add(watcher)
  return () => {
    here.delete(watcher)
    if (here.size === 0) watchers.delete(key)
  }
}

/**
 * Forget a landed errand.
 *
 * Called by whoever collected it. A live errand is left alone — dropping one
 * would lose the answer it is still writing, which is the opposite of the job.
 */
export function forgetErrand(key: string): void {
  if (errands.get(key)?.result) errands.delete(key)
}

/**
 * For tests, which must not inherit one another's errands.
 *
 * Clearing `current` is the part that matters: an ask already in the air cannot
 * be recalled, and without this it would come back during a later test and
 * write its answer into a panel that never asked anything.
 */
export function forgetAllErrands(): void {
  errands.clear()
  watchers.clear()
  current.clear()
}
