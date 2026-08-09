-- Reading Buddy — the operations that have to be all-or-nothing.
--
-- IndexedDB gave the repository real transactions across several tables.
-- Supabase's REST layer gives one statement per request, so anything that must
-- not half-happen lives here instead: a function body *is* a transaction, and
-- the client calls it with a single `rpc()`.
--
-- Every function is SECURITY INVOKER (the default, spelled out because getting
-- it wrong is catastrophic here). They run as the caller, so Row Level Security
-- still applies inside them — a function is a way to make several statements
-- atomic, never a way around the policies in `0001_schema.sql`.
--
-- Run this after `0001_schema.sql`. See `docs/cloud-setup.md`.

-- ---------------------------------------------------------------------------
-- Shared: one book row from the JSON the app already has
--
-- The camelCase → snake_case mapping lives here and only here. The TypeScript
-- side sends `BookMeta` untouched, so a new field is added in two places
-- (the type and this function) rather than in every call site.
-- ---------------------------------------------------------------------------

create or replace function public.rb_upsert_book(p_book jsonb, p_ready boolean)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.books (
    id, title, author, source, type, subject, type_overridden,
    shelf, shelf_overridden, folder_ids, content_hash, text_signature,
    parser_version, imported_at, rating, notes, title_overridden,
    title_clean_version, ready
  )
  values (
    p_book ->> 'id',
    p_book ->> 'title',
    p_book ->> 'author',
    p_book ->> 'source',
    p_book ->> 'type',
    p_book ->> 'subject',
    (p_book ->> 'typeOverridden')::boolean,
    p_book ->> 'shelf',
    (p_book ->> 'shelfOverridden')::boolean,
    case
      when jsonb_typeof(p_book -> 'folderIds') = 'array'
        then array(select jsonb_array_elements_text(p_book -> 'folderIds'))
      else null
    end,
    p_book ->> 'contentHash',
    p_book ->> 'textSignature',
    (p_book ->> 'parserVersion')::integer,
    (p_book ->> 'importedAt')::timestamptz,
    (p_book ->> 'rating')::smallint,
    p_book ->> 'notes',
    (p_book ->> 'titleOverridden')::boolean,
    (p_book ->> 'titleCleanVersion')::integer,
    p_ready
  )
  on conflict (id) do update set
    title               = excluded.title,
    author              = excluded.author,
    source              = excluded.source,
    type                = excluded.type,
    subject             = excluded.subject,
    type_overridden     = excluded.type_overridden,
    shelf               = excluded.shelf,
    shelf_overridden    = excluded.shelf_overridden,
    folder_ids          = excluded.folder_ids,
    content_hash        = excluded.content_hash,
    text_signature      = excluded.text_signature,
    parser_version      = excluded.parser_version,
    imported_at         = excluded.imported_at,
    rating              = excluded.rating,
    notes               = excluded.notes,
    title_overridden    = excluded.title_overridden,
    title_clean_version = excluded.title_clean_version,
    ready               = excluded.ready;
end;
$$;

-- Manifest + chapter indexes, replacing whatever was there.
create or replace function public.rb_write_spine(
  p_book_id  text,
  p_manifest jsonb,
  p_chapters jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.manifests (book_id, title, chapters)
  values (p_book_id, p_manifest ->> 'title', coalesce(p_manifest -> 'chapters', '[]'::jsonb))
  on conflict (book_id) do update set
    title    = excluded.title,
    chapters = excluded.chapters;

  delete from public.chapters where book_id = p_book_id;

  insert into public.chapters (book_id, chapter, title, path, sections)
  select
    p_book_id,
    (c ->> 'chapter')::integer,
    c ->> 'title',
    c ->> 'path',
    coalesce(c -> 'sections', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_chapters, '[]'::jsonb)) as c;
end;
$$;

-- ---------------------------------------------------------------------------
-- Importing a new book, in three calls
--
-- Split because a large book's sections do not reliably fit in one request, and
-- a single failed 6 MB upload on a phone means starting the whole import again.
-- The `ready` flag is what keeps the old promise: nothing is visible until
-- everything has arrived.
--
-- Only *new* imports work this way. Re-parsing an existing book uses the atomic
-- function below instead, because there the book already exists and a failure
-- half way through would damage something the reader already had.
-- ---------------------------------------------------------------------------

