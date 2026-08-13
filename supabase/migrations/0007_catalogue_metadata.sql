-- What the catalogue says, beside what the file said.
--
-- `0004` read the publisher's own record out of the epub. This is the second
-- source: Google Books, keyed on the ISBN that record already carries for 20 of
-- the 32 books on the shelf, and matched by a guarded title+author search for
-- the rest.
--
-- **Additive only, on purpose.** `subject`, `type` and `type_overridden` are on
-- their way out, and none of them is dropped here. The SQL editor and the
-- Vercel deploy are two separate manual steps that can happen in either order,
-- so a migration that removed a NOT NULL column the running build still writes
-- would break the app in the gap between them. The drops go in `0008`, once the
-- shipped code has stopped reading them.
--
-- Everything is nullable and null for every book until the lookup runs. Twelve
-- of the 32 will keep a null `google_volume_id` even afterwards — five matched
-- nothing, and Stats is required to say "n books uncounted" rather than quietly
-- under-reporting.

alter table public.books
  -- The catalogue's own identifier, and the strongest join we have. Better than
  -- the ISBN for re-fetching, because it survives an edition carrying two of
  -- them (or none), and it is what makes "refresh this book" exact rather than
  -- a second guess at the same search.
  add column if not exists google_volume_id text,

  -- Google's ISBNs, kept **beside** the file's `isbn` rather than over it. Two
  -- sources for the same fact disagree more often than you would think — the
  -- file records the edition you actually hold, the catalogue records the one it
  -- matched — and overwriting would destroy the more trustworthy of the two.
  add column if not exists google_isbn13 text,
  add column if not exists google_isbn10 text,

  -- The print edition's length. The one field Stats genuinely needs, and the
  -- reason the lookup fetches each volume twice: the search endpoint returns a
  -- stub with `pageCount` 0, and only `GET /volumes/{id}` carries the real
  -- number. Measured on Breath — 0 from the search, 280 from the volume.
  --
  -- These books have no pages. Text flows into columns, so the count changes
  -- with type size, which is why bookmarks anchor to a paragraph instead. The
  -- number is a convention that means something to a human, not a measurement,
  -- and editions disagree by ~10% (Alaska came back 1178 and 1152 and 915).
  -- Say so before someone tries to "fix" it.
  add column if not exists page_count integer,

  -- The coarse label, kept verbatim: `Fiction`, `Juvenile Fiction`,
  -- `Juvenile Nonfiction`, or `Non-fiction` for everything else.
  --
  -- Derived from *any* category starting with a Fiction heading, never from the
  -- first one — Google returned 17 categories for Breath and led with
  -- `Education / Teaching / …`, so "take the first" would have filed a book
  -- about respiratory science under Education. The fine detail lives in
  -- `subjects`, which is where a cooking book gets to be about cooking.
  add column if not exists genre text,

  -- The escape hatch, and the one override worth keeping.
  --
  -- `type_overridden` guarded a value nothing ever set, which is why it is being
  -- dropped. This is the opposite case: `genre` will be populated for every
  -- matched book and wrong for a couple of them — Bonatti's mountaineering
  -- memoir came back `Fiction` — so a later re-fetch must never run back over a
  -- correction. Same rule as `shelf_overridden` and `finished_at`.
  add column if not exists genre_overridden boolean,

  -- The public verdict, stored raw and unfiltered.
  --
  -- Both numbers, always, because one without the other is a lie: four of the
  -- 27 matched books have a rating at all, and every one of those rests on a
  -- `ratings_count` of 1 or 2. "5 stars" from a single stranger is not a
  -- verdict, and the screen says "· n ratings" beside it so the reader can see
  -- that for themselves rather than trusting a bare average.
  --
  -- `numeric`, not `real`: a rating is a decimal quantity that gets compared and
  -- averaged, and binary floating point makes 3.97 not equal 3.97.
  add column if not exists average_rating numeric(3, 2),
  add column if not exists ratings_count integer,

  -- The book's own subtitle, which the title should never have swallowed.
  --
  -- Filled from the epub's own `dc:title` refinement where the file marks one,
  -- and from the catalogue where it doesn't — Google had "The New Science of a
  -- Lost Art" for Breath. Separate from `title` so the app can render
  -- "Title: Subtitle" deliberately, rather than hoping the publisher happened to
  -- punctuate it that way.
  add column if not exists subtitle text,

  -- How the match was made, so a wrong answer is diagnosable instead of
  -- mysterious. `isbn` is an identifier and needs no guard; `strict` and `loose`
  -- are searches that passed one. Null means never looked up, or looked up and
  -- refused — those two are told apart by `metadata_fetched_at`.
  add column if not exists metadata_source text,

  -- When the catalogue was last asked. **This is what stops a network failure
  -- being recorded as a fact.** A book with a timestamp and no
  -- `google_volume_id` was genuinely asked about and genuinely not found; a book
  -- with neither was never successfully asked. Without this column the two are
  -- identical, and a rate-limited afternoon would permanently mark half the
  -- shelf "not in Google Books" — the exact failure this project already hit
  -- once, as an HTTP 429 that a first draft of the probe reported as "NO MATCH".
  add column if not exists metadata_fetched_at timestamptz;

-- Only ever set by the code above, but a typo in a backfill would otherwise be
-- invisible until something downstream tried to branch on it.
alter table public.books
  drop constraint if exists books_metadata_source_check;
alter table public.books
  add constraint books_metadata_source_check
  check (metadata_source is null or metadata_source in ('isbn', 'strict', 'loose'));

-- "Which books still need looking up?" is the question the backfill asks on
-- every run, and the answer is a shrinking handful. Partial, so the index holds
-- only the rows that are still outstanding rather than the whole shelf.
create index if not exists books_awaiting_lookup_idx
  on public.books (user_id)
  where metadata_fetched_at is null;
