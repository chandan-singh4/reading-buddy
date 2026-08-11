> **What's in here (read at every startup).** A living snapshot of where the
> build stands — recently finished work, what's in flight, current blockers, and
> the immediate next moves. It's the "you are here" pin: read it first every
> session so you know the state without inspecting git history or the codebase.
> Kept deliberately short — only the last handful of done items survive, older
> history is dropped. Updated at the end of every session by `/wrap-session`. If
> this file and the code ever disagree, trust the code and fix this file.

---

**Current leg:** Leg 2 — Reading Room
**Near-term arc:** the *walking skeleton* — import a `.md` → render → select →
Ask → streamed answer (WP 01 → 03 → 04 → 05 → 08 → 11 → 12 → 17 → 18 → 19 → 20).
Get that loop working before building any breadth.

### In flight
- **Nothing.** The cloud arc is finished. Sign-in works, the 32 books were
  copied up, and a cloud book now both **reads and writes** with no signal.
  Everything is merged and pushed; build green, **976 tests**.
- **WP-58 is closed, and the write queue is now verified on the phone.**
  2026-08-10: the reader bookmarked a page with no signal, force-quit the app,
  reopened it still offline, and the bookmark was there. That was the one test
  that had ever found a fault in this waypoint, and it passed.
- **Nothing is waiting on the reader. The queue is empty as of 2026-08-10** —
  the first time it has been, and worth not quietly refilling.
  - **The greyed-out offline shelf was seen and approved on the phone**, along
    with the four shelves that now hold their place when empty.
  - **The design-hook findings are triaged.** The side-stripe was softened to a
    wash on the reader's call (`--color-accent-wash`); the `LibraryCopy` "width
    animation" was closed as a false positive — that rule animates a transform.
  - **WP-55 is signed off.** The launch tempo (557 ms), the 85% page scale and
    the gestures were all carried unseen for two days and have now been used and
    called good. The 85% has budget to 90% if it is ever raised again, and the
    "I don't see the logo" report closes with it — a stale cached build, as
    suspected, which is also why the update panel got its safety net.

### Recently done
- **The offline shelf lists every book, greying the ones it can't open** —
  2026-08-10, the reader's call after seeing 1 book of 33 with Wi-Fi off.
  Nothing was lost and it did not look that way, which was the whole problem.
  - **The listing is remembered separately from the books** (`cloud/shelf.ts`):
    titles and authors for all 33 are a few kilobytes, where the books are
    megabytes — which is exactly why the listing can be kept for everything when
    the books cannot. In memory *and* `localStorage`: the second is what
    survives a relaunch, the first is what works where `localStorage` doesn't
    (private mode, the test runner) and is why the tests can see it at all.
  - **"Can this be opened?" is answered by what happened, not by
    `navigator.onLine`** — the wrapper records whether the last shelf came from
    the cloud or the copy, because `onLine === true` is what a captive portal
    reports. `unavailableBooks()` in `storage/index.ts` is the one thing a
    screen may know about the copy, since it is the one thing a reader can see.
  - **Home filters instead of greying.** Its job is "pick up where you left
    off"; four dimmed tiles that all refuse to open is a worse front door than a
    shorter, true one. The full shelf is one tap away.
  - **A three-run-flaky test was fixed at the root**: `readAndCache` waited for
    the copied *sections*, but the copy writes pictures, the source file and the
    marks after them, so tests were cutting the signal mid-copy. `copyInFlight`
    now exposes the real "is it done?".
  - Gates: **976 tests**, typecheck and build green.
