import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { zipName, zipVault } from './zip.ts'

describe('the zip', () => {
  it('keeps the folder in the path, so the vault unpacks whole', async () => {
    const blob = zipVault([
      { path: 'Reading Buddy/Books/Jung.md', text: '# Jung' },
      { path: 'Reading Buddy/Concepts/archetype.md', text: '# archetype' },
    ])
    const back = unzipSync(new Uint8Array(await blob.arrayBuffer()))

    expect(Object.keys(back).sort()).toEqual([
      'Reading Buddy/Books/Jung.md',
      'Reading Buddy/Concepts/archetype.md',
    ])
    expect(strFromU8(back['Reading Buddy/Books/Jung.md'])).toBe('# Jung')
  })

  it('names the file for the day it was made', () => {
    expect(zipName(new Date(2026, 7, 30))).toBe('reading-buddy-vault-2026-08-30.zip')
  })
})
