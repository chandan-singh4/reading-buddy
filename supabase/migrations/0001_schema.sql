-- Reading Buddy — the cloud half of the storage layer.
--
-- A straight translation of the Dexie schema in `web/src/storage/db.ts`, with
-- three deliberate differences:
--
--   1. **Every row carries a `user_id`, and Row Level Security is on
--      everywhere.** This is what makes it safe to put the Supabase key in the
--      browser at all: the key gets you to the front desk, the policies below
--      decide what you may take out. Without them a public key is a public
--      library.
--
--   2. **`sources` and `assets` hold a pointer, not the bytes.** The original
--      file and the pictures live in Cloudflare R2; these tables keep the key,
--      the size and the media type so that "how much is this costing me?" and
--      "which books can be updated?" stay one cheap query, exactly as they were
--      when `size` was denormalised onto the Dexie row.
--
--   3. **`books.ready`.** IndexedDB gave `saveParsedBook` a real transaction
--      spanning four tables. Over HTTP a large book's sections have to be sent
--      in several requests, so instead the book is written not-ready, the
--      sections follow, and one final update makes it visible. A half-uploaded
--      book is therefore invisible rather than half-present — the same promise
--      the transaction made, kept a different way. See `0002_functions.sql`.
--
-- Run this once, in the Supabase SQL editor. See `docs/cloud-setup.md`.

-- ---------------------------------------------------------------------------
-- Books
-- ---------------------------------------------------------------------------

create table if not exists public.books (
  id                  text primary key,
  user_id             uuid not null default auth.uid()
                        references auth.users (id) on delete cascade,
  title               text not null,
  author              text,
  source              text not null check (source in ('epub', 'pdf', 'md', 'txt', 'docx')),
  type                text not null check (type in ('light-fiction', 'dense-technical')),
  subject             text,
  type_overridden     boolean,
  shelf               text check (shelf in ('book', 'paper', 'document')),
  shelf_overridden    boolean,
  -- A plain array rather than a join table, mirroring `*folderIds`. The GIN
  -- index below is the Postgres equivalent of Dexie's multiEntry index, so
  -- "show me this folder" stays a lookup rather than a scan of the shelf.
  folder_ids          text[],
  content_hash        text,
  text_signature      text,
  parser_version      integer,
  imported_at         timestamptz not null,
  rating              smallint check (rating between 1 and 5),
  notes               text,
  title_overridden    boolean,
  title_clean_version integer,
  -- False only while a book's sections are still being uploaded. Every read
  -- path filters on it, so a partial import is never visible on the shelf.
  ready               boolean not null default true
);

create index if not exists books_user_imported_idx
  on public.books (user_id, imported_at desc);
create index if not exists books_content_hash_idx
  on public.books (user_id, content_hash);
create index if not exists books_text_signature_idx
  on public.books (user_id, text_signature);
create index if not exists books_folder_ids_idx
  on public.books using gin (folder_ids);

-- ---------------------------------------------------------------------------
-- Manifest, chapter index, sections
--
-- The nested arrays stay JSONB. They are always read whole and never queried
-- into — a manifest's chapter list and a section's paragraphs are single values
-- as far as this app is concerned, and shredding them into rows would buy
-- nothing but joins on the hot path.
-- ---------------------------------------------------------------------------

create table if not exists public.manifests (
  book_id  text primary key references public.books (id) on delete cascade,
  user_id  uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  title    text not null,
  chapters jsonb not null default '[]'::jsonb
);

create table if not exists public.chapters (
  book_id  text not null references public.books (id) on delete cascade,
  chapter  integer not null,
  user_id  uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  title    text not null,
  path     text not null,
  sections jsonb not null default '[]'::jsonb,
  primary key (book_id, chapter)
);

create table if not exists public.sections (
  book_id    text not null references public.books (id) on delete cascade,
  path       text not null,
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  chapter    integer not null,
  section    integer not null,
  title      text,
  paragraphs jsonb not null default '[]'::jsonb,
  primary key (book_id, path)
);

-- `listSections` reads a whole book in reading order for in-book search. The
-- primary key orders by the *text* of the path, which is right only while the
-- numbers stay zero-padded to the same width — this index sorts on the numbers,
-- which cannot drift the day a book has more than 99 chapters.
create index if not exists sections_reading_order_idx
  on public.sections (book_id, chapter, section);

-- ---------------------------------------------------------------------------
-- Reading position
-- ---------------------------------------------------------------------------

create table if not exists public.positions (
  book_id text primary key references public.books (id) on delete cascade,
  user_id uuid not null default auth.uid()
            references auth.users (id) on delete cascade,
  anchor  text not null,
  at      timestamptz not null default now(),
  percent smallint check (percent between 0 and 100)
);

create index if not exists positions_recent_idx
  on public.positions (user_id, at desc);

-- ---------------------------------------------------------------------------
-- The two tables whose bytes live in R2
-- ---------------------------------------------------------------------------

-- The file a book was imported from. `r2_key` is where the bytes actually are;
-- `size` is kept here so the shelf can total up what the kept files are costing
-- without touching a single object.
create table if not exists public.sources (
  book_id      text primary key references public.books (id) on delete cascade,
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  r2_key       text not null,
  filename     text not null,
  size         bigint not null,
  content_type text
);

-- One picture. `path` is the archive path the parser recorded in `image.src`,
-- so a figure resolves without anything being looked up at read time.
create table if not exists public.assets (
  book_id      text not null references public.books (id) on delete cascade,
  path         text not null,
  user_id      uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  r2_key       text not null,
  content_type text,
  size         bigint not null default 0,
  primary key (book_id, path)
);

-- ---------------------------------------------------------------------------
-- The reader's own additions
-- ---------------------------------------------------------------------------

create table if not exists public.quotes (
  book_id  text not null references public.books (id) on delete cascade,
  id       text not null,
  user_id  uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  text     text not null,
  added_at timestamptz not null default now(),
  primary key (book_id, id)
);

create table if not exists public.folders (
  id         text primary key,
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- One folder per name per reader, matched case-insensitively. Two folders
-- called "Philosophy" is a library you can no longer reason about, so the
-- database refuses it outright rather than trusting every caller to check.
create unique index if not exists folders_name_unique_idx
  on public.folders (user_id, lower(name));

create table if not exists public.bookmarks (
  book_id  text not null references public.books (id) on delete cascade,
  id       text not null,
  user_id  uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  anchor   text not null,
  label    text not null,
  added_at timestamptz not null default now(),
  primary key (book_id, id)
);

create index if not exists bookmarks_book_idx on public.bookmarks (book_id);
create index if not exists quotes_book_idx    on public.quotes (book_id);
create index if not exists assets_book_idx    on public.assets (book_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Enabled on every table, with exactly one door: you may touch a row whose
-- `user_id` is yours. `using` governs which existing rows you can see, change
-- or delete; `with check` governs what you're allowed to write — both are
-- needed, or you could read only your own rows while happily inserting rows
-- owned by someone else.
--
-- Note there is no policy for the anonymous role at all. Signed out, every one
-- of these tables reads as empty, which is the correct answer.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'books', 'manifests', 'chapters', 'sections', 'positions',
    'sources', 'assets', 'quotes', 'folders', 'bookmarks'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (user_id = (select auth.uid())) '
      || 'with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
  end loop;
end
$$;
