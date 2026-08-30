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

## Third pass — one visit, one session (2026-08-28, later)

The reader opened a book, looked at the book details, came back, and closed it.
The screen recorded three sessions. Two of them were seconds long.

**The cause.** `book/:bookId`, `book/:bookId/info`, `book/:bookId/last-time`
and `book/:bookId/chapters` are four *sibling* routes, not a parent and its
children. The reading screen therefore unmounts whenever the reader opens the
book details, and the clock lived inside it.

**The rule, in the reader's words.** Once I am in the book, whatever I do in the
book is one session. Closing the book ends it.

**The fix.** The clock moved up to `App`, which never unmounts, and is keyed on
the book id in the address (`stats/useReadingClock.ts`). Moving between the four
screens does not change that id, so nothing starts or stops. The reading screen
keeps only the *place*, which it reports through `stats/place.ts` — a module
variable, because the screen unmounts while the session continues.

No grace timer. The address changes in one step and never passes through a
moment of being nowhere.

**Also:** the "READING BUDDY" kicker above the Statistics heading is gone. The
app's name is in the bar directly above it.

### Delete next session

`web/src/stats/repair.ts` and its one call in `stats/load.ts`. It is a one-off
edit of the evening of 2026-08-28: it drops that day's sub-minute rows and
copies the chapter and section titles onto the hour that had none. The reader
confirmed both facts. It runs once, behind a flag in `localStorage`.

## Fourth pass — the day as a commit log (2026-08-28, later)

The reader's own analogy, and the right one. A day's total is a diffstat: true,
and impossible to check. A git log is readable because it groups by repository,
hangs each change off one line, and squashes the noise. A day of reading has
those same three problems.

`stats/DayLog.tsx` draws it:

- **Grouped by book.** A book is a repository: cover mark, title, author, and
  the time in that book that day. The book read most that day leads.
- **A branch line of commits.** Start time, then the chapter and section in
  bold, then a quieter diff line: duration, highlights, chats with Veda and the
  Q&A in them. A count of zero is left out, never printed as "0". Anything of
  Veda's is violet, as everywhere else in the app.
- **Filled node for a sitting, hollow for a lookup** (under two minutes). Drawn
  rather than labelled, because it is a hint and not a claim.
- **Micro-sessions squashed.** Anything under a minute folds into one row that
  says how many, and opens when tapped. Nothing is discarded, and the squashed
  rows still count towards every total.

**Highlights and Veda are real, counted, and new.** A note carries a `createdAt`
and a highlight is a note with a colour, so the highlights made inside a
session's window are countable without storing anything new. `noteStore` gained
`allNotes()`, and `StatsSources` gained `notes`.

The reader's typed notes are **not** counted. The line reports the chats with
Veda instead, and the questions asked in them — counted by the timestamp on each
message, so a thread picked up again tomorrow belongs to tomorrow for
tomorrow's questions. The reader asked for this by name.

See `docs/decisions.md`, "The day's reading is drawn as a git log", for the
whole mapping.

**Two kinds of repetition are trimmed** from a heading, both the book's habit
rather than ours: a chapter that repeats the book's title, and an EPUB heading
with the author glued to the end ("Part 1: Approaching the Unconscious Carl G.
Jung").

### Not built: pages

The spec asked for `+24 pages (pp. 25–49)`. **Pages are not a fact this app can
state.** The reader is reflowable and paginates into columns at the reader's own
text size, so the same reading gives different page numbers on a different day
or a different phone. A page range would look precise and be arbitrary.

The honest version of that number is sections advanced, which is stable across
text sizes. It needs the session to record where it *started* as well as where
it ended, and there is no back-data for it. Not started — ask the reader first.

## Pass 5 — the year, the ends, and the calendar (2026-08-29)

The reader tested with real reading again. Six changes:

1. A sitting that runs past midnight now says so. The row keeps the day it
   started. The time range names the day it ended: `11:41 pm – 12:25 am ·
   Aug 29`. The day summary adds `· ran past midnight`.
2. Every commit line shows the end time, not only the start.
3. The heatmap legend moved to directly under the grid.
4. The heatmap is one calendar year, Jan to Dec. A year picker sits at the top
   right of the card. It defaults to the current year and lists every year with
   data. A past year opens at January; the current year opens at today.
   `AllTimeStats` now carries `byDay`, so the screen can slice any year.
5. "Break It Down" is now "A closer look". The screen opens on Day, not Week.
6. The range calendar was transparent. `Portal` moves it out of `.shell`, so it
   lost the palette. The tokens are now declared on `.shell, .backdrop`.

A small one found while checking: the grid starts on the Monday before Jan 1, so
the first column can hold December days. Its "Dec" label collided with "Jan".
The label is dropped; the days stay.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 6 — the period's goal and the focus window (2026-08-29)

1. "· ran past midnight" is gone from the day summary. The commit line already
   names the day the sitting ended.
2. The Day scope names the weekday: `Today · Saturday, Aug 29`.
3. New `stats/goal.ts` — the target each scope is measured against. New
   `stats/PeriodGoalCard.tsx` draws it as one bar inside the period card.
4. New `stats/circadian.ts` — reading spread over the 24 hours of the day. New
   `stats/Spectrum.tsx` draws it, with the peak window named.

Both live inside the period card, under the trio, so they move with the toggle.
See `docs/decisions.md` for the targets and the two rules that keep them honest.

The design came from a reference the reader supplied. Its palette was not
copied: the screen's own tokens already mean the same things (green is done,
amber is time), and a second palette would break the key.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 7 — the clock, the calendar, and two folds (2026-08-29)

