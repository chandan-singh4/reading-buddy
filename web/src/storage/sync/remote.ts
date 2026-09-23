/**
 * `user_rows` over Supabase, in the shape `sync.ts` asks for.
 *
 * Every call answers "not now" rather than throwing when there is plainly no
 * signal or nobody signed in: a sync is housekeeping, and the next trigger
 * tries again.
 */

import { cloudClient, currentUser, unwrap } from '../cloud/client.ts'
import { knownOffline } from '../cloud/offline.ts'
import type { CloudRow, OutgoingRow, SyncRemote } from './sync.ts'

export const supabaseRemote: SyncRemote = {
  async userId() {
    if (knownOffline()) return undefined
    // `currentUser` hands back the remembered reader with no signal, which is
    // right for reading and wrong here: that id has no live token behind it,
    // and every request would be refused. Only a real session may sync.
    const { data } = await cloudClient().auth.getSession()
    if (!data.session) return undefined
    return (await currentUser())?.id
  },

  async push(userId: string, rows: OutgoingRow[]) {
    if (rows.length === 0) return
    unwrap(
      await cloudClient()
        .from('user_rows')
        .upsert(
          rows.map((row) => ({ ...row, user_id: userId })),
          { onConflict: 'user_id,tbl,key' },
        ),
      'save your notes and reading to the cloud',
    )
  },

  async pull(userId: string, since: string | undefined, limit: number) {
    let query = cloudClient()
      .from('user_rows')
      .select('tbl, key, data, deleted, changed_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .limit(limit)
    if (since) query = query.gt('updated_at', since)
    return unwrap(await query, 'fetch your notes and reading from the cloud') as CloudRow[]
  },
}
