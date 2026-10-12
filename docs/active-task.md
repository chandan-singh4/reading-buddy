# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Prove that the backup reaches the cloud from the phone.

The sync (`web/src/storage/sync/`) is built, tested against a fake server, and
deployed. The reader ran `0008_user_rows.sql`, and `user_rows` exists. Nobody
has seen a row from the phone in it yet.

## Definition of done

1. The reader opens the app on the phone with a signal and waits 10 seconds.
2. Supabase → Table Editor → `user_rows` shows rows with `tbl` = `notes` and
   `tbl` = `tutor`.
3. The reader makes one new highlight. A new `notes` row appears within a
   minute.

If the table stays empty, look at `remote.ts` first: `userId()` returns
nothing without a live session, and every push error is swallowed.

## After that

- WP-27, cost and usage. See `docs/progress.md` → Next up.

## Files in scope

- `web/src/storage/sync/sync.ts` — the watch, the queue, push and pull.
- `web/src/storage/sync/remote.ts` — `user_rows` over Supabase.
- `web/src/storage/sync/index.ts` — when the sync runs; the restore wait.
- `supabase/migrations/0008_user_rows.sql` — the table and its rules.
