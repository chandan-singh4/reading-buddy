import { repository } from '../storage/index.ts'
import { noteStore } from '../storage/notes.ts'
import { conceptStore, summaryStore } from '../storage/summaries.ts'
import { tutorStore } from '../storage/tutor.ts'
import type { BookExport, VaultInput } from './vault.ts'

/**
 * Read every store the export draws on.
 *
 * Whole-table reads, which the storage files otherwise avoid — and right here,
 * because the export is a deliberate act the reader takes now and again, not
 * something a screen does on every render. It reads once and builds once.
 *
 * A book with nothing in it is left out. An empty note in a vault is worse than
 * a missing one: it looks like the export failed.
 */
export async function gatherVault(): Promise<VaultInput> {
  const [books, summaries, notes, threads, concepts] = await Promise.all([
    repository.listBooks(),
    summaryStore.all(),
    noteStore.allNotes(),
    tutorStore.allThreads(),
    conceptStore.rows(),
  ])

  const exported: BookExport[] = []
  for (const meta of books) {
    const mine: BookExport = {
      meta,
      summaries: summaries.filter((row) => row.bookId === meta.id),
      notes: notes.filter((row) => row.bookId === meta.id),
      threads: threads.filter((row) => row.bookId === meta.id),
    }
    if (mine.summaries.length + mine.notes.length + mine.threads.length > 0) exported.push(mine)
  }

  return { books: exported, concepts }
}
