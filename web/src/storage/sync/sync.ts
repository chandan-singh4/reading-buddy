/**
 * Everything the reader makes on the device, mirrored to the cloud.
 *
 * ## Why this exists
 *
 * Notes, highlights, Veda's conversations, reading sessions, summaries, saved
 * words and examinations were device-local by decision — each one was "a cloud
 * table, a cached read and an outbox entry, not one method", and the cost was
 * accepted. On 2026-09-23 the cost arrived: Android Chrome ran short of space,
 * cleared the origin without asking, and months of notes and every session went
 * with it. The shelf survived because it was in the cloud.
 *
 * ## The shape
 *
 * The device keeps working exactly as it did. Every store (`notes.ts`,
 * `tutor.ts`, `stats/sessions.ts`, ...) still writes its own Dexie table and
 * none of them knows this file exists. Instead:
 *
 *   1. **Watch.** A Dexie hook on each table in `SYNCED_TABLES` notes the key of
 *      every row written or deleted. Hooks see bulk writes, `modify`,
 *      `where().delete()` and `clear()` too — Dexie turns each into per-key
 *      events once a `deleting` hook is subscribed — so no store can write
 *      around it.
 *   2. **Queue.** When that transaction commits, the keys go into a small
 *      queue in a database of their own. Only the key: the row is read again
 *      when it is sent, so ten writes to one growing session send it once.
 *   3. **Push.** The queue is sent to `user_rows` as JSON, a few seconds after
 *      the last write and whenever the page is hidden or the signal returns.
 *   4. **Pull.** Rows the server received since the last pull are written into
 *      Dexie. On an emptied device the cursor is gone too, so the pull is
 *      everything — that is the restore.
 *
 * ## Conflicts
 *
 * The newer change wins, by the device's own `changed_at`. The server enforces
 * it on the way in (`0008_user_rows.sql`); the pull enforces it on the way
 * back, where a row still waiting in the local queue is kept unless the cloud's
 * copy is newer. One reader, rarely two devices at once: last-writer-wins is
 * the whole of the rule it needs.
 */

import Dexie, { type Table, type Transaction } from 'dexie'

/**
 * The tables whose rows the reader would miss.
 *
 * Left out on purpose: `definitions` (a dictionary cache, fetched again on
 * demand), `alerts` (the bell, which describes this device's own queue),
 * `handles` (a folder handle means nothing on any other device and cannot be
 * turned into JSON), and the book tables, which on the cloud backend are
 * already the cloud's.
 */
export const SYNCED_TABLES = [
  'notes',
  'tutor',
  'sessions',
  'summaries',
  'concepts',
  'digests',
  'vocabulary',
  'questionBanks',
  'misses',
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

/** One row as the cloud holds it. */
export interface CloudRow {
  tbl: string
  /** The Dexie primary key, JSON-encoded. */
  key: string
  data: unknown
  deleted: boolean
  /** ISO 8601. When the device made the change. */
  changed_at: string
  /** ISO 8601. When the server received it; the pull cursor. */
  updated_at: string
}

export type OutgoingRow = Omit<CloudRow, 'updated_at'>

/** The half that talks to the server. Tests hand it a fake. */
export interface SyncRemote {
  /** Who this is for, or undefined when nobody is signed in. */
  userId(): Promise<string | undefined>
  push(userId: string, rows: OutgoingRow[]): Promise<void>
  /** Rows received after `since`, oldest first, at most `limit` of them. */
  pull(userId: string, since: string | undefined, limit: number): Promise<CloudRow[]>
}

interface DirtyRow {
  tbl: string
  key: string
  /** ISO 8601. When the change was made — becomes `changed_at`. */
  at: string
  /** Unique per change, so a send only clears what it actually sent. */
  stamp: string
}

interface SyncState {
  id: 'state'
  userId?: string
  cursor?: string
  /** The reader whose device rows have been uploaded in full once. */
  seededFor?: string
}

export type SyncDB = Dexie & {
  dirty: Table<DirtyRow, [string, string]>
  meta: Table<SyncState, string>
}

/** Beside `reading-buddy-outbox` and `reading-buddy-cache`, for DevTools. */
export const SYNC_DB_NAME = 'reading-buddy-sync'

export function createSyncDb(name: string = SYNC_DB_NAME): SyncDB {
  const db = new Dexie(name) as SyncDB
  db.version(1).stores({ dirty: '[tbl+key]', meta: 'id' })
  return db
}

/**
 * PostgREST's default page ceiling. Asking for more returns this many anyway,
 * and a page that came back short is how the loop knows it is done.
 */
const PAGE = 1000

/**
 * How far back each pull reaches before its cursor. Two pushes can commit out
 * of order — the later stamp first — and a pull between them would step past
 * the earlier one for ever. Re-reading a few minutes costs a handful of rows,
 * every one of them applied idempotently.
 */
const OVERLAP_MS = 5 * 60 * 1000

/** Rows per push request. A long Veda thread is tens of kilobytes. */
const PUSH_BATCH = 200

/**
 * Whether `a` is later than `b`. By time, not by text: Postgres writes
 * `+00:00` and microseconds where JavaScript writes `Z` and milliseconds, and
 * the two sort differently as strings.
 */
function newer(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b)
}

