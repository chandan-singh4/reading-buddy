import { useEffect, useState } from 'react'

import { useSession } from '../auth/useSession.ts'
import {
  arrange,
  lastRoster,
  rememberSummaryPick,
  storedArrangement,
  storedSummaryPick,
} from '../reader/models.ts'
import { modelLabel } from '../reader/tutor.ts'
import { isCloudConfigured, signOut } from '../storage/cloud/index.ts'
import {
  activeBackend,
  chooseBackend,
  deviceRepository,
  repository,
  type Backend,
} from '../storage/index.ts'
import LibraryCopy from './LibraryCopy.tsx'
import styles from './page.module.css'
import local from './Settings.module.css'

/**
 * The one place a reader can see, and change, where their library lives.
 *
 * ## Why this shows a count of the *other* library
 *
 * Switching backends does not move a single book — see `storage/backend.ts`.
 * That is the safe design, but from the shelf it looks identical to having lost
 * everything: you flip the switch and thirty-two books are gone. So the option
 * that is *not* selected says how many books are waiting in it. It turns a
 * frightening blank shelf into an obviously reversible choice.
 */
export default function Settings() {
  const backend = activeBackend()
  const configured = isCloudConfigured()
  const session = useSession(backend === 'cloud')
  const deviceBooks = useDeviceBookCount()

  return (
    <>
      <h1 className={styles.title}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Where your library lives</h2>

        <div className={local.choices}>
          <BackendChoice
            kind="local"
            active={backend === 'local'}
            title="This device"
            description="Everything stays in this browser. Works with no signal, and nothing leaves the phone."
            note={deviceBooks === undefined ? undefined : booksHere(deviceBooks)}
          />
          <BackendChoice
            kind="cloud"
            active={backend === 'cloud'}
            disabled={!configured}
            title="The cloud"
            description="Books sync between your devices. Needs a signal — there is no offline copy yet."
            note={
              configured
                ? undefined
                : 'Not set up on this build. See docs/cloud-setup.md, then add the Supabase keys.'
            }
          />
        </div>

        <p className={local.reassure}>
          Switching only changes which library you’re looking at. Nothing is copied,
          moved or deleted, so you can switch back and find everything where you left
          it.
        </p>
      </section>

      {/* A copy needs both libraries open at once, and the cloud one needs a
          session — which makes this the only moment we have both. `repository`
          *is* the cloud one while the cloud is switched on, so no second
          connection is opened just to draw this. */}
      {backend === 'cloud' && session.status === 'signed-in' ? (
        <LibraryCopy device={deviceRepository} cloud={repository} />
      ) : null}

      {backend === 'cloud' && session.status === 'signed-in' ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <div className={styles.card}>
            <p className={local.account}>
              Signed in as <strong>{session.email ?? 'your account'}</strong>
            </p>
            <button
              type="button"
              className={styles.importButton}
              onClick={() => {
                void signOut().then(() => window.location.reload())
              }}
            >
              Sign out
            </button>
          </div>
        </section>
      ) : null}

      <SummaryModel />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Coming</h2>
        <div className={styles.card}>
          <ul>
            <li>Appearance — day/night and reading type size (WP-14)</li>
            <li>Cost and usage (WP-27)</li>
            <li>An offline copy of the cloud library (WP-58)</li>
          </ul>
        </div>
      </section>
    </>
  )
}

function booksHere(count: number): string {
  if (count === 0) return 'No books here'
  return count === 1 ? '1 book here' : `${count} books here`
}

function BackendChoice({
  kind,
  active,
  title,
  description,
  note,
  disabled = false,
}: {
  kind: Backend
  active: boolean
  title: string
  description: string
  note?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={local.choice}
      aria-pressed={active}
      disabled={disabled || active}
      onClick={() => chooseBackend(kind)}
    >
      <span className={local.choiceTitle}>
        {title}
        {active ? <span className={local.badge}>In use</span> : null}
      </span>
      <span className={local.choiceBody}>{description}</span>
      {note ? <span className={local.choiceNote}>{note}</span> : null}
    </button>
  )
}

/**
 * How many books are in the browser's own database, whichever backend is on.
 *
 * `undefined` until it is known, so the label appears when it has an answer
 * rather than flashing "No books here" at someone who has thirty-two.
 */
function useDeviceBookCount(): number | undefined {
  const [count, setCount] = useState<number>()

  useEffect(() => {
    let live = true
    deviceRepository.listBooks().then(
      (books) => {
        if (live) setCount(books.length)
      },
      () => {
        // Storage blocked or unavailable. The count is a reassurance, not a
        // feature — its absence is better than an error on a settings screen.
      },
    )
    return () => {
      live = false
    }
  }, [])

  return count
}

/**
 * Which model writes the chapter summaries.
 *
 * Kept apart from the lamp's model on purpose. They are different jobs: the
 * lamp answers a reader mid-paragraph and speed is most of the experience,
 * while a summary runs in the background, once per chapter, with nobody waiting
 * on it. A reader should be free to spend the slower, stronger model here and a
 * quick one there.
 *
 * The roster is the one the app last saw rather than a fresh fetch. This screen
 * has no lamp open and should not open a network call to draw a menu; the list
 * is refreshed every time the reader uses Veda.
 */
function SummaryModel() {
  const columns = arrange(lastRoster(), storedArrangement())
  const models = columns.flatMap((column) => column.models)
  const [pick, setPick] = useState<string>(() => storedSummaryPick() ?? '')

  // Nothing to choose from until the reader has opened the lamp once. Drawing
  // an empty menu would be worse than drawing nothing.
  if (models.length === 0) return null

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>The model that writes your summaries</h2>
      <div className={styles.card}>
        <p>
          Summaries run in the background, so a slower and stronger model costs you no waiting.
          Veda keeps its own model, which you pick under the lamp.
        </p>
        <label className={local.modelRow}>
          <span>Summary model</span>
          <select
            value={pick}
            onChange={(event) => {
              const next = event.target.value
              setPick(next)
              rememberSummaryPick(next === '' ? undefined : next)
            }}
          >
            <option value="">Same as Veda</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name || modelLabel(model.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