create or replace function public.rb_save_book_start(
  p_book     jsonb,
  p_manifest jsonb,
  p_chapters jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_hash text := p_book ->> 'contentHash';
begin
  -- Sweep up any earlier attempt at this same file that never finished. Without
  -- this a failed import leaves an invisible row holding the file's fingerprint,
  -- and every later attempt makes another one.
  if v_hash is not null then
    delete from public.books
     where content_hash = v_hash
       and ready = false
       and id <> (p_book ->> 'id');
  end if;

  perform public.rb_upsert_book(p_book, false);
  perform public.rb_write_spine(p_book ->> 'id', p_manifest, p_chapters);

  delete from public.sections where book_id = p_book ->> 'id';
end;
$$;

-- One chunk of sections. Called repeatedly; each call is its own transaction,
-- which is safe precisely because the book is not visible until finished.
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
  insert into public.sections (book_id, path, chapter, section, title, paragraphs)
  select
    p_book_id,
    s ->> 'path',
    (s ->> 'chapter')::integer,
    (s ->> 'section')::integer,
    s ->> 'title',
    coalesce(s -> 'paragraphs', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as s
  on conflict (book_id, path) do update set
    chapter    = excluded.chapter,
    section    = excluded.section,
    title      = excluded.title,
    paragraphs = excluded.paragraphs;
end;
$$;

create or replace function public.rb_save_book_finish(p_book_id text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.books set ready = true where id = p_book_id;
end;
$$;

-- Undo an import that failed part way. Guarded on `ready = false` so it can
-- never be turned against a book that is finished and on the shelf.
create or replace function public.rb_save_book_abort(p_book_id text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.books where id = p_book_id and ready = false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-parsing a book that is already on the shelf
--
-- One call, one transaction, deliberately. The whole guarantee of `reparseBook`
-- is that a failure leaves the old book exactly as it was, and that cannot
-- survive being split across requests: the moment the old sections are deleted
-- in one request, a failure in the next leaves a book with no text.
--
-- The price is that a very large book must fit in a single request. That is the
-- right way round — it fails cleanly and changes nothing, rather than
-- succeeding halfway.
-- ---------------------------------------------------------------------------

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
  -- chapter index mentions.
  delete from public.sections where book_id = v_book_id;

  perform public.rb_upsert_book(p_book, true);
  perform public.rb_write_spine(v_book_id, p_manifest, p_chapters);

  insert into public.sections (book_id, path, chapter, section, title, paragraphs)
  select
    v_book_id,
    s ->> 'path',
    (s ->> 'chapter')::integer,
    (s ->> 'section')::integer,
    s ->> 'title',
    coalesce(s -> 'paragraphs', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) as s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Word-count backfill (WP-15's one-shot migration)
--
-- Atomic for one specific reason: the book can be deleted while the counts are
-- being worked out. Writing anyway would resurrect a manifest and a set of
-- chapter indexes for a book that no longer exists.
-- ---------------------------------------------------------------------------

create or replace function public.rb_save_word_counts(
  p_book_id  text,
  p_manifest jsonb,
  p_chapters jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.books where id = p_book_id) then
    return false;
  end if;

  perform public.rb_write_spine(p_book_id, p_manifest, p_chapters);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Folders
-- ---------------------------------------------------------------------------

-- Make a folder, or hand back the one that already has this name. Matched
-- case-insensitively, because a reader typing "Philosophy" a second time means
-- the philosophy folder. The unique index does the real work; this turns the
-- conflict into the existing row rather than an error.
create or replace function public.rb_create_folder(p_id text, p_name text)
returns public.folders
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_folder public.folders;
begin
  select * into v_folder
    from public.folders
   where user_id = (select auth.uid())
     and lower(name) = lower(btrim(p_name));

  if found then
    return v_folder;
  end if;

  insert into public.folders (id, name)
  values (p_id, btrim(p_name))
  returning * into v_folder;

  return v_folder;
end;
$$;

-- Delete a folder — the folder only, never the books in it. A folder is a label
-- on a shelf, not a box with a bottom. The books are unfiled in the same
-- transaction, so no book is ever left pointing at a folder that has gone.
create or replace function public.rb_delete_folder(p_id text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.books
     set folder_ids = nullif(array_remove(folder_ids, p_id), '{}')
   where folder_ids @> array[p_id];

  delete from public.folders where id = p_id;
end;
$$;

-- Add, never move: a book can be in Philosophy *and* For the course, so filing
-- it somewhere must not silently unfile it from where it already was.
create or replace function public.rb_add_books_to_folder(
  p_book_ids  text[],
  p_folder_id text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.books
     set folder_ids = coalesce(folder_ids, '{}') || p_folder_id
   where id = any (p_book_ids)
     and not (coalesce(folder_ids, '{}') @> array[p_folder_id]);
end;
$$;

create or replace function public.rb_remove_books_from_folder(
  p_book_ids  text[],
  p_folder_id text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.books
     set folder_ids = nullif(array_remove(folder_ids, p_folder_id), '{}')
   where id = any (p_book_ids)
     and folder_ids @> array[p_folder_id];
end;
$$;

create or replace function public.rb_clear_folders_for(p_book_ids text[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.books
     set folder_ids = null
   where id = any (p_book_ids)
     and folder_ids is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Only signed-in readers may call any of this. `public` and `anon` get nothing.
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'rb_upsert_book(jsonb, boolean)',
    'rb_write_spine(text, jsonb, jsonb)',
    'rb_save_book_start(jsonb, jsonb, jsonb)',
    'rb_save_sections(text, jsonb)',
    'rb_save_book_finish(text)',
    'rb_save_book_abort(text)',
    'rb_replace_parsed_book(jsonb, jsonb, jsonb, jsonb)',
    'rb_save_word_counts(text, jsonb, jsonb)',
    'rb_create_folder(text, text)',
    'rb_delete_folder(text)',
    'rb_add_books_to_folder(text[], text)',
    'rb_remove_books_from_folder(text[], text)',
    'rb_clear_folders_for(text[])'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end
$$;
