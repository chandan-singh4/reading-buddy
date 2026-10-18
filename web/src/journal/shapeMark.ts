import type { StoredEntry } from '../storage/index.ts'

/**
 * What has been done to the words, in one word.
 *
 * Here rather than on either screen that shows it: the stream and the entry
 * must never disagree about what an entry is, and a page importing a helper
 * out of another page is a cycle waiting to be written.
 */
export function shapeMark(entry: StoredEntry): string {
  switch (entry.shaped?.level) {
    case 'tidy':
      return 'Tidied'
    case 'shape':
      return 'Shaped'
    case 'unpack':
      return 'Unpacked'
    default:
      return 'Raw'
  }
}
