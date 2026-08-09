import { useEffect, useState } from 'react'

import { useSession } from '../auth/useSession.ts'
import { isCloudConfigured, signOut } from '../storage/cloud/index.ts'
import { activeBackend, chooseBackend, deviceRepository, type Backend } from '../storage/index.ts'
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Coming</h2>
        <div className={styles.card}>
          <ul>
            <li>Appearance — day/night and reading type size (WP-14)</li>
            <li>Read-aloud voice (WP-16)</li>
            <li>Cost and usage (WP-27)</li>
            <li>An offline copy of the cloud library</li>
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