- **WP-58 step 5 · The offline write queue** — 2026-08-10. Bookmarks, saved
  passages and page turns now survive a tunnel: applied to the offline copy so
  the reader sees them immediately, recorded in `cloud/outbox.ts`, sent when
  there is a signal (the `online` event, launch, or any write that gets through).
  - **The queue is its own database, `reading-buddy-outbox`.** The obvious home
    was a table in the cache — and the cache is the one store in the app that is
    *safe to delete at any moment*, while a queued bookmark is the one thing here
    that exists nowhere else. Different lifetimes, different databases.
  - **The id map has to be durable, and a test is what proved it.** The cloud
    mints its own ids, so a bookmark made offline keeps the *copy's* id for as
    long as that copy lives — a delete queued a week later still names it.
    Rewriting whatever happened to be queued at drain time was the first attempt
    and it was wrong within one reconnect.
  - **`looksOffline` now decides whether a queued write is kept or dropped.** A
    refusal from a reachable cloud (RLS, a book deleted elsewhere) is dropped —
    a queue that retries the impossible never empties. A lost signal *stops* the
    drain rather than skipping ahead, because the order is part of the meaning.
  - **A page turn replaces the pending one.** Position is written every few
    seconds; an hour offline would otherwise be hundreds of rows saying
    increasingly stale versions of one fact.
  - **Two interface additions, each making a settled rule actually true.**
    `savePosition(…, at?)` carries the moment the page was turned, so a replayed
    tunnel can't outrank a newer write from a laptop; `addQuote` returns its row
    like `addBookmark` always did, so the id is knowable.
  - **Deleting a book still refuses** — now in words about books rather than
    about the network, and a successful delete drops that book's queued writes.
  - Gates: **967 tests** (24 new), typecheck, build.
- **WP-58 · Cloud books readable with no signal** — 2026-08-10, merged to `main`
  (`5476ac6`, `23e3787`, `39773be`). **Started with a decision, not an editor**:
  the waypoint said it owed a conflict rule before it owed any code.
  - **The conflict problem mostly dissolved when named properly.** Highlights
    and bookmarks are *additive* — two devices each adding one means you end up
    with both, which is the correct answer arriving by itself, not a conflict.
    That leaves exactly one single-valued field (position, settled by newest
    timestamp) and one action with no honest automatic merge (delete, which now
    needs a signal). Full reasoning in `decisions.md`.
  - **The cache is a second database, `reading-buddy-cache`** — same schema,
    different name, invisible on every shelf. Caching into the device library
    would have been fewer lines and quietly catastrophic: "32 books here" under
    the unselected option would stop meaning anything.
  - **This is what WP-57 was secretly for.** Filling the cache is
    `copyBook(cloud, cache, …)` — the copier written the day before, pointed at
    a different target, because it was written against `Repository` and never
    learns direction.
  - **Caching fires on `getSection`, not on `getManifest`.** The library screen
    touches every book, and a shelf that quietly downloaded thirty-two books
    because it was scrolled past is a bug the reader pays for in data.
  - **Two faults the phone found, both mine, both now rules.** (1) `loadLibrary`
    fires four reads in one `Promise.all`; three had a fallback and the fourth —
    a check about the *Update* button — did not, so its failure binned three
    good answers and the whole screen said *"Couldn't open your library."*
    **`Promise.all` fails as a group**, so "is this a reading call?" is the
    wrong question. (2) The code asserted that asking a dead network was free.
    With Wi-Fi off it is dozens of requests each with its own DNS attempt, and
    the reader watched the library crawl — `navigator.onLine === false` now
    short-circuits to the copy.
  - **A twenty-book ceiling, least recently read dropped first**, with the
    reading order in `localStorage` rather than a table (the schema is shared
    with the device library — a migration would run over 32 real books to
    support a copy that can be thrown away), plus a pressure valve for when the
    browser refuses a write for want of room.
  - Gates: **943 tests** (47 new), typecheck, build.
- **WP-57 · Copy a library between device and cloud** — 2026-08-10, merged to
  `main` (`7ff0415`, `af3a30c`). The "push my 32 books up" button and its
  reverse. `storage/transfer.ts` reads through one `Repository` and writes
  through the other, book by book so a dropped signal costs one book rather than
  the run, skipping what is already there. **Written against the interface with
  no notion of direction** — which is the only reason WP-58's cache fill cost
  nothing the next day. A real progress screen, because 32 books is minutes and
  a silent spinner over a multi-minute upload is indistinguishable from a hang.
- **The text moved out of Postgres into R2** — 2026-08-10 (`c31e54a`). Sections
  are one JSON object per chapter, keyed by book and parse token; the database
  keeps only the address. Costs one extra hop (~150 ms) on the first read of a
  chapter and keeps the database slim for years. This is also what made WP-58
  cheap: **every read of a book's bytes now goes through one fetch**, which is
  the single place a cache belongs.
