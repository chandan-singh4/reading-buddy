// Must come first: installs a real IndexedDB implementation onto globals.
//
// The sync against a real Dexie database and a fake `user_rows` that keeps the
// server's two rules: the older change loses, and every write gets a fresh
// `updated_at`. The case this exists for is the second device test — a phone
// Chrome cleared, opened again, and handed its notes back.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDb, type ReadingBuddyDB, type StoredNote, type StoredSession } from '../db.ts'
import { createSync, createSyncDb, type CloudRow, type OutgoingRow, type Sync, type SyncRemote } from './sync.ts'

const USER = 'reader-1'

/** `user_rows`, with the trigger's rules and nothing else. */
function fakeCloud() {
  const rows = new Map<string, CloudRow & { user_id: string }>()
  let clock = Date.parse('2026-09-23T10:00:00.000Z')
  let pushes = 0
  return {
    rows,
    get pushes() {
      return pushes
    },
    remote(userId: string | undefined = USER): SyncRemote {
      return {
        async userId() {
          return userId
        },
        async push(user: string, incoming: OutgoingRow[]) {
          pushes += 1
          for (const row of incoming) {
            const id = `${user}|${row.tbl}|${row.key}`
            const old = rows.get(id)
            if (old && Date.parse(row.changed_at) < Date.parse(old.changed_at)) continue
            clock += 1
            // Postgres's own format, on purpose: `+00:00` and microseconds.
            const updated_at = new Date(clock).toISOString().replace('Z', '000+00:00')
            rows.set(id, { ...row, user_id: user, updated_at })
          }
        },
        async pull(user: string, since: string | undefined, limit: number) {
          return [...rows.values()]
            .filter((row) => row.user_id === user)
            .filter((row) => !since || Date.parse(row.updated_at) > Date.parse(since))
            .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
            .slice(0, limit)
            .map(({ user_id: _, ...row }) => row)
        },
      }
    },
  }
}

function note(id: string, text: string, bookId = 'book-1'): StoredNote {
  return {
    bookId: bookId as StoredNote['bookId'],
    id,
    anchor: 'c1.p1' as StoredNote['anchor'],
    author: 'you',
    text,
    createdAt: '2026-09-01T10:00:00.000Z',
  }
}

let n = 0
let local: ReadingBuddyDB
let sync: Sync
let cloud: ReturnType<typeof fakeCloud>
const opened: Array<{ close(): void }> = []
const syncs: Sync[] = []

function device(remote: SyncRemote, now?: () => number) {
  n += 1
  const db = createDb(`sync-local-${n}`)
  const q = createSyncDb(`sync-queue-${n}`)
  const s = createSync({ local: db, queue: q, remote, pushDelayMs: 1, now })
  opened.push(db, q)
  syncs.push(s)
  return { db, q, s }
}

beforeEach(() => {
  cloud = fakeCloud()
  ;({ db: local, s: sync } = device(cloud.remote()))
})

afterEach(() => {
  for (const s of syncs.splice(0)) s.stop()
  for (const db of opened.splice(0)) db.close()
})

/** Let the commit hook, the queue write and the debounced push all land. */
async function settle(s: Sync = sync): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await s.push()
}

