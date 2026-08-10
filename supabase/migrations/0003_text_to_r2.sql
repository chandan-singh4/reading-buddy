-- Reading Buddy — move the words out of Postgres and into R2.
--
-- ## What changes
--
-- `sections` stops holding `paragraphs` and starts holding `r2_key`. The prose
-- of a whole chapter becomes one JSON object in Cloudflare R2; every section of
-- that chapter points at it. The row keeps what the app actually *queries* —
-- reading order, the section's own title, how many there are — none of which
-- ever needed the words to answer.
--
-- Measured on a real import (Jung, *Man and His Symbols*): `sections` was
-- 584 kB of the 700 kB that book cost the database. Afterwards the same book
-- costs roughly 200 kB, and the words sit in object storage, where storage is
-- what is being paid for.
--
-- This makes `sources`, `assets` and `sections` all work the same way — a
-- pointer in Postgres, the bytes in R2 — rather than two of them doing it and
-- the third being special.
--
-- ## ⚠️ This deletes the books currently in the cloud
--
-- There is no way to fill in `r2_key` for text that was never uploaded, so the
-- existing rows cannot be migrated — only re-imported. The `delete` below is
-- therefore deliberate and unconditional, and it cascades to every chapter,
-- section, bookmark, quote and reading position belonging to those books.
--
-- **Nothing on your device is touched.** The IndexedDB library is a separate
-- store on a separate machine; this statement cannot reach it. Only books
-- imported while the cloud backend was selected are affected — re-import them
-- afterwards and their text lands in R2.
--
-- Objects already in the bucket for those books are left where they are. A
-- re-import overwrites the source and the pictures at the same keys; if you
-- would rather start clean, empty `users/<your id>/books/` in the R2 console
-- first.
--
-- Run this after `0002_functions.sql`, in the Supabase SQL editor.
-- See `docs/cloud-setup.md`.

-- ---------------------------------------------------------------------------
-- 1. Clear out what cannot be migrated
-- ---------------------------------------------------------------------------

delete from public.books;

-- ---------------------------------------------------------------------------
-- 2. Reshape `sections`
--
-- Many sections share one key: a chapter is one object. `not null` is safe to
-- add without a default only because the table was just emptied — a section
-- with no address for its words is a page that cannot be read, and the column
-- says so rather than leaving it to every caller to check.
-- ---------------------------------------------------------------------------

alter table public.sections drop column if exists paragraphs;
alter table public.sections add column if not exists r2_key text not null;

-- ---------------------------------------------------------------------------
-- 3. The two functions that wrote paragraphs now write a key
--
-- `create or replace` keeps the signatures, the grants and the RLS behaviour
-- exactly as `0002_functions.sql` left them. Only the column list changes.
-- ---------------------------------------------------------------------------

create or replace function public.rb_save_sections(
  p_book_id  text,
  p_sections jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.sections (book_id, path, chapter, section, title, r2_key)
  select
    p_book_id,
    s ->> 'path',
    (s ->> 'chapter')::integer,
    (s ->> 'section')::integer,
    s ->> 'title',
    s ->> 'r2Key'
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as s
  on conflict (book_id, path) do update set
    chapter = excluded.chapter,
    section = excluded.section,
    title   = excluded.title,
    r2_key  = excluded.r2_key;
end;
$$;

-- The re-parse guarantee is unchanged, and the parse token in each key is what
-- keeps it. By the time this runs the new chapters are already in R2 under
-- addresses no row mentions, so the old book is still whole; this swaps every
-- row onto them at once, and the caller releases the old objects only after it
-- returns. A failure here leaves the reader exactly what they had.
create or replace function public.rb_replace_parsed_book(
  p_book     jsonb,
  p_manifest jsonb,
  p_chapters jsonb,
  p_sections jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_book_id text := p_book ->> 'id';
begin
  -- Cleared, not merged: a new parser can divide a book into fewer sections
  -- than the old one did, and the surplus would otherwise linger as rows no
  -- chapter index mentions — now pointing at objects nothing would ever sweep.
  delete from public.sections where book_id = v_book_id;

  perform public.rb_upsert_book(p_book, true);
  perform public.rb_write_spine(v_book_id, p_manifest, p_chapters);

  insert into public.sections (book_id, path, chapter, section, title, r2_key)
  select
    v_book_id,
    s ->> 'path',
    (s ->> 'chapter')::integer,
    (s ->> 'section')::integer,
    s ->> 'title',
    s ->> 'r2Key'
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as s;
end;
$$;