- **The first live setup, and the three faults it found** — 2026-08-09, merged
  to `main` (`4b1066c`, `1fd0c62`). All three were found by walking the reader
  through `cloud-setup.md` step by step. **Every one of them was invisible until
  a real person hit it**, and every one was a message that named the wrong thing.
  - **Opening `/settings` directly gave Vercel's own `404: NOT_FOUND`.** Only
    `/` is a real file; every other path is drawn by the app, so the server has
    to hand back `index.html`. There was no `vercel.json` — Vercel's Vite preset
    does not add one. **It stayed hidden for weeks because the service worker's
    `navigateFallback` answers the same question**, so it only appears where
    there is no worker yet, or just after clearing one.
  - **`/api/` and `/assets/` are excluded from that rewrite, for opposite
    reasons.** `/api/` must reach the function; `/assets/` must be allowed to
    **fail**, or a missing hashed bundle comes back as HTML served where a
    script was expected.
  - **A stale service worker can outlive the files it names.** An old cached
    `index.html` asks for `assets/index-<old-hash>.js`, a later deploy has
    deleted it, and the page paints nothing at all — no error, because the code
    that would show one never loaded. Recovery (Unregister + delete Cache
    storage, **never** *Clear site data*, which wipes the books) is now a row in
    `cloud-setup.md`.
  - **Every sign-in failure said "check the address and try again."** The
    address was never once the problem. `signInFailureMessage` now always
    surfaces Supabase's own reason and names the three that really happen — the
    email allowance, sign-ups closed before the first sign-in, and a rejected
    address. The 429 above took a DevTools session to find; it now says so on
    the screen.
  - **The R2 CORS policy in the guide allowed only `GET` and `PUT`.** Deleting
    a book sends a `DELETE` straight to R2, and blob removal is best-effort by
    contract — so the book would vanish, no error would show, and the files
    would stay on the bill forever. The example origin was also a
    plausible-looking guess rather than a placeholder.
  - Gates: **863 tests** (12 new, all on the two pure helpers), typecheck,
    build.
- **The cloud backend can now be switched on · sign-in and the library toggle**
  — 2026-08-09. The reader has 32 books on the device, which is the constraint
  the whole design answers.
  - **Switching backends moves nothing.** It changes *which library you are
    looking at*, so the device's 32 books survive any amount of flipping back
    and forth. That is the only reason it is safe to offer the toggle before
    there is any way to copy books between the two — and Settings shows a count
    under the option you're *not* on, so an empty cloud shelf reads as
    reversible rather than as loss.
  - **The choice is read once at load and applied by reloading the page.**
    ~30 modules import `repository` as a plain value and several cache what it
    returned (covers, shelf memory, library memory, position). Swapping the
    object underneath all of that would need an invalidation path per cache; a
    reload costs ~300 ms and cannot be half-applied. `storage/backend.ts`.
  - **`storage/index.ts` is still the only switch** — `activeBackend() ===
    'cloud' ? createCloudRepository() : deviceRepository`. Every other call site
    is unchanged and unaware there is a choice, which is what the `Repository`
    type was for.
  - **A build with no Supabase keys falls back to the device library** even if
    `cloud` is remembered, so a fork or a preview deploy can't strand someone on
    a sign-in screen it can never satisfy. `resolveBackend` is pure and tested.
  - **The sign-in screen always offers the way back to the device library.**
    Without that button, turning the cloud on before the accounts exist locks
    the reader out of books that are sitting in the browser underneath the
    screen. Two of the five sign-in tests are about that button alone.
  - **Three session states, not a boolean.** Supabase reads its stored session
    asynchronously, so a boolean starts `false` and flashes the sign-in form at
    a signed-in reader on every launch. `loading` paints the page background
    instead — the splash is gone by then, so `null` would be a white flash.
  - Cost: the Supabase client is now a static import, so the main bundle moved
    **449.5 → 470.5 kB** (151.3 kB gzipped). Deliberate — a dynamic import would
    make `repository` async at all ~30 call sites.
  - Gates: **851 tests** (13 new), typecheck, build. **Still untested against a
    real database** — the SQL and the round trip have never run.
