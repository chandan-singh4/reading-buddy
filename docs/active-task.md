# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

**WP-60 — speak an entry.** The first slice of the journal.

The reader holds a circle and talks. The words appear as they speak. The screen
stays awake. The app saves the raw transcript and nothing else.

**Done when all five are true.**

1. A circle starts and stops the recogniser.
2. The words appear live. A guess shows grey. A settled phrase turns black and
   gains its punctuation.
3. The screen does not go dark while the reader speaks.
4. The recogniser starts again by itself after a silence, until the reader
   stops it.
5. The entry saves to Dexie v20 `entries`, with `raw`, `at` and `id`. No audio
   is stored.

**Out of this slice.** The shaping models (WP-62), the book link (WP-63), tags
(WP-64) and the front door (WP-65). The journal list screen is WP-61. For now,
one saved entry may be proved from the console.

**The app has never listened.** `narrator/` and `reader/readAloud.ts` only
speak. There is no microphone code in `web/src`.

**The design is settled.** Read `decisions.md` at the seven headings dated
2026-10-18, and `architecture.md` at "The journal (WP-60 onward)". Do not
re-open those choices.

### Files in scope — as built, 2026-10-18

| Path | What it does |
|---|---|
| `web/src/journal/useDictation.ts` | **new.** Wraps the Web Speech API. Keeps the settled words apart from the guess, and starts the recogniser again after a silence. |
| `web/src/journal/useWakeLock.ts` | **new.** Holds the screen awake, and asks again when the page comes back. |
| `web/src/journal/SpeakSheet.tsx` | **new.** The sheet: circle, live transcript, timer, Keep and Discard. |
| `web/src/journal/SpeakSheet.module.css` | **new.** Its styles, on the theme tokens. |
| `web/src/storage/journal.ts` | **new.** `addEntry`, `listEntries`, `getEntry`, `deleteEntry`. |
| `web/src/storage/db.ts` | `StoredEntry`, `EntryShaped`, `EntryLink`, the `entries` table and `db.version(20)`. |
| `web/src/storage/index.ts` | Exports the new store and types. |
| `web/src/pages/Journal.tsx` | **new.** The `/journal` route. Almost nothing: a way in, and the list. WP-61 replaces the body. |
| `web/src/pages/Journal.module.css` | **new.** Its styles. |
| `web/src/App.tsx` | The `journal` route, outside `AppShell`. |
| `web/src/pages/Home.tsx` | One link, "Or speak a thought". WP-65 replaces it with both doors. |
| `web/src/pages/Home.module.css` | `.toJournal`. |

Add a path here with a one-line reason before you open anything else.


---

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
