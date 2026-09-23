-- Reading Buddy — everything the reader makes, backed up.
--
-- Until this migration the cloud held the shelf and nothing the reader wrote
-- on it. Notes, highlights, Veda's conversations, reading sessions, summaries,
-- saved words and examinations lived only in the phone's IndexedDB. On
-- 2026-09-23 Android Chrome ran short of space and cleared the origin, and all
-- of it went with no copy anywhere.
--
-- One generic table rather than one per kind, on purpose. The device keeps
-- working against its own Dexie tables, exactly as before, and every row it
-- writes to one of them is mirrored here as JSON (`web/src/storage/sync/`).
-- A per-kind schema would be a column-by-column translation of eleven Dexie
-- tables that change shape every few waypoints; this one never has to change
-- when they do.
--
--   tbl        the Dexie table name — 'notes', 'sessions', ...
--   key        the Dexie primary key, JSON-encoded, so a compound key
--              `[bookId, id]` and a plain one `'abc'` both fit in text
--   data       the whole row; null for a deleted row
--   deleted    a tombstone, so a delete on one device reaches the others
--   changed_at when the device made the change — the tie-break between two
--              devices that changed the same row
--   updated_at when the server received it — the cursor a device pulls from.
--              Set by the trigger, never by the client, so a phone with a
--              wrong clock cannot hide a row from the other devices.
--
-- Run this once, in the Supabase SQL editor. See `docs/cloud-setup.md`.

create table if not exists public.user_rows (
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  tbl        text not null,
  key        text not null,
  data       jsonb,
  deleted    boolean not null default false,
  changed_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, key)
);

-- The pull is "everything of mine that arrived after my cursor", in order.
create index if not exists user_rows_pull on public.user_rows (user_id, updated_at);

create or replace function public.user_rows_stamp()
returns trigger
language plpgsql
as $$
begin
  -- The older change loses. Two devices that edited the same row offline both
  -- push when they come back, in whatever order their signals return; without
  -- this, the last to arrive wins even when it is the stale one. Skipping the
  -- update (null) leaves the newer row and its stamp untouched.
  if tg_op = 'UPDATE' and new.changed_at < old.changed_at then
    return null;
  end if;
  -- `clock_timestamp`, not `now`: `now` is the start of the transaction, and
  -- two pushes in one transaction would share a stamp the cursor can't order.
  new.updated_at := clock_timestamp();
  return new;
end
$$;

drop trigger if exists user_rows_stamp on public.user_rows;
create trigger user_rows_stamp
  before insert or update on public.user_rows
  for each row execute function public.user_rows_stamp();

-- The same single-owner policy as every table in `0001_schema.sql`.
alter table public.user_rows enable row level security;
drop policy if exists user_rows_owner on public.user_rows;
create policy user_rows_owner on public.user_rows for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
