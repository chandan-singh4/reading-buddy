# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

**WP-65 — the split front door.** Inhale and exhale. The home page becomes two
halves: the book above, the journal below. Both doors are open at once.

The reader opens the app and sees both ways in. No screen asks which one they
came for. A tap in a half opens that half; the other half folds to a lip at the
screen edge and still reports its state. A tap on the lip brings it back.

### Settled before building

From `docs/decisions.md`, 2026-10-18 — "The front door is a split, and it does
not guess" and "A tap goes straight through". The mockup is
`docs/mockups/inhale-exhale.html`.

1. **An even split, at every hour.** The halves stay equal, morning and night.
   The app does not guess what the reader came for.
2. **No streak.** A streak turns a journal into a duty. The entry count and the
   last line carry the same sense of continuity with none of the threat.
3. **Each half is a surface with zones, not one button.** The common act is
   direct. The wider view is one deliberate tap away.
   - Cover, or Resume → the book, at the saved page. No list in between.
   - The question, or the circle → a new entry, typed or spoken.
   - Library (n), or Archive (n) → the full list.
   - Anywhere else in a half → the half opens.
4. **One side continues, the other starts.** The reader almost always carries on
   the same book, so reading resumes. Every entry is new, so the journal begins.
5. **The opened half is the home page.** The app gains no screen to hold the
   choice. It loses one.
6. **The folded half stays as a 52 px lip** and still names its state.
7. **The bridge sits on the seam** and carries the last mark into a new entry.
   It hides while a half is open.
8. **With no book on the go, the reading half shows the shelf** instead of
   presuming a page to resume.

### What each half shows

**The reading half (the dark board).** Minutes read today. The percent, the
title, and the reader's last mark in reading serif. The cover and a Resume
button, both to the book. A footer with the finish forecast and "Library (n)".
Opened, it adds the shelf.

**The journal half (paper).** Today's date. A question by the hour of the day. A
circle that listens at once. A footer with the last entry's first line and
"Archive (n)". Opened, it adds today's entries.

### What leaves the front door

The four curated shelves and the full pace strip. The shelf is in the opened
reading half and in `/library`, which already holds every book, search and
filter. `PaceHorizon` stays on the book's own details page. The front door
keeps the forecast as one line.

### Files in scope

- `web/src/pages/Home.tsx` — the split door. Rewritten.
- `web/src/pages/Home.module.css` — the two halves, the lip, the bridge.
- `web/src/pages/Home.test.tsx` — rewritten for the door.
- `web/src/journal/prompts.ts` — new. The question by the hour.
- `web/src/journal/prompts.test.ts` — new.
- `web/src/journal/SpeakSheet.tsx` — two new props: `prompt` and `listenAtOnce`.
- `web/src/journal/SpeakSheet.test.tsx` — the two new props.
- `web/src/app/homeShelves.ts` — read only. The shelf the opened half shows.
- `web/src/storage/notes.ts` — read only. The last mark.
- `web/src/stats/sessions.ts` — read only. The minutes today.
- `web/src/app/AppShell.module.css` — read only. `--top-bar-height`.
- `docs/mockups/inhale-exhale.html` — the layout.

## Deferred — kept for the day it reopens

**WP-27 — show the reader what the models cost. Deferred 2026-10-16.**
Every model the reader uses is free, so the screen shows zero, and a price
table goes stale. The notes below stay accurate and cost nothing to keep.

Two models run without the reader asking: the Scribe writes a chapter summary
when a chapter ends (`summary/engine.ts`), and the digest runs by itself
(`tutor/digest.ts`). Nothing tells the reader what that costs, and there is no
cap. WP-09 and WP-18 are declined, so this is now the largest open piece with
WP-22.

**The good news: the numbers already arrive.** The relay reads the token counts
off every provider and sends them to the client as a `usage` packet
(`api/tutor.ts` → `counted()`, `{ t: 'usage' }`). The client parses it into
`TutorUsage` (`reader/tutor.ts` → `usageOf`).

**The gap: nothing stores them.** `StoredTutorThread.messages[]` keeps `model`
and `ts` but no usage, and the summary and digest paths keep nothing at all.
So the work is two steps, in this order.

### Step 1 — keep the count (do this first)

1. Add `usage?: TutorUsage` to `StoredTutorThread.messages[]`, and a Dexie
   **v20** block. Read the comment above `db.version(19)` first: Dexie declares
   *indexes* only, and nothing queries by usage, so an unchanged store string
   needs **no** version block. Add one only if an index is truly needed.
2. Store the usage on the assistant message where `model` is already stored.
   Absent must mean "unknown", never "zero" — every message stored before this
   has no count, exactly as `model` does.
3. Keep the count for the two unasked callers as well. They are the ones the
   reader cannot see.
4. `storage/sync/sync.ts` mirrors eleven tables by row, so a new field on an
   existing row needs no sync change. Confirm that, do not assume it.

### Step 2 — show it

A screen per book, per session and per model tier. Price is **not** in the
token count, so a tokens-to-money table has to live somewhere and will go
stale; prefer showing tokens plainly over showing a wrong price. Settle this
with the reader before building the money half.

### Definition of done

1. A new Veda answer stores its input and output token counts.
2. A chapter summary written by the Scribe stores its counts too.
3. A message stored before this change still renders, with no count shown and
   no zero.
4. One screen shows totals per book and per model.
5. `npm run build` is green.

### Open question for the reader — settle before step 2

Tokens only, or tokens and an estimated cost? A price table is the only way to
show money, and it goes stale every time a provider changes its rates. Most
of the reader's models are free, so the honest number may be zero most of the
time.

### Files in scope

- `api/tutor.ts` — `counted()`, the `Usage` interface, the `{ t: 'usage' }`
  packet. Read-only for step 1; the counts already leave here.
- `web/src/reader/tutor.ts` — `TutorUsage`, `usageOf`, the stream reader.
- `web/src/storage/db.ts` — `StoredTutorThread`, and the `db.version(19)`
  comment about when a version block is needed.
- `web/src/storage/tutor.ts` — the writes that store a message.
- `web/src/summary/engine.ts` — the Scribe, one of the two unasked callers.
- `web/src/tutor/digest.ts` — the digest, the other one.
- `web/src/storage/sync/sync.ts` — only to confirm a new field needs no change.

## Three chores for the reader — none needs code, none blocks WP-27

1. **Run Library → Update.** It moves the shelf to `PARSER_VERSION` 39 and
   brings back the marks that versions 37 and 38 stranded.
2. **Prove the backup on the phone.** Open the app with a signal, wait 10
   seconds, then look in Supabase → Table Editor → `user_rows` for rows with
   `tbl` = `notes` and `tbl` = `tutor`. Make one new highlight; a new `notes`
   row must appear in a minute. If the table stays empty, look at
   `storage/sync/remote.ts` first: `userId()` returns nothing without a live
   session, and every push error is swallowed, so an empty table proves
   nothing by itself.
3. **Open the model picker** and say whether the free list grew past six.
