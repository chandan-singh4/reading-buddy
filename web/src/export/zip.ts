import { strToU8, zipSync } from 'fflate'

import type { VaultFile } from './vault.ts'

/**
 * The notes as one zip, and the zip into the reader's downloads.
 *
 * `zipSync` rather than the streaming form: a whole library of recaps is a few
 * hundred kilobytes of text, which is less work than the page does to draw one
 * chapter. Nothing here is worth an async callback.
 *
 * Folders are not written as entries. A path with slashes in it is the only
 * thing a zip needs to make a folder, and every unpacker builds them.
 */
export function zipVault(files: readonly VaultFile[]): Blob {
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.path] = strToU8(file.text)
  // `mtime` left alone: fflate stamps the current time, which is right — the
  // zip is made now, even when the notes inside it are months old.
  const bytes = zipSync(entries, { level: 6 })
  return new Blob([bytes as BlobPart], { type: 'application/zip' })
}

/** `reading-buddy-vault-2026-08-30.zip`. */
export function zipName(now: Date = new Date()): string {
  const day = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  return `reading-buddy-vault-${day}.zip`
}

/** Hand the file to the browser. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Freed on the next turn of the loop rather than at once: Safari has not
  // always finished with the URL by the time `click` returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
