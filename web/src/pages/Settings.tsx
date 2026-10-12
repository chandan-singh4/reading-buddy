import { useState } from 'react'

import { useSession } from '../auth/useSession.ts'
import ExportVault from '../export/ExportVault.tsx'
import RestoreVault from '../export/RestoreVault.tsx'
import {
  arrange,
  lastRoster,
  rememberSummaryPick,
  storedArrangement,
  storedSummaryPick,
} from '../reader/models.ts'
import { modelLabel } from '../reader/tutor.ts'
import { signOut } from '../storage/cloud/index.ts'
import { activeBackend } from '../storage/index.ts'
import styles from './page.module.css'
import local from './Settings.module.css'

/**
 * The reader's account, the summary model, and the way in and out of Obsidian.
 *
 * There is no "where your library lives" any more. The library is the cloud's,
 * and the browser keeps only an offline copy it can fetch again — see
 * `storage/backend.ts` for why the choice was taken away.
 */
export default function Settings() {
  const backend = activeBackend()
  const session = useSession(backend === 'cloud')

  return (
    <>
      <h1 className={styles.title}>Settings</h1>

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

      <ExportVault />

      <RestoreVault />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Coming</h2>
        <div className={styles.card}>
          <ul>
            <li>Appearance — day/night and reading type size (WP-14)</li>
            <li>Cost and usage (WP-27)</li>
          </ul>
        </div>
      </section>
    </>
  )
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
