/**
 * Keep the screen awake while a book is open.
 *
 * The phone dims and then locks on its own idle timer, and reading is the one
 * activity that produces no taps for minutes at a time. So the phone concludes
 * nobody is there, exactly when somebody is. Reported 2026-08-25: "the light
 * dims and then the screen locks, and I have to unlock it to start reading
 * again."
 *
 * ## The lock is not something you hold, it is something you keep re-taking
 *
 * A screen wake lock is released by the browser whenever the page stops being
 * visible — a notification shade, a call, the reader flicking to another app.
 * It is *not* given back when the page returns. A one-shot `request()` at open
 * therefore works until the first interruption and silently stops working
 * after it, which is the harder bug to spot: it fails later, and only
 * sometimes. So this listens for `visibilitychange` and takes the lock again.
 *
 * ## Nothing here throws
 *
 * The API is missing on older iOS and on Firefox, and `request()` rejects on a
 * phone in low-power mode. None of that is worth an error in a reading app: the
 * screen behaves as it did before, which is what happens today anyway. Every
 * path resolves.
 */

/** The slice of `navigator` this uses, so a test can hand in its own. */
export interface WakeLockCapable {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockLike> }
}

/** The slice of `WakeLockSentinel` this uses. */
export interface WakeLockLike {
  release(): Promise<void>
}

/** The slice of `document` this uses. */
export interface VisibilityCapable {
  visibilityState: string
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

/**
 * Hold a screen wake lock until the returned function is called.
 *
 * Call it when a book opens; call the result when the book closes. Safe to call
 * where the API does not exist — it returns a release function that does
 * nothing, so the caller needs no branch of its own.
 */
export function keepScreenAwake(
  navigatorLike: WakeLockCapable = navigator,
  documentLike: VisibilityCapable = document,
): () => void {
  const api = navigatorLike.wakeLock
  if (!api) return () => {}

  let held: WakeLockLike | null = null
  /* Set by the release function. Every `take` checks it after its await,
   * because the reader can close the book while a request is still in flight,
   * and a lock that arrives after that would never be released. */
  let done = false

  const take = async () => {
    if (done || held || documentLike.visibilityState !== 'visible') return
    try {
      const sentinel = await api.request('screen')
      if (done) {
        void sentinel.release()
        return
      }
      held = sentinel
    } catch {
      /* Low-power mode, or a browser that offers the API and then refuses it.
       * The screen keeps its own timer, which is the behaviour before this
       * module existed. */
    }
  }

  const onVisible = () => {
    /* The browser dropped the lock when the page hid. Take it again, and let go
     * of the stale sentinel first so `take` does not think it still holds one. */
    held = null
    void take()
  }

  documentLike.addEventListener('visibilitychange', onVisible)
  void take()

  return () => {
    done = true
    documentLike.removeEventListener('visibilitychange', onVisible)
    void held?.release()
    held = null
  }
}
