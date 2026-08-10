import { useCallback, useEffect, useRef, useState } from 'react'

import {
  copyLibrary,
  countBooksToCopy,
  type CopyProgress,
  type CopyResult,
  type Repository,
} from '../storage/index.ts'
import styles from './page.module.css'
import local from './LibraryCopy.module.css'

/**
 * Moving a shelf from one library to the other.
 *
 * ## Why this only appears while the cloud is switched on
 *
 * A copy needs to hold both libraries open at once, and the cloud one needs a
 * signed-in session. Standing in the cloud library is the only moment we have
 * both, so that is where the panel lives — and it reads naturally from there:
 * *here is the shelf you are looking at, and here is what is missing from it.*
 *
 * ## Why the button says a number
 *
 * "Copy my books" is a button you press hopefully. "Copy 32 books to the cloud"
 * is a button you press knowing what will happen — and when it says 0, it tells
 * you the two shelves already match without you having to run anything.
 */
export default function LibraryCopy({
  device,
  cloud,
}: {
  device: Repository
  cloud: Repository
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Copy books between the two libraries</h2>
      <div className={styles.card}>
        <p className={local.lede}>
          Importing a book puts it in whichever library is switched on, and only that
          one. This copies what’s missing the other way. Nothing is deleted on either
          side, and running it twice is safe — books already there are skipped.
        </p>
        <Direction
          from={device}
          to={cloud}
          label="to the cloud"
          idle="Up to date — the cloud has everything on this device."
        />
        <Direction
          from={cloud}
          to={device}
          label="to this device"
          idle="Up to date — this device has everything in the cloud."
        />
      </div>
    </section>
  )
}

type State =
  | { status: 'counting' }
  | { status: 'ready'; pending: number }
  | { status: 'running'; progress?: CopyProgress }
  | { status: 'done'; result: CopyResult }
  | { status: 'failed'; reason: string }

function Direction({
  from,
  to,
  label,
  idle,
}: {
  from: Repository
  to: Repository
  label: string
  idle: string
}) {
  const [state, setState] = useState<State>({ status: 'counting' })
  const abort = useRef<AbortController>(null)

  const recount = useCallback(() => {
    setState({ status: 'counting' })
    countBooksToCopy(from, to).then(
      (pending) => setState({ status: 'ready', pending }),
      (error: unknown) => setState({ status: 'failed', reason: messageFrom(error) }),
    )
  }, [from, to])

  useEffect(() => {
    let live = true
    setState({ status: 'counting' })
    countBooksToCopy(from, to).then(
      (pending) => {
        if (live) setState({ status: 'ready', pending })
      },
      (error: unknown) => {
        if (live) setState({ status: 'failed', reason: messageFrom(error) })
      },
    )
    return () => {
      live = false
      // Leaving the screen stops the run at the next book boundary. The books
      // already copied stay — that is the point of copying one at a time.
      abort.current?.abort()
    }
  }, [from, to])

  function start() {
    const controller = new AbortController()
    abort.current = controller
    setState({ status: 'running' })

    copyLibrary(from, to, {
      signal: controller.signal,
      onProgress: (progress) => setState({ status: 'running', progress }),
    }).then(
      (result) => setState({ status: 'done', result }),
      (error: unknown) => setState({ status: 'failed', reason: messageFrom(error) }),
    )
  }

  return (
    <div className={local.direction}>
      {state.status === 'counting' ? <p className={local.status}>Checking…</p> : null}

      {state.status === 'ready' ? (
        state.pending === 0 ? (
          <p className={local.status}>{idle}</p>
        ) : (
          <button type="button" className={styles.importButton} onClick={start}>
            Copy {countLabel(state.pending)} {label}
          </button>
        )
      ) : null}

      {state.status === 'running' ? <Running progress={state.progress} /> : null}

      {state.status === 'done' ? (
        <Done result={state.result} onAgain={recount} />
      ) : null}

      {state.status === 'failed' ? (
        <>
          <p className={styles.error}>{state.reason}</p>
          <button type="button" className={styles.importButton} onClick={recount}>
            Try again
          </button>
        </>
      ) : null}
    </div>
  )
}

function Running({ progress }: { progress?: CopyProgress }) {
  const done = progress?.done ?? 0
  const total = progress?.total ?? 0
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div
      className={local.progress}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Copying books"
    >
      <div className={local.track}>
        <div className={local.fill} style={{ width: `${percent}%` }} />
      </div>
      <p className={local.status}>
        {total === 0 ? 'Starting…' : `${done} of ${total} — ${progress?.title ?? ''}`}
      </p>
    </div>
  )
}

function Done({ result, onAgain }: { result: CopyResult; onAgain: () => void }) {
  const parts: string[] = []
  if (result.copied > 0) parts.push(`Copied ${countLabel(result.copied)}`)
  if (result.skipped > 0) parts.push(`${result.skipped} already there`)
  if (parts.length === 0) parts.push('Nothing to copy')

  return (
    <>
      <p className={local.status}>
        {result.cancelled ? 'Stopped. ' : ''}
        {parts.join(' · ')}.
      </p>

      {result.failed.length > 0 ? (
        <>
          {/* Named, not counted. "3 books failed" is a number you can do
              nothing with; a title is one you can go and look at. */}
          <p className={local.status}>
            {countLabel(result.failed.length)} couldn’t be copied. Everything else came
            across — try again and only these will be attempted.
          </p>
          <ul className={styles.failureList}>
            {result.failed.map((failure) => (
              <li key={failure.title}>
                <strong>{failure.title}</strong> — {failure.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <button type="button" className={styles.importButton} onClick={onAgain}>
        Check again
      </button>
    </>
  )
}

function countLabel(count: number): string {
  return count === 1 ? '1 book' : `${count} books`
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong copying your books.'
}
