> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Next task — WP-59 step 2: ISBN and publisher out of the file

**Goal.** The epub parser reads only `title` and `creator` out of the OPF and
walks straight past `dc:identifier` and `dc:publisher` — which most epubs carry.
Read them, store them on `BookMeta`, and the catalogue lookup in step 3 becomes
*exact* instead of a title search that confidently returns the wrong edition, an
audiobook, or a study guide.

**Done when:**
- `dc:identifier` is read, ISBN-13 preferred over ISBN-10, the `urn:isbn:` and
  `isbn:` prefixes and any hyphens stripped, and a non-ISBN identifier (a UUID,
  a publisher's internal id — very common) is **ignored rather than stored**.
- `dc:publisher` is stored when present, absent when not — no empty strings, the
  same "absent, not null" rule the rest of `BookMeta` follows.
- Both are optional fields on `BookMeta`, mapped in the cloud row helpers, with a
  migration adding the two columns.
- **No network, no key, no API in this step.** Existing books get them on the
  next re-parse; do *not* bump `PARSER_VERSION` for this alone unless the reader
  asks — it forces a re-parse of 33 books to gain two strings.
- Tests, typecheck, build green.

### Files in scope
- `web/src/parse/epub.ts` — the OPF read. **Start here**; the `title`/`creator`
  lookup is the pattern to follow.
- `web/src/structure/types.ts` — `BookMeta`; add beside `finishedAt`.
- `web/src/storage/cloud/rows.ts` + `rows.test.ts` — the row mapping and the
  `bareRow` fixture (every new optional column must be added there or the test
  file stops typechecking).
- `supabase/migrations/` — a new numbered file; `0003_finished_at.sql` is the
  shape to copy.
- Whatever epub test fixture already exists next to `epub.ts` — reuse it, don't
  add a book to the repo.

Out of scope: the Google Books call, any UI, and Stats.

---

## The arc this belongs to — Google Books metadata, then Stats

Agreed with the reader 2026-08-10. **`finishedAt` is built and shipped**; the
rest is planned, not started.

The reader's insight, which cut a whole feature out of the plan: **pages read
does not need a reading log.** Finished books × the print edition's page count,
summed. Ten books at 200 pages is 2,000 pages, and it works retroactively
because "finished" was already derivable. An earlier proposal here for an
append-only reading-events log was over-engineering and is dropped.

1. **`finishedAt` — done.** Written once, never moved. See the note in
   `structure/types.ts`. `backfillFinishedAt` at boot dates the books finished
   before the field existed, from the position's own `at`, and doubles as the
   recovery path for a book finished with no signal.
2. **ISBN + publisher from the file.** Free, offline, exact. The epub parser
   reads only `title` and `creator` out of the OPF today and walks past
   `dc:identifier` — most epubs carry an ISBN right there. This is what makes
   the lookup exact instead of a guess.
3. **Google Books lookup.** By ISBN, with title+author only as a fallback — a
   title search confidently returns the wrong edition, an audiobook, or a study
   guide. **The key goes through `api/`, never a `VITE_` variable.** Must
   degrade offline and cache its answer on the book.
4. **Stats.** Genres read, pages this year, the reader's rating against the
   average.

Known and accepted about the page maths:

- **Page counts are a convention, not a measurement.** These books have no
  pages — text flows into columns, so the count changes with type size, which
  is why bookmarks anchor to a paragraph. `percent × printedPageCount` is
  meaningful to a human even though nothing ever rendered "page 412". Say so
  before someone "fixes" it.
- **Part-read books count in proportion**, the reader's call: show
  "*n* pages read out of *m*" from the percent already stored, so a book put
  down at 60% is not worth nothing.
- **All the pages land on the finish date.** A book read December→February
  drops into February. Yearly totals are honest; a *monthly* chart would be
  spiky and slightly fictional.
- **Books Google can't match contribute zero.** Stats must say "3 books
  uncounted" rather than quietly under-reporting.
- **Google's categories are coarse** ("Body, Mind & Spirit"). The app's own
  `type` and `subject` are finer; the good answer probably blends them.

---

## Open only on someone else's input

Not waiting on the reader's taste — waiting on a file or a chore.

- **Apply `supabase/migrations/0003_finished_at.sql` in the Supabase SQL
  editor.** Until it runs, finishing a book on the cloud backend errors — caught,
  so nothing breaks — and no finish date is stored. The boot backfill fills them
  in afterwards from the 100% positions, so nothing is lost by the delay.
- **Apply `supabase/migrations/0006_position_within.sql` in the Supabase SQL
  editor.** Until it runs, the reopen offset works on the device but is dropped
  on sync — no worse than before it existed, since a missing column reads as
  "no offset".
- **Run Library → Update** to pull covers forward to `PARSER_VERSION` 9. If
  *Beyond Mindfulness in Plain English* still shows a placeholder afterwards,
  **ask for the epub before diagnosing** — all four cover rules are unit-tested.
- **Long contents entries cut off at the right edge** (2026-08-05, `bbeb6b8`).
  Measured fixed in headless Chrome; the reader's exact line was never
  reproduced. The book is Nestor, *Breath*, not in the repo. **Ask for the file
  rather than guessing again.**
- **A garbled-diacritics report is open**, waiting on the reader's actual file.
  A title-page was missing accented letters and a word-space; traced to the
  source epub's own SVG `<title>` markup, since nothing in `web/src/parse/`
  strips non-ASCII. Unconfirmed without the file.

---

## Settled — do not reopen without the reader asking

These were carried as questions for days and are answered. They are written down
so a future session recognises them as decisions rather than loose ends.

- **Home has all four shelves and they never disappear.** Finished is one of
  them. An empty shelf keeps its heading, its plank and one quiet line in the
  gap — a shelf that came and went with its contents moved everything below it
  whenever a book was finished. The empty line is one modest height on *every*
  shelf including the hero: holding a hero-sized hole open at the top of the
  screen would push the rest below the fold in order to say nothing at all.
- **A blank line between paragraphs, or a first-line indent?** The indent won.
  It is authentic book setting and denser than what came before, the reader was
  offered both, and it has been read on a phone since. One line in
  `blocks.module.css` if it is ever reversed.
- **Subtitle cutting stays**, knowing it is a guess that will occasionally take
  a real title too far. The manual rename on the detail page is the way back —
  that is the whole reason it exists.
- **The accent side-stripe is a wash now**, not a stripe. `--color-accent-wash`
  in `styles/theme.css`, mixed from `--color-accent` so all seven themes get it.
- **WP-55 is closed on taste as well as code** — the launch tempo, the 85% page
  scale and the gestures were all used and called good on 2026-08-10. **557 ms**
  is the measured splash; 85% clears both bars with budget to 90%. If that area
  is ever touched again the files are `web/index.html` (splash markup, inline
  CSS, pre-paint theme script — start there, its notes say why each piece can't
  live in the bundle), `app/splash.ts`, `styles/theme.css` +
  `styles/motionTokens.test.ts`, `pages/Reader.tsx` + `.module.css`, and
  `web/scripts/make-icons.mjs` (the mark is hand-inlined in `index.html` and
  `web/public/favicon.svg` too — **change one, change all three**).
- **The offline shelf is built and approved.** The copy holds only *opened*
  books, and that stays; the **listing** is remembered separately
  (`storage/cloud/shelf.ts`) so a lost signal shows all 33 with the unopenable
  ones greyed. Home filters rather than greys, on purpose.

---

## Carried forward — things that will bite

- **`Promise.all` fails as a group, so a fallback has to cover the whole
  bundle.** `loadLibrary` fires four reads together; three had an offline
  fallback and the fourth — a check about the *Update* button — did not, and its
  failure binned three good answers and blanked the Library screen. **"Is this a
  reading call?" is the wrong question.** Ask what it is *bundled with*.
- **`navigator.onLine === false` is trustworthy; `true` is not.** It is
  specified as a promise about failure. `false` means there is no connection at
  all, so skipping the network is safe; `true` only means there is an interface,
  which is why a captive portal reports it. Never use `true` to skip a fallback.
- **A dead network is not free to ask.** With Wi-Fi off, opening the app is
  dozens of requests each with its own DNS attempt and teardown. This file
  previously asserted the opposite; a phone disproved it.
- **The cache database can gain tables; the device library cannot, cheaply.**
  `reading-buddy-cache` is disposable, so a new `.version(n)` there costs
  nothing. The same table in `reading-buddy` runs a migration over the reader's
  32 real books. This is why the LRU bookkeeping is in `localStorage`.
- **Ship at the end of every thread.** Build, commit, merge to `main`, push —
  Vercel deploys from `main`. This is in `CLAUDE.md` at the reader's request and
  it **overrides `/wrap-session`'s older "do not commit or push unless I ask".**
- **This container's local `main` was an unrelated history** (a 2026-08-02 root,
  kept as `main-stale-local`). `origin/main` is authoritative. If `git merge`
  ever refuses unrelated histories again, **check `git log origin/main` before
  believing the local branch** — `git checkout -B main origin/main` is the fix,
  not a force push.
