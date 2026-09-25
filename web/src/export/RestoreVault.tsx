import { useRef, useState } from 'react'

import styles from '../pages/page.module.css'
import { repository } from '../storage/index.ts'
import local from './export.module.css'
import { readPicked, restoreVault, type RestoreReport } from './restore.ts'

/**
 * The export, run backwards: the reader's vault back into the app.
 *
 * A file input rather than a folder picker, because the phone is where this is
 * needed and Android Chrome has no folder picker. The zips the export saved are
 * in Downloads, so the reader picks every one of them at once; loose `.md`
 * files from the vault work the same way.
 */
export default function RestoreVault() {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()

  const pick = (files: FileList | null): void => {
    if (!files || files.length === 0) return
    setBusy(true)
    setSaid(undefined)
    void readPicked([...files])
      .then((vault) =>
        restoreVault(vault, {
          listBooks: () => repository.listBooks(),
          listSections: (bookId) => repository.listSections(bookId),
        }),
      )
      .then((report) => setSaid(describe(report)))
      .catch((error: unknown) => {
        setSaid(`The restore failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      })
      .finally(() => {
        setBusy(false)
        if (input.current) input.current.value = ''
      })
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Bring your notes back from Obsidian</h2>
      <div className={styles.card}>
        <p className={local.blurb}>
          Pick the zips you exported — all of them at once — or the chapter notes from your
          vault. Your highlights, your notes and your conversations with Veda go back into
          their books. Anything already here is left alone, so it is safe to run twice.
        </p>
        <p className={local.blurb}>
          The vault did not keep highlight colours, so every highlight comes back yellow.
        </p>

        <div className={local.row}>
          <button
            type="button"
            className={styles.importButton}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Restoring…' : 'Choose files to restore'}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".zip,.md,application/zip,text/markdown"
            hidden
            onChange={(event) => pick(event.target.files)}
          />
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

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`
}

function describe(report: RestoreReport): string {
  const parts: string[] = []
  if (report.linked > 0) {
    parts.push(
      `Linked ${plural(report.linked, 'kept line')} of Veda’s back to ${report.linked === 1 ? 'its conversation' : 'their conversations'}.`,
    )
  }
  if (report.notes + report.threads === 0 && report.linked > 0) {
    // Said above. Nothing new was added, and that is right.
  } else if (report.notes + report.threads === 0) {
    parts.push(
      report.skipped > 0
        ? 'Everything in those files is already here.'
        : 'Those files held no highlights or conversations.',
    )
  } else {
    parts.push(
      `Restored ${plural(report.notes, 'highlight')} and ${plural(report.threads, 'conversation')} with Veda.`,
    )
  }
  if (report.unplaced > 0) {
    parts.push(
      `${plural(report.unplaced, 'passage')} could not be found in the book, so ${report.unplaced === 1 ? 'it is' : 'they are'} at the start of ${report.unplaced === 1 ? 'its' : 'their'} chapter.`,
    )
  }
  if (report.missingBooks.length > 0) {
    parts.push(`Not on your shelf, so skipped: ${report.missingBooks.join(', ')}.`)
  }
  return parts.join(' ')
}
