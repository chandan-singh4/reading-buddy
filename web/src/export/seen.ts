import type { VaultFile } from './vault.ts'

/**
 * What the last export already handed over.
 *
 * The reader asked for one thing above all: do not make me download the same
 * notes again. Fixed paths already stop the *vault* from growing copies, but
 * they do not stop the *zip* from carrying eighty unchanged chapters every
 * time. So each export remembers a fingerprint of every note it wrote, and the
 * next one can offer just the notes whose words have moved.
 *
 * It is a record of a download, not of the reader's vault — this cannot know
 * what they did with the file. That is why "Export everything" stays on the
 * screen beside it, and why forgetting this list is harmless: the worst case is
 * one full export that replaces notes with identical copies of themselves.
 */

const KEY = 'reading-buddy.obsidian.seen.v1'

/** Path to fingerprint. */
export type Seen = Record<string, string>

/**
 * FNV-1a, 32-bit, in hex.
 *
 * A checksum and not a security hash: it answers "have these words changed?"
 * for a few hundred notes on a phone, and `crypto.subtle` is asynchronous and
 * far more machinery than that question needs.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export function readSeen(store: Storage = localStorage): Seen {
  try {
    const raw = store.getItem(KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Seen) : {}
  } catch {
    // A private window, a full disk, or a half-written value. Remembering
    // nothing means one larger export, which is never wrong.
    return {}
  }
}

/** Remember what an export just wrote, keeping what earlier ones wrote. */
export function rememberSeen(files: readonly VaultFile[], store: Storage = localStorage): void {
  const seen = { ...readSeen(store) }
  for (const file of files) seen[file.path] = fingerprint(file.text)
  try {
    store.setItem(KEY, JSON.stringify(seen))
  } catch {
    // Out of room. The next export offers everything, which is a nuisance and
    // not a fault.
  }
}

export function forgetSeen(store: Storage = localStorage): void {
  try {
    store.removeItem(KEY)
  } catch {
    /* nothing to undo */
  }
}

/** The notes this export would add or alter — the rest are already out there. */
export function changedFiles(files: readonly VaultFile[], seen: Seen): VaultFile[] {
  return files.filter((file) => seen[file.path] !== fingerprint(file.text))
}