- **Only `/` is a real file on the server.** Every other path is the app's. The
  service worker's `navigateFallback` hides a missing server rewrite completely,
  so test deep links with the worker unregistered or not at all.
- **A `VITE_`-prefixed variable is baked into the bundle at build time.** Adding
  one in Vercel does nothing to the deploy already live — it needs a redeploy,
  with the build cache unticked. Locally it needs the dev server restarted.
- **Vite hands the bundle `''`, not `undefined`, for an empty env var.** So `??`
  does not fall back and `||` does. `.env.example` ships optional keys blank, so
  this is a live trap, not a hypothetical one (`blobs.ts`, `SIGN_URL`).
- **Never prefix an R2 credential or the Anthropic key with `VITE_`.** It would
  be compiled into every visitor's JavaScript. Same for Supabase's
  `service_role` key — if one ever appears in `web/`, it is an incident.
- **The scroller is the root element, not the document and not the body.**
  `overflow-x: hidden` on `html, body` *together* is not the same rule twice: it
  makes the body a second scroll container and silently detaches every
  `window.scrollY` / `window.scrollTo` / window scroll listener in the app.
- **When a fix changes nothing the reader can see, check that it ran before
  refining the theory.** Cost a round.
- **`position: fixed` does not work anywhere inside the app frame. Use
  `app/Portal.tsx`.** `.frame` carries a `filter` at all times (at no-op values,
  because `none → blur()` snaps instead of animating), and an element with a
  filter is a containing block for every fixed descendant. This has cost two
  rounds. **The same trap applies to the reading screen's scale transform.**
