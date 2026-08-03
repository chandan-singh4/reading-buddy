/**
 * Which build of the parser a book was made by.
 *
 * A parsed book is a *snapshot*. Nothing re-reads the original file while
 * reading — the text, the anchors, the links and the block kinds were all
 * decided once, at import, and are then permanent. So improving the parser does
 * nothing whatever for the books already on the shelf, and says nothing about
 * itself: the reader sees the old behaviour, concludes the fix didn't land, and
 * the only remedy is deleting the book and finding the file again.
 *
 * Bumping this number is how a parser change announces itself. The shelf
 * compares each book's stamp against it and offers to rebuild the ones behind —
 * from the original file, which is now kept for exactly this purpose (see
 * `storage`'s `sources` table).
 *
 * ## Bump this when — and only when — a change alters what a book *becomes*
 *
 * Parsing differently: a new block kind, different chapter splitting, links
 * that used to be dropped, furniture that used to survive. Not for a change to
 * rendering, storage or the reading screen — those take effect on their own,
 * and a needless bump asks every reader to reprocess their whole library for
 * nothing.
 *
 * Leave a line here for each bump. The shelf can't explain *why* a book is
 * behind, but this file can.
 *
 * - **1** — the first stamped build. Everything imported before this is
 *   unstamped and treated as behind, which is right: it predates the link work
 *   entirely.
 * - **2** — links inside table cells survive (a contents page is very often a
 *   two-column table, and every entry in one was dead text), and a paragraph of
 *   prose that merely contains an image is no longer turned wholesale into a
 *   figure caption.
 * - **3** — pictures. An epub's images are pulled out of the archive at import
 *   and stored beside the text, so a figure shows the plate and not just its
 *   caption. Books parsed under 1 or 2 have no pictures stored at all, which is
 *   precisely the case this stamp exists to announce.
 * - **4** — an epub's own title metadata now wins over its filename, which
 *   used to win by mistake — the guess a downloaded file's name makes is
 *   sometimes a stray id or hash, never something a reader chose, and the
 *   book's own `<dc:title>` is almost always cleaner. Its cover image, when
 *   the package names one, is now extracted too, for the shelf's cover art.
 *   Books parsed under 1–3 kept whatever title their filename produced and
 *   have no cover asset at all.
 */
export const PARSER_VERSION = 4
