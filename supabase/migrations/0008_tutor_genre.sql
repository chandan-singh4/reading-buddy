-- What kind of book it is, for the tutor's chip row.
--
-- A different question from `genre`, which is Google's coarse Fiction /
-- Non-fiction label and stays exactly as it is. This one decides which task
-- modules the study lamp offers: a novel gets "What's happening here?", a
-- science book gets "Still true?", and neither gets the other's.
--
-- Null for every book, and null is the normal state. The app guesses the kind
-- from `subjects`, `genre` and `type` (see `web/src/reader/genre.ts`), so this
-- column holds only what the reader has said in their own words by tapping a
-- different one. Nothing overrules a person, and nothing else writes here.
--
-- Additive only, as `0007` was, and for the same reason: the SQL editor and the
-- Vercel deploy are two manual steps that can happen in either order.

alter table public.books
  add column if not exists tutor_genre text;