- **To make the page look smaller, scale it — never resize it.** A real resize
  re-flows the columns and the browser re-decides every page break, so the page
  under the reader's thumb changes as they tap. Scaled rectangles come back
  scaled while `scrollLeft` and the column gap do not — divide on the way in, and
  never derive the factor from `offsetWidth`.
- **Anything drawn over the page that changes the page is a layer, and every
  layer owes Back an answer.** Wire it into `dismissTopLayer` in `Reader.tsx` in
  the same commit.
- **`history.back()` is asynchronous; `pushState` is not.** Never tear down and
  rebuild a history entry in a React effect that a `popstate` can also be
  changing.
- **jsdom's history is shared across a test file.** Assert on **whether an entry
  of yours is on top**, not on whether the gesture fired.
- **Anything with `overflow` other than `visible` cannot be broken across a
  column.**
- **Headless Chrome renders this app correctly**, over plain HTTP
  (`npx vite preview` from `web/`, *not* through the npm workspace — the flags
  get eaten and `--port` is read as a directory), driven with Playwright against
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. A fresh context is a
  **fresh install** (empty library, no scroll memory), and **tab screens stay
  mounted while hidden**, so scope locators with `visible=true`. **Gestures are
  still a phone question.**
- **Books imported before a parser change keep the old parse, silently.**
  `PARSER_VERSION` is 9 and the shelf offers the update — but it needs the kept
  source file.
- **A title fix reaches everyone; a parser fix does not.** `TITLE_CLEAN_VERSION`
  recomputes from what is already stored, at boot, for free.
- **Anything that adds, removes or re-parses a book must clear all three
  caches** — `forgetCovers()`, `forgetShelfMemory()`, `forgetLibraryMemory()`,
  behind `Library.reload(changed)`.
- **A copy of the strip is a scrolling box.** Hang overlays on the non-scrolling
  wrapper `copyOf` returns.
- **A page is a column plus its gap.** Use `measure().pageWidth`.
- **A debounced effect only fires on what is in its deps.** The position write
  was keyed on the *paragraph*, so reading forty pages through one unbroken
  paragraph saved nothing at all — invisible in jsdom, which has no columns, and
  found only by driving a real browser. When state changes continuously but the
  key does not, the key is wrong.
- **A hidden preview pane runs no `requestAnimationFrame` and fires no scroll
  events on a programmatic `scrollLeft`.** `visibilityState` is `hidden`, so rAF
  callbacks never run and screenshots fail ("not compositing frames"). Shim rAF
  onto `setTimeout` and dispatch a synthetic `scroll` to test. **Animation
  timing genuinely cannot be observed there.**
- **No 3D transform on a shelf tile.**