1. New `stats/spread.ts`. Every count of minutes now follows the clock, so a
   sitting that crosses midnight feeds both days — the heatmap, the streak, the
   period total, the daily goal, the chart and the focus window. The commit log
   still files a sitting under the day it began, and a crossing row now reads
   `19 min of 44 min` so the day's total adds up.
2. The range calendar's month arrows always work. Only the *days* are bounded.
   The arrows also step from the previous state, so two fast taps move two
   months.
3. The day's log folds. The summary line is the button; it opens by default,
   because the reader tapped a square to see it.
4. The heatmap folds to one week: seven squares, no year picker, no key. Tapping
   it opens the year; the chevron closes it. Collapsing with a day selected
   keeps that day's week on screen, with the day still ringed.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 8 — letting go, and the pacing card (2026-08-29)

1. The heatmap clears its selection: tap the chosen square again, or tap the
   card's background. The day's log goes with it.
2. New `stats/trajectory.ts`, `stats/Trajectory.tsx` and
   `stats/trajectory.module.css` — the pacing forecast. It sits at the very
   bottom of Book details, and only for a book in progress (percent above 0 and
   below 100). `BookInfo.tsx` loads the book's own sessions through
   `sessionStore.forBook`, in its own effect, and fails quietly.

Two deviations from the reference, both stated on the card itself:

- There is no historical record of progress, so the past curve is drawn from
  cumulative minutes, scaled to today's real percentage.
- There is no "original target date" in the app, so the dotted reference line is
  the monthly goal: this book finished within 30 days of starting it.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 9 — the third heading level (2026-08-29)

The reader found "The soul of man" in *Man and His Symbols*. The publisher set it
as `<h3>`; the app drew it as bold prose and knew nothing about it.

**The cause.** `parse/assemble.ts` read only the two shallowest heading levels.
Everything deeper was demoted to prose. It is not one book: *Be As You Are* lost
36 headings the same way, *Nondual Love* 21, *Man and His Symbols* 23.

**The fix.** New `isSection` in `assemble.ts`. Every heading level below the
chapter opens a section. A *guessed* heading — one inferred from type size —
still divides only at the exact section level. See `docs/decisions.md`.

The contents page and "Summarize with Veda" needed no change. Both already work
from titled sections, so the new sections appear in each.

`PARSER_VERSION` is 34. Every book re-parses.

### Files in scope

- `web/src/parse/assemble.ts` — `isSection`, and the grouping rule.
- `web/src/parse/version.ts` — 34.
- `web/src/parse/blocks.test.ts` — two tests.
- `web/src/parse/library.report.ts` — read only, run by hand for the numbers.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 10 — the marks follow the book (2026-08-29)

Pass 9 divided several books differently. That moved every paragraph after each
new section, and an anchor is a position — so the reader's highlights and their
conversations with Veda pointed at places that no longer held those words. They
were still in storage. Nothing could draw them.

1. New `web/src/storage/relocate.ts`. A re-parse re-finds each mark by the words
   it stores. It never deletes. See `docs/decisions.md`.
2. `reparseBook` calls it, quietly, after the book is saved.
3. `PARSER_VERSION` is 35. The text comes out exactly as 34 left it; the bump
   exists to run the relocation.
4. The flat notes list reads newest first (`inRecentOrder`). Grouped by chapter
   it still follows the book.

Proved against the reader's own file: the highlight and the thread on
`[ch06-s06-p050]` both moved to `[ch06-s07-p069]`, which is where the parse puts
those words.

### Files in scope

- `web/src/storage/relocate.ts` + its test — new.
- `web/src/storage/index.ts` — exports it.
- `web/src/import/importBook.ts` — calls it at the end of `reparseBook`.
- `web/src/parse/version.ts` — 35.
- `web/src/reader/notes.ts`, `reader/index.ts`, `reader/NotesPanel.tsx` — the
  flat list's order.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 11 — the tap and the page number (2026-08-29)

1. `reader/selection.ts` — `highlightAt` tests the highlight's own line boxes
   instead of the caret under the finger. A tap on the empty half of a page no
   longer opens the highlight, so the toolbar can be raised there.
2. `pages/Reader.tsx` — the notes and bookmarks lists now measure each mark's
   page. The sections holding marks are read once in the background; until they
   arrive the old section-opening estimate stands.

See `docs/decisions.md` for both.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 12 — Veda's kept lines, and the heatmap shades

- `storage/relocate.ts`: threads move first and hand their anchors to the notes.
  A note with `fromThread` takes the thread's anchor instead of searching the
  text for words that are not in the book.
- `parse/version.ts`: `PARSER_VERSION` 36. The reader must re-parse once more to
  put the kept lines right.
- `stats/gather.ts`: `levelOf` gives one shade an hour, to a fifth shade at 4h+.
  `stats.module.css` gained `--h5` and `.l5`; `Heatmap.tsx` gained the sixth
  legend swatch.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 13 — the log says what the visit was

- `storage/db.ts`: `StoredSession.activity`, a `SessionActivity`. Not indexed,
  so there is no Dexie version bump.
- `stats/timer.ts`: tallies active time per screen and writes the longest.
- `stats/useReadingClock.ts`: `activityInPath` reads the screen off the address.
- `pages/Reader.tsx`: reports the open panel (notes, contents, bookmarks).
- `stats/DayLog.tsx`: `Book details · <chapter>` in place of `Reading`.

**Delete next session:** `web/src/stats/repair.ts` and its call in
`stats/load.ts`, once the reader has opened Statistics on the phone.

## Pass 14 — four shades, not five

The heatmap ramp now stops at four: 1-60, 60-120, 120-180, and 180+. `--h5` and
`.l5` are gone, and the legend shows the blank day plus four shades.
