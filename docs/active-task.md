# Active task

> **What's in here:** the one task in flight, what "done" means, and the exact
> files to open. Read this first. Do not read the codebase around it.

## Task: the Statistics screen

Build the Stats tab from `design-inspiration/reading-buddy-stats.html`. The
reference is the visual specification. Copy its order, spacing, type, colours,
radii and shadows. Every number in it is sample data and must be replaced.

The previous task, "judge the 2026-08-28 work on the phone", is parked. It needs
a device and no code. See `progress.md`.

### What the screen shows, top to bottom

1. Streak
2. Heatmap of the days you read
3. Scope toggle (Day / Week / Month / Year / Custom) and a range line
4. Period summary
5. Veda
6. Books and time
7. Genres

The reference's last card, the handwritten insight, is **not** built. It needs a
rule nobody has written yet.

### The three decisions taken at the start

0. **A reading session is one visit to a book.** It starts when the book opens
   and stops when it closes. There is no idle rule. The reader removed it
   mid-build: a half-hour spent arguing with Veda about one paragraph is
   reading, and a pause detector would have discarded it. The one guard is a
   six-hour cap per session, so a book left open overnight is credited with a
   long sitting and not a whole night.
1. **Reading sessions are device-local.** A new Dexie table, outside
   `Repository`. This is the rule `tutor` and `notes` already follow: the cloud
   backend has no such table, and adding one is a Supabase table, a cached read
   and an outbox entry, not one method. The cost is stated: the numbers do not
   follow the reader between devices.
2. **The fourth Veda tile is "tags created".** The reference asks for "revision
   flags cleared". Nothing in the app sets or clears a revision flag. The tile
   counts the distinct concept names Veda wrote when it summarised a chapter in
   the period — the tags the reader takes to Obsidian.
3. **The insight card is left out.** See above.

### Reading time

- The timer starts when a book opens.
- It stops when the book closes.
- One session is never credited with more than 6 hours.
- The row is written every 30 seconds while the book is open. A phone that
  kills the tab therefore loses at most 30 seconds, not the whole session.
- "Tracking start" is the first day any reading was recorded. It is derived
  from the session rows, not stored a second time.

### What the scope toggle drives

It drives the period summary, the Veda card and the books-and-time chart. It
does **not** touch the streak, the heatmap or the genres.

### Done when

1. The screen matches the reference at 430 px and does not overflow at 360 px.
2. Opening a book, reading, and closing it records one session of about the
   right length. A book left open overnight records 6 hours, not 9.
3. Every number comes from stored data. No sample data is left.
4. The calendar cannot select a day before tracking start or after today. The
   month arrows stop at the same two walls.
5. A legend tap hides its line. The last visible line cannot be hidden.
6. `npm run build` is green.

### Status: built, tested, and seen in a browser

Every check above is met except the two that need a device. The screen was
proved against 122 seeded sessions in a desktop browser: all four scopes, the
legend toggles, the calendar's two walls, a custom range, and the heatmap tap.
The seeded rows were deleted afterwards.

**Not yet seen on a phone.** The whole screen, and the timer especially — no
real session has ever been recorded by a real reader closing a real book.

### Files in scope

New:

- `web/src/stats/sessions.ts` — the session table and its store.
- `web/src/stats/timer.ts` — the active-session timer.
- `web/src/stats/period.ts` — a scope to a date range, its previous range, its
  buckets.
- `web/src/stats/gather.ts` — reads every source, returns the screen's numbers.
- `web/src/stats/genres.ts` — publisher subject headings to a top-level genre.
- `web/src/stats/Heatmap.tsx`, `ScopeBar.tsx`, `RangeCalendar.tsx`,
  `BooksTimeChart.tsx`, `GenreBars.tsx`, `stats.module.css`.

Changed:

- `web/src/storage/db.ts` — schema version 17, the `sessions` table.
- `web/src/pages/Stats.tsx` — replaced.
- `web/src/pages/Reader.tsx` — starts and feeds the timer.

Read only:

- `web/src/structure/types.ts` — `BookMeta.subjects`, `genre`, `finishedAt`.
- `web/src/storage/db.ts` — `StoredTutorThread`, `StoredChapterSummary`,
  `StoredConcept`.

## Second pass — after the first real hour of reading (2026-08-28)

The reader read for one hour, looked at the screen, and asked for four changes.
All four are done.

1. **The heatmap tip now tells the whole day.** A tapped square lists every
   sitting: start time, end time, minutes, the book, and the chapter and section
   the reader reached. A day of "63 min" is a number nobody can check. Two books
   and two sittings is a record they can recognise.
   - `StoredSession` gained `chapterTitle` and `sectionTitle`. Both optional.
     Titles, not chapter numbers: the tip must name the place months later, and
     a book can be deleted or reimported in between.
   - **No schema version was added.** Dexie declares indexes only, and neither
     field is one. A version block with an unchanged store string would migrate
     every install to say nothing.
   - The Reader hands the timer a *function* that reports the place. A value
     would restart the session at every page turn.
2. **"Answers from Veda" is gone.** It was equal to the questions on every real
   day, because a reply follows a question. One tile now says "questions asked
   and answered".
3. **"Explain-backs done" is replaced by "chapters summarised".** The old tile
   counted only replies to Veda's Socratic probes, which are rare. It read zero
   on days full of conversation, which taught the reader to distrust the card.
4. **Genres count books that were read, not books that were imported.** A shelf
   of 14 imports and one hour of reading reported "Philosophy 14", and tapping
   the bar listed thirteen books that were never opened. `summariseAll` now
   filters the library by the books with a session.

### Status

Built, tested and seen in a browser against seeded data — two books in one day,
one older session with no place recorded, and one unopened book that the genre
bars correctly ignore. The seeded rows were deleted afterwards.

**Still not seen on a phone.**
