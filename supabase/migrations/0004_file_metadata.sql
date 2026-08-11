-- What the book's own file already said about itself.
--
-- An epub carries a Dublin Core record and the parser read two lines of it —
-- title and creator — then walked past the rest. These six columns are the
-- rest. No network, no key, no guessing: the publisher wrote them.
--
-- `isbn` is the load-bearing one. It is what turns the catalogue lookup that
-- follows into an exact fetch rather than a title search, which confidently
-- returns the wrong edition, an audiobook, or a study guide.
--
-- All nullable, and null on every book imported before this existed. Nothing
-- backfills them: unlike `finished_at`, they cannot be derived from anything
-- already stored — only from the original file, via the shelf's Update button.

alter table public.books
  add column if not exists isbn text,
  add column if not exists publisher text,
  -- `text`, not `date`. Most epubs give a bare year, and a `date` column would
  -- force that to 2019-01-01 — inventing a month and a day the file never
  -- claimed. Stored at whatever precision the publisher offered: `2019`,
  -- `2019-03` or `2019-03-14`.
  add column if not exists published text,
  add column if not exists language text,
  add column if not exists description text,
  -- The publisher's own subject headings, usually BISAC. An array rather than a
  -- joined string because Stats will want to count them, and splitting a text
  -- column back apart is how a category with a comma in it becomes two.
  add column if not exists subjects text[];

-- The lookup key, so "do I already have this edition?" stays a lookup once the
-- catalogue step starts filling these in. Partial: most rows are null today and
-- the ones that matter are the ones that aren't.
create index if not exists books_isbn_idx
  on public.books (user_id, isbn)
  where isbn is not null;
