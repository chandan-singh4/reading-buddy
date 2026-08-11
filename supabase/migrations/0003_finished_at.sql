-- The day a book was finished, written once and never again.
--
-- "Finished" was already derivable — a position row at 100% — but only as a
-- fact, not as a date. A position's `at` is the last page turn, so reopening a
-- finished book to check a quote moved the day it was finished. Harmless on a
-- shelf; a lie in a yearly total, and the kind that moves a book from one year
-- into the next.
--
-- Nullable, and null on every book finished before this existed. The app fills
-- those in at boot from the position's own date (`backfillFinishedAt`), which
-- is the best evidence there is and exactly right for a book not opened since.

alter table public.books
  add column if not exists finished_at timestamptz;

-- Stats reads this as "books finished in a year", so the sort is the access
-- pattern. Partial, because most rows are null and always will be — an unread
-- book is the normal state of a shelf.
create index if not exists books_finished_at_idx
  on public.books (user_id, finished_at desc)
  where finished_at is not null;
