# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

**WP-63 — Tell the Scribe, from the book.** The passage becomes an entry.

The reader holds a passage. The selection menu offers "Tell the Scribe" beside
"Ask Veda". A sheet rises over the page, they speak, and the entry saves with
the passage tied to it. The sheet drops and reading carries on.

**The design is settled.** `decisions.md` → "The book's journal action is not
called 'speak'" (2026-10-18). Do not re-open it.

- The action is **"Tell the Scribe"**, not "speak" — `speak` already means Read
  aloud in the selection menu.
- It sits **beside "Ask Veda"**, set apart in the same way. One asks a
  question. The other makes a statement.
- A **sheet over the page**, not a screen. A book is where an entry is born.
  The journal is where it is read.

**Done when all four are true.**

1. The selection menu shows "Tell the Scribe" in the same block as "Ask Veda".
2. It opens the speak sheet over the page, with the held passage shown in it.
3. The saved row carries `link` — `bookId`, `anchor` and the `quote`, copied.
4. The entry screen shows the passage the entry grew from, and names the book.

**Out of this slice.**

- **Jumping back to the exact passage.** `Reader.tsx` reads no anchor off the
  URL, and giving it one is its own piece of work. The entry links to the book;
  it does not promise the line.
- The journal card's book mark (every card would need a book read).
- Tags (WP-64), the front door (WP-65), the backup (WP-66), readings (WP-67).

### Files in scope

| Path | What it does |
|---|---|
| `web/src/reader/SelectionMenu.tsx` | `SelectionAction` gains `scribe`; the button goes in the `.ask` block. |
| `web/src/reader/SelectionMenu.module.css` | `.ask` holds two rows now, not one. |
| `web/src/journal/SpeakSheet.tsx` | Takes an optional `link`, shows the passage, saves the tie. |
| `web/src/journal/SpeakSheet.module.css` | `.quote`. |
| `web/src/pages/Reader.tsx` | `case 'scribe'`, the `telling` state, and the sheet. Follows `composing`/`NoteComposer` exactly — the sheet must outlive the selection. |
| `web/src/pages/Entry.tsx` | Shows `entry.link` under the entry. |
| `web/src/pages/Entry.module.css` | Its styles. |
| `web/src/storage/journal.ts` | Read-only — `addEntry` already takes `link`. |
| `web/src/storage/db.ts` | Read-only — `EntryLink` already exists. |
| `web/src/storage/repository.ts` | Read-only — `getBook`, for the book's name. |

Tests beside each: `SelectionMenu.test.tsx`, `SpeakSheet.test.tsx`,
`Entry.test.tsx`.

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
