-- Teach the save function about the columns 0004 added.
--
-- 0004 added six columns and the app learned to fill them, and they stayed null
-- anyway. `bookToRow` — the mapping that knows about them — turns out to serve
-- only `saveBook`, the path a *metadata edit* takes. Both paths that carry a
-- freshly parsed book go through `rb_upsert_book` instead: `rb_save_book_start`
-- on import, `rb_replace_parsed_book` on update. That function lists its columns
-- by hand, and a jsonb key it doesn't name is simply not read.
--
-- So nothing errored. The parse read the Dublin Core record, the client sent it,
-- and Postgres dropped the six fields on the floor, silently, on every import
-- and every one of 32 updates. Listing columns by hand is what made a missing
-- one invisible; there is no way to be told about this short of looking.
--
-- Written as the whole function rather than a patch because that is the only
-- way Postgres accepts it, and because the next person needs to read one
-- definition rather than reassemble it from four.

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
    isbn, publisher, published, language, description, subjects,
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
    p_book ->> 'isbn',
    p_book ->> 'publisher',
    p_book ->> 'published',
    p_book ->> 'language',
    p_book ->> 'description',
    case
      when jsonb_typeof(p_book -> 'subjects') = 'array'
        then array(select jsonb_array_elements_text(p_book -> 'subjects'))
      else null
    end,
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
    -- `coalesce`, unlike every line above it. The six are the only fields here
    -- that a save can be *ignorant* of rather than authoritative about: a device
    -- still on an older build sends a book with no `isbn` key at all, and
    -- `excluded.isbn` would then blank one another device had already found.
    -- Nothing else in this list has that problem — a title is always sent.
    isbn                = coalesce(excluded.isbn, books.isbn),
    publisher           = coalesce(excluded.publisher, books.publisher),
    published           = coalesce(excluded.published, books.published),
    language            = coalesce(excluded.language, books.language),
    description         = coalesce(excluded.description, books.description),
    subjects            = coalesce(excluded.subjects, books.subjects),
    parser_version      = excluded.parser_version,
    imported_at         = excluded.imported_at,
    rating              = excluded.rating,
    notes               = excluded.notes,
    title_overridden    = excluded.title_overridden,
    title_clean_version = excluded.title_clean_version,
    ready               = excluded.ready;
end;
$$;