export interface SyncOptions {
  /** The device database the stores write to. */
  local: Dexie
  queue: SyncDB
  remote: SyncRemote
  /** Wait after the last write before sending. */
  pushDelayMs?: number
  now?: () => number
}

export interface Sync {
  /** Pull, upload anything never uploaded, then push. One at a time. */
  run(): Promise<SyncResult>
  /** Send the queue now, if there is a reader and a signal. */
  push(): Promise<void>
  /** How many changes are waiting to be sent. */
  pending(): Promise<number>
  /** Whether the device holds no row in any synced table. */
  isEmpty(): Promise<boolean>
  /** Remove the hooks. Tests only. */
  stop(): void
}

export interface SyncResult {
  /** Rows written into Dexie from the cloud. */
  pulled: number
  pushed: number
}

export function createSync(options: SyncOptions): Sync {
  const { local, queue, remote } = options
  const now = options.now ?? Date.now
  const pushDelayMs = options.pushDelayMs ?? 4000

  /** Transactions this file opened to apply the cloud's rows: not the reader's. */
  const fromCloud = new WeakSet<Transaction>()
  /** Keys touched by each open transaction, sent to the queue on commit. */
  const touched = new WeakMap<Transaction, Map<string, { tbl: string; key: string }>>()
  let counter = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<SyncResult> | undefined
  let pushing: Promise<void> | undefined

  function note(tbl: string, primKey: unknown, trans: Transaction): void {
    if (fromCloud.has(trans)) return
    let keys = touched.get(trans)
    if (!keys) {
      keys = new Map()
      touched.set(trans, keys)
      const mine = keys
      // Only on commit: a rolled-back write never happened, and queueing it
      // would push a row the device doesn't hold — which reads as a delete.
      trans.on('complete', () => void enqueue([...mine.values()]))
    }
    const key = JSON.stringify(primKey)
    keys.set(`${tbl}\u0000${key}`, { tbl, key })
  }

  const unhook: Array<() => void> = []
  for (const tbl of SYNCED_TABLES) {
    const table = local.table(tbl)
    const creating = function (primKey: unknown, _obj: unknown, trans: Transaction) {
      note(tbl, primKey, trans)
    }
    const updating = function (_mods: unknown, primKey: unknown, _obj: unknown, trans: Transaction) {
      note(tbl, primKey, trans)
    }
    const deleting = function (primKey: unknown, _obj: unknown, trans: Transaction) {
      note(tbl, primKey, trans)
    }
    table.hook('creating', creating)
    table.hook('updating', updating)
    table.hook('deleting', deleting)
    unhook.push(() => {
      table.hook('creating').unsubscribe(creating)
      table.hook('updating').unsubscribe(updating)
      table.hook('deleting').unsubscribe(deleting)
    })
  }

  async function enqueue(keys: Array<{ tbl: string; key: string }>): Promise<void> {
    if (keys.length === 0) return
    const at = new Date(now()).toISOString()
    try {
      await queue.dirty.bulkPut(
        keys.map(({ tbl, key }) => ({ tbl, key, at, stamp: `${now()}-${(counter += 1)}` })),
      )
    } catch {
      // A queue that can't be written is a change that waits for the next full
      // upload. It is still on the device; nothing the reader sees is wrong.
      return
    }
    schedulePush()
  }

  function schedulePush(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void push().catch(() => {})
    }, pushDelayMs)
  }

  async function state(): Promise<SyncState> {
    return (await queue.meta.get('state')) ?? { id: 'state' }
  }

  function push(): Promise<void> {
    // Chained rather than skipped: a write that lands during a push must be
    // sent by a push that starts after it, not dropped because one was running.
    const next = (pushing ?? Promise.resolve()).catch(() => {}).then(sendQueue)
    pushing = next
    return next
  }

  async function sendQueue(): Promise<void> {
    const userId = await remote.userId()
    if (!userId) return
    const waiting = await queue.dirty.toArray()
    for (let i = 0; i < waiting.length; i += PUSH_BATCH) {
      const batch = waiting.slice(i, i + PUSH_BATCH)
      const rows: OutgoingRow[] = []
      for (const entry of batch) {
        const data = await local.table(entry.tbl).get(JSON.parse(entry.key))
        rows.push({
          tbl: entry.tbl,
          key: entry.key,
          data: data ?? null,
          deleted: data === undefined,
          changed_at: entry.at,
        })
      }
      await remote.push(userId, rows)
      // Clear only what was sent. A row written again while this was in flight
      // has a new stamp and stays queued for the next push.
      await queue.transaction('rw', queue.dirty, async () => {
        for (const entry of batch) {
          const current = await queue.dirty.get([entry.tbl, entry.key])
          if (current?.stamp === entry.stamp) await queue.dirty.delete([entry.tbl, entry.key])
        }
      })
    }
  }

  async function pull(userId: string, saved: SyncState): Promise<number> {
    let since =
      saved.userId === userId && saved.cursor
        ? new Date(Date.parse(saved.cursor) - OVERLAP_MS).toISOString()
        : undefined
    let applied = 0
    let cursor = saved.userId === userId ? saved.cursor : undefined
    for (;;) {
      const page = await remote.pull(userId, since, PAGE)
      if (page.length > 0) applied += await apply(page)
      for (const row of page) if (!cursor || newer(row.updated_at, cursor)) cursor = row.updated_at
      await queue.meta.put({ ...(await state()), id: 'state', userId, cursor })
      if (page.length < PAGE) return applied
      since = page[page.length - 1].updated_at
    }
  }

  async function apply(rows: CloudRow[]): Promise<number> {
    const known = new Set<string>(SYNCED_TABLES)
    const usable = rows.filter((row) => known.has(row.tbl))
    if (usable.length === 0) return 0
    const waiting = new Map(
      (await queue.dirty.bulkGet(usable.map((row) => [row.tbl, row.key] as [string, string]))).map(
        (entry, i) => [i, entry],
      ),
    )
    let applied = 0
    const tables = [...new Set(usable.map((row) => row.tbl))].map((tbl) => local.table(tbl))
    await local.transaction('rw', tables, async (trans) => {
      fromCloud.add(trans)
      for (const [i, row] of usable.entries()) {
        const mine = waiting.get(i)
        // A change still waiting here is newer than anything the cloud has
        // unless the cloud says otherwise; it will be pushed and win there too.
        if (mine && !newer(row.changed_at, mine.at)) continue
        const table = local.table(row.tbl)
        if (row.deleted || row.data === null) await table.delete(JSON.parse(row.key))
        else await table.put(row.data as object)
        applied += 1
      }
    })
    // The cloud's newer copy replaced a local change: that change is spent.
    await queue.transaction('rw', queue.dirty, async () => {
      for (const [i, row] of usable.entries()) {
        const mine = waiting.get(i)
        if (mine && newer(row.changed_at, mine.at)) {
          const current = await queue.dirty.get([row.tbl, row.key])
          if (current?.stamp === mine.stamp) await queue.dirty.delete([row.tbl, row.key])
        }
      }
    })
    return applied
  }

  /**
   * Put every device row in the queue, once per reader.
   *
   * This is what carries a device's rows from before this file existed up to
   * the cloud — and a device that was signed in as someone else. It runs only
   * after a pull has succeeded, so the device already holds the cloud's newer
   * rows and cannot push an older copy over them.
   */
  async function seed(userId: string): Promise<void> {
    const saved = await state()
    if (saved.seededFor === userId) return
    const keys: Array<{ tbl: string; key: string }> = []
    for (const tbl of SYNCED_TABLES) {
      for (const primKey of await local.table(tbl).toCollection().primaryKeys()) {
        keys.push({ tbl, key: JSON.stringify(primKey) })
      }
    }
    const at = new Date(now()).toISOString()
    await queue.transaction('rw', queue.dirty, queue.meta, async () => {
      const already = new Set((await queue.dirty.toArray()).map((e) => `${e.tbl}\u0000${e.key}`))
      await queue.dirty.bulkPut(
        keys
          .filter(({ tbl, key }) => !already.has(`${tbl}\u0000${key}`))
          .map(({ tbl, key }) => ({ tbl, key, at, stamp: `${now()}-${(counter += 1)}` })),
      )
      await queue.meta.put({ ...(await state()), id: 'state', seededFor: userId })
    })
  }

  async function runOnce(): Promise<SyncResult> {
    const userId = await remote.userId()
    if (!userId) return { pulled: 0, pushed: 0 }
    const pulled = await pull(userId, await state())
    await seed(userId)
    const before = await queue.dirty.count()
    await push()
    const after = await queue.dirty.count()
    return { pulled, pushed: Math.max(0, before - after) }
  }

  return {
    run() {
      if (!running) {
        running = runOnce().finally(() => {
          running = undefined
        })
      }
      return running
    },
    push,
    pending: () => queue.dirty.count(),
    async isEmpty() {
      for (const tbl of SYNCED_TABLES) {
        if ((await local.table(tbl).limit(1).count()) > 0) return false
      }
      return true
    },
    stop() {
      if (timer !== undefined) clearTimeout(timer)
      for (const off of unhook) off()
    },
  }
}