- **Older rounds — WP-53, WP-54, WP-55 and the first cloud write-up — dropped
  from here to keep this file short.** Each has a full entry in `docs/backlog.md`
  and its reasoning in `docs/decisions.md`; the traps they cost are in
  `active-task.md` under "Carried forward".

**Gates:** `npm test` (943), `npm run typecheck`, `npm run build` — all passing
as of 2026-08-10. Main bundle 482.9 kB, precache 34 entries / 1109.0 KiB. Every
parser stays behind a dynamic `import()`, so pdf.js (434 kB) and mammoth
(500 kB) remain in their own chunks and are fetched only when a file of that
type is imported.

### Blockers
- **None.** Supabase's email allowance (a few sign-in messages an hour on the
  free mailer) bit once on 2026-08-09 and cleared itself; connect real SMTP
  under Authentication → Emails if it ever gets in the way again.
- The `autoUpdate` → `prompt` crossing that stranded installed clients
  is closed: the reader confirmed on 2026-08-05 that the phone is on the current
  build and that the stale client was a desktop-app session, not a deploy or
  worker problem. Don't raise it again.

### Next up
**The cloud arc is finished.** Back to the reader's order, set 2026-08-02: make
it a proper reading app first, then AI.
- **The reader's eye is no longer the blocker — signed off 2026-08-10.** The
  launch tempo, the 85% page scale, the gestures, the library's list and grid
  were all carried open for days and are now called good. Left as facts rather
  than questions: 557 ms is the measured splash, 85% clears both bars with
  budget to 90%, and **gestures are still verifiable on a phone or not at all** —
  a synthetic click is not a finger, so that stays true of any future change to
  them. One chore survives, unrelated to taste: run **Library → Update** to pull
  covers forward to `PARSER_VERSION` 9.
- **Cheap follow-ons the redesign made cheap**, if the reader wants them:
  favourites (a boolean, one filter clause, one chip) and renaming/deleting a
  folder from the filter sheet — `repository.renameFolder` and `deleteFolder`
  both exist and have no UI yet.
- **Reading comfort is done.** WP-14 closed with WP-55's bookmarks and in-book
  search; font size, line spacing, margins, sepia and the page turn were already
  in. Notes/highlights are WP-25 and need the tutor loop's selection work first.
- **WP-43 · Re-scan a folder + name what's new.**
- **WP-17 → 18 → 19 → 20 · the tutor loop** — select text → assemble a prompt →
  call Claude → stream an answer. This is the rest of the walking skeleton and
  the first time the app does anything an ordinary reader can't.
- WP-09/10 (summaries, classification) need a model call and can follow.
  WP-02 (Tauri) stays skipped.

### Known parser limits (accepted, not bugs)
- **PDF is lossy by nature** — it stores positioned glyphs, not paragraphs.
  Publisher furniture that appears on only one or two pages (e.g. Springer's
  `Vol.:(0123456789)` sidebar) survives the repeat-based filter, which needs 3+
  pages to act. Not worth over-fitting to one publisher.
- **Scanned PDFs yield nothing.** No text layer, and OCR is out of scope — this
  surfaces as an empty book, so WP-11 should catch and explain it.
- **`.azw3` / `.kfx` declined** — DRM; see the note in `backlog.md`.

### Open items
- **The live Anthropic key still sits in `Claude API/API.txt`**, on the
  reader's own machine, gitignored and never committed. `.env.example` is
  ready at the repo root; the key itself still needs a manual copy into a
  local `.env` for dev, and into Vercel's Environment Variables for
  production. **More urgent now than "someday"** — the app has a real public
  URL as of 2026-08-03, not just a home LAN.
- **A garbled-diacritics report is open, waiting on the reader.** A book's
  title-page text was missing accented letters and a word-space; traced to
  the source epub's own SVG `<title>` markup (nothing in `web/src/parse/`
  strips non-ASCII), but unconfirmed without seeing the actual file or its
  title-page markup.
- **Pictures need a re-import to appear.** Fixed 2026-08-02 for new imports;
  books already on the shelf have no bytes stored, so the shelf's "Update"
  (kept source file, `PARSER_VERSION` 3) is what fills them in. Storage grows by
  roughly the images again — the Jung epub's 141 plates are most of its 15 MB.
