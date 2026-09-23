# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

Keep everything the reader makes in the cloud, so that a cleared phone loses
nothing.

On 2026-09-23 Android Chrome cleared the app's storage when the phone was low
on space. Notes, highlights, Veda threads and sessions were lost. The sync in
`web/src/storage/sync/` is now built and tested. It is not proved against the
real Supabase yet.

## What the reader must do

1. Open the Supabase SQL Editor.
2. Run `supabase/migrations/0008_user_rows.sql`.
3. Open the app on the phone with a signal. Take the update from the bell.
4. Make one note. Open **Table Editor → user_rows** in Supabase. Make sure that
   the note is there.

## Next

- Prove the sync on the phone (step 4 above).
- Prove "Restore from vault" on the phone. Settings → "Bring your notes back
  from Obsidian". Pick every export zip in Downloads at one time.

## Files in scope

- `web/src/storage/sync/sync.ts` — the watch, the queue, push and pull.
- `web/src/storage/sync/remote.ts` — `user_rows` over Supabase.
- `web/src/storage/sync/index.ts` — when the sync runs; the restore wait.
- `supabase/migrations/0008_user_rows.sql` — the table and its rules.
- `web/src/main.tsx` — boot calls `startSync`.
- `web/src/export/restore.ts`, `web/src/export/RestoreVault.tsx` — the restore.