describe('sync', () => {
  it('sends a new note to the cloud', async () => {
    await local.notes.put(note('n1', 'The shadow is the unlived life.'))
    await settle()

    const row = cloud.rows.get(`${USER}|notes|${JSON.stringify(['book-1', 'n1'])}`)
    expect(row?.deleted).toBe(false)
    expect((row?.data as StoredNote).text).toBe('The shadow is the unlived life.')
    expect(await sync.pending()).toBe(0)
  })

  it('sends a delete as a tombstone, including a range delete', async () => {
    await local.notes.bulkPut([note('n1', 'a'), note('n2', 'b'), note('n3', 'c', 'book-2')])
    await settle()
    await local.notes.where('bookId').equals('book-1').delete()
    await settle()

    const gone = [...cloud.rows.values()].filter((row) => row.deleted).map((row) => row.key)
    expect(gone.sort()).toEqual([JSON.stringify(['book-1', 'n1']), JSON.stringify(['book-1', 'n2'])])
  })

  it('sends a growing session once, as it stands when it is sent', async () => {
    const session: StoredSession = {
      id: 's1',
      bookId: 'book-1',
      day: '2026-09-23',
      startedAt: '2026-09-23T09:00:00.000Z',
      endedAt: '2026-09-23T09:00:01.000Z',
      activeMs: 1000,
    } as unknown as StoredSession
    await local.sessions.put(session)
    await local.sessions.put({ ...session, activeMs: 2000 })
    await local.sessions.put({ ...session, activeMs: 3000 })
    await settle()

    const row = cloud.rows.get(`${USER}|sessions|${JSON.stringify('s1')}`)
    expect((row?.data as StoredSession).activeMs).toBe(3000)
  })

  it('gives an emptied device everything back', async () => {
    await local.notes.bulkPut([note('n1', 'first'), note('n2', 'second')])
    await local.tutor.put({ bookId: 'book-1', id: 't1' } as never)
    await settle()

    // Chrome clears the origin: a new database, a new queue, no cursor.
    const phone = device(cloud.remote())
    expect(await phone.s.isEmpty()).toBe(true)
    const result = await phone.s.run()

    expect(result.pulled).toBe(3)
    expect((await phone.db.notes.toArray()).map((row) => row.text).sort()).toEqual(['first', 'second'])
    expect(await phone.db.tutor.count()).toBe(1)
    // What came from the cloud is not queued to go straight back.
    expect(await phone.s.pending()).toBe(0)
  })

  it('uploads what a device held before sync existed, once', async () => {
    // A phone from before this file: rows written with nothing watching.
    n += 1
    const db = createDb(`sync-local-${n}`)
    const q = createSyncDb(`sync-queue-${n}`)
    opened.push(db, q)
    await db.notes.put(note('old', 'written in August'))

    const s = createSync({ local: db, queue: q, remote: cloud.remote(), pushDelayMs: 1 })
    syncs.push(s)
    await s.run()
    expect(cloud.rows.size).toBe(1)

    const pushes = cloud.pushes
    await s.run()
    expect(cloud.pushes).toBe(pushes)
  })

  it('lets the newer of two changes win, whichever arrives last', async () => {
    let clock = Date.parse('2026-09-23T12:00:00.000Z')
    const laptop = device(cloud.remote(), () => clock)
    const phone = device(cloud.remote(), () => clock)

    await phone.db.notes.put(note('n1', 'older, from the phone'))
    clock += 60_000
    await laptop.db.notes.put(note('n1', 'newer, from the laptop'))
    await settle(laptop.s)
    await settle(phone.s)

    const row = cloud.rows.get(`${USER}|notes|${JSON.stringify(['book-1', 'n1'])}`)
    expect((row?.data as StoredNote).text).toBe('newer, from the laptop')

    await phone.s.run()
    expect((await phone.db.notes.get(['book-1', 'n1']))?.text).toBe('newer, from the laptop')
  })

  it('keeps a change made with no signal and sends it on return', async () => {
    let signedIn: string | undefined
    const remote = cloud.remote()
    const flaky: SyncRemote = { ...remote, userId: async () => signedIn }
    const phone = device(flaky)

    await phone.db.notes.put(note('n1', 'on the plane'))
    await settle(phone.s)
    expect(await phone.s.pending()).toBe(1)

    signedIn = USER
    await phone.s.run()
    expect(await phone.s.pending()).toBe(0)
    expect(cloud.rows.size).toBe(1)
  })

  it('does not queue a write that rolled back', async () => {
    await expect(
      local.transaction('rw', local.notes, async () => {
        await local.notes.put(note('n1', 'never happened'))
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')
    await settle()
    expect(cloud.rows.size).toBe(0)
  })
})
