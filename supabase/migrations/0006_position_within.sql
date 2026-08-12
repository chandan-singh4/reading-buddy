-- How far past the saved paragraph the reader actually was.
--
-- A position names a paragraph, not a page, and it names the paragraph the
-- visible page *begins in* — which is the right thing to record and the wrong
-- thing to reopen on. A paragraph long enough to run over several columns
-- starts pages earlier than the one being read, so reopening landed short:
-- most visibly at the end of a book, where the last page sits deep inside a
-- long closing paragraph and the reader was returned eight pages back, on
-- every open, identically.
--
-- Nullable, and null on every position saved before this existed. Null is read
-- as zero, which is exactly the old behaviour — a place with no offset stored
-- has no better answer than the start of its paragraph.

alter table public.positions
  add column if not exists within integer;

-- No index. This is never filtered or sorted on; it is only ever read back
-- alongside the anchor it qualifies, on a row already found by book.
