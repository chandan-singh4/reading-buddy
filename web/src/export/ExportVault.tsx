import { useEffect, useState } from 'react'

import styles from '../pages/page.module.css'
import { gatherVault } from './gather.ts'
import local from './export.module.css'
import { changedFiles, readSeen, rememberSeen } from './seen.ts'
import { buildVault, type VaultFile } from './vault.ts'
import { saveBlob, zipName, zipVault } from './zip.ts'

/**
 * The export, on the Settings screen.
 *
 * Two buttons, because there are two honest answers to "what should be in the
 * zip?" and the app cannot know which one the reader wants. **What's new** is
 * the everyday one: the notes whose words have changed since the last export.
 * **Everything** is for a new vault, a new phone, or the day the reader is not
 * sure what happened to the last file. Neither can damage the vault, since both
 * write the same file names.
 */
export default function ExportVault() {
  const [count, setCount] = useState<{ all: number; fresh: number }>()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()

  useEffect(() => {
    let alive = true
    void countUp().then((counted) => {
      if (alive) setCount(counted)
    })
    return () => {
      alive = false
    }
  }, [])

  const run = (onlyNew: boolean): void => {
    setBusy(true)
    setSaid(undefined)
    void gatherVault()
      .then((input) => {
        const all = buildVault(input)
        const files = onlyNew ? changedFiles(all, readSeen()) : all
        if (files.length === 0) {
          setSaid('Nothing has changed since your last export.')
          return
        }
        saveBlob(zipVault(files), zipName())
        rememberSeen(files)
        setSaid(`${files.length} note${files.length === 1 ? '' : 's'} downloaded.`)
        return countUp().then(setCount)
      })
      .catch((error: unknown) => {
        setSaid(`The export failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      })
      .finally(() => setBusy(false))
  }

  const fresh = count?.fresh ?? 0

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Take your notes to Obsidian</h2>
      <div className={styles.card}>
        <p className={local.blurb}>
          Your chapter recaps, your highlights and your conversations with Veda, written as
          Markdown notes that link to one another. Unzip it and drag the <b>Reading Buddy</b>{' '}
          folder into the top of your vault. That is the whole job.
        </p>
        <p className={local.blurb}>
          Every note keeps the same file name each time, so a later export replaces a note
          instead of adding a second copy of it.
        </p>

        <div className={local.row}>
          <button
            type="button"
            className={styles.importButton}
            disabled={busy || fresh === 0}
            onClick={() => run(true)}
          >
            {fresh === 0 ? 'Nothing new to export' : `Export what’s new (${fresh})`}
          </button>
          <button
            type="button"
            className={local.plain}
            disabled={busy || (count?.all ?? 0) === 0}
            onClick={() => run(false)}
          >
            Export everything{count === undefined ? '' : ` (${count.all})`}
          </button>
        </div>

        {said === undefined ? null : (
          <p className={local.said} role="status">
            {said}
          </p>
        )}
      </div>
    </section>
  )
}

/** How many notes there are, and how many the last export has not seen. */
async function countUp(): Promise<{ all: number; fresh: number }> {
  const files: VaultFile[] = buildVault(await gatherVault())
  return { all: files.length, fresh: changedFiles(files, readSeen()).length }
}
