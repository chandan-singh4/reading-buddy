# Active task

**What's in here:** the one task in flight and the exact files to open for it.
Read this first every session. Add a path to "Files in scope" before you open
it.

## Task

**WP-68 — steer the Counsel, once.** One optional line beside "Read it again".
The reader types the angle they want for *this* request. Nothing is stored.

The reader asked for it on 2026-10-19, after WP-67 read a real dream entry:

> "Definitely was looking from a Carl Jung psychology perspective but that's
> the thing — I don't want each journal entry to be analyzed from the same
> perspective."

`docs/backlog.md` holds the full ticket under "WP-68". Read that first. It
rules out the two obvious builds: a fixed lens list frames every entry the
same way, and pure auto-choice gives the reader no say on the entry where they
do know what they want.

### Settled before building

1. **The angle stays automatic by default.** Most of the time the reader does
   not know what they are looking for. That is why they are writing.
2. **One text field, used once.** Not a persona picker. Not a setting.
3. **Nothing is stored.** A stored angle is the fixed lens list again, arrived
   at by accident.

### Ask the reader before you build

**Does the field start empty, or prefilled with the angle the model chose?**
Prefilling teaches the reader what kind of line works. An empty field does not
steer them. The ticket leaves this open on purpose.

### Done when

- The entry screen shows one optional line beside "Read it again".
- What the reader types reaches the model with that one request.
- Nothing about the angle is written to `entries`, to settings, or to the sync.
- The field is empty again on the next request.
- Tests beside the files, in the style of the ones already there.

### Files in scope

- `web/src/journal/counsel.ts` — the call this task steers. Its test is beside
  it.
- `web/src/pages/Entry.tsx` — "Read it again" lives here, and so will the line.
- `web/src/pages/Entry.module.css` — the field's dress.
- `web/src/pages/Entry.test.tsx` — where the new tests go.
- `api/tutor.ts` — the Counsel task module, to see how the prompt is built.
- `docs/backlog.md` — the WP-68 ticket, at the end of Leg 6.

## Open question, waiting on the reader — no code yet

**What the ☰ drawer should list.** It lists Home, Library, Stats and Settings.
The reader asked whether those belong to the journal half at all. My
counter-proposal, not answered: keep the ☰ where it is and let its list follow
the open half — reading gives Home, Library, Stats, Settings; the journal gives
Home, Archive, Settings; the even door gives all of them.

## Three chores for the reader — none needs code, none blocks WP-68

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
