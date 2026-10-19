# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

**WP-67 — a professional opinion on an entry.** One all-round reader, not a
shelf of specialists.

The reader asks for an opinion on an entry. One model reads it, decides for
itself how the entry wants to be read, **says which way it chose**, and gives a
view. The reading is stored beside the entry and can be made again or thrown
away.

### Settled before building

- **One role, all-round.** The reader asked for a role that is not a niche. So
  there is no lens list and no router: the model picks its own angle from the
  content, the way you would get a different answer from one thoughtful person
  depending on what you brought them.
- **It names the angle it chose.** This is the whole honesty of the feature.
  The frame *is* the opinion — a dream read as a decision and read as an image
  give two different answers — so the reader is told which one they are
  holding. The angle is the first line, lifted exactly as `shape.ts` lifts a
  title out of an H1.
- **It is a fourth persona, not the Scribe.** Tidy, Shape and Unpack
  reorganise the reader's words and add nothing; the Scribe speaks for all
  three. This *adds*. The reader must be able to tell those two acts apart at
  a glance, so it gets its own name: **the Counsel**.
- **It reads `raw`, never `shaped`.** An opinion must be on what the reader
  said, not on a model's rewrite of what the reader said.
- **It is not a clinician.** The reader's real entries are dreams and
  feelings. The prompt forbids diagnosis and any claim of credentials, and
  requires it to name a qualified person where health, money, law or safety
  are in the entry.
- **It is collapsed by default.** "The entry is the screen" (2026-10-19). The
  angle line shows; the body opens on a press.

**Done when all five are true.**

1. An entry with no reading offers one quiet way to ask for it.
2. The reading stores `angle`, `model`, `at` and `text`, beside the entry.
3. The screen shows the angle, and opens the body on a press.
4. Correcting the words marks the reading as made from earlier words, and
   offers to make it again. It is never silently re-run: an opinion costs a
   model call the reader did not ask for.
5. The reading can be removed without touching the words or the shape.

**Out of this slice.**

- A second reading per entry, or a shelf of named lenses. One role, one
  reading. If the reader wants a second angle they press Make it again.
- Readings on the journal list, in the backup (WP-66) or in the export.
- Tags (WP-64), the front door (WP-65).

### Files in scope

| Path | What it does |
|---|---|
| `api/tutor.ts` | A `counsel` module: `material`, `standalone`, and the prompt. |
| `web/src/journal/relay.ts` | **new.** The one call to the journal's models, extracted from `shape.ts` so two callers do not hold two copies of the stream reader. |
| `web/src/journal/shape.ts` | Uses `relay.ts`. Keeps `titleOf`. |
| `web/src/journal/counsel.ts` | **new.** `askCounsel`, and the angle lifted off the H1. |
| `web/src/journal/marks.tsx` | `CounselMark` — spectacles. A second look. |
| `web/src/storage/db.ts` | `EntryCounsel`, and `StoredEntry.counsel`. No index, so no version block — read the `db.version(19)` comment. |
| `web/src/storage/journal.ts` | `setCounsel`, `clearCounsel`, and `setRaw` marking an existing reading stale. |
| `web/src/storage/index.ts` | Exports the new type. |
| `web/src/pages/Entry.tsx` | The drawer under the entry. |
| `web/src/pages/Entry.module.css` | Its styles. |

Tests beside each: `counsel.test.ts`, `journal.test.ts`, `Entry.test.tsx`,
`shape.test.ts` (unchanged behaviour through the new relay).

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
