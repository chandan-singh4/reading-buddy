> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-58 step 5: the offline write queue

**Reading a cloud book with no signal works. Writing still needs one.** Position,
highlights and bookmarks go straight to the cloud and fail honestly when it is
unreachable. This task makes those three survive a tunnel.

**Every design question is already answered** — see the WP-58 block in
`decisions.md`, settled 2026-08-10. Do not re-open them:

| Question | Settled answer |
|---|---|
| Two devices both add a highlight | **Both survive.** Highlights and bookmarks are *additive* — that is not a conflict, it is the right answer arriving by itself. |
| Two devices disagree on position | **Most recent write wins**, on `at`, which is already an ISO timestamp. Not furthest — that would undo a deliberate re-read forever. |
| Delete offline | **Refused.** The one action with no honest automatic merge, and a reading app should not have a conflict UI. |

### Definition of done

1. A bookmark, a highlight and a page turn made with the Wi-Fi off are still
   there after the app is closed and reopened — **still offline.**
2. Turning the network back on drains the queue to the cloud without the reader
   doing anything, and a second device sees them.
3. A queued write that the cloud *rejects* (not a lost signal — a row RLS
   refuses, a book deleted elsewhere) is dropped from the queue and does not
   retry for ever. Distinguishing the two is `looksOffline` in
   `cloud/cached.ts`, which already exists and is tested.
4. Deleting a book with no signal still refuses, with a message that says why.
5. Gates: typecheck, full suite, `npm run build`.

### The shape that is already there

- `cached.ts` overrides ~19 **read** methods and spreads the rest through. The
  queue is the same trick on the **write** side — wrap, don't rewrite.
- `cache.ts` is a full `Repository` over a second Dexie database, so an offline
  write can be applied to the copy immediately (so the reader sees it) *and*
  recorded for later.
- **Where the queue itself lives is the one open call.** A Dexie table in the
  *cache* database is free — that schema is disposable, so unlike the device
  library it can gain a table with no migration cost. That is probably the
  answer; it was not settled because the queue was deferred.

### Files in scope

- `web/src/storage/cloud/cached.ts` — **start here.** The wrapper, `looksOffline`,
  `knownOffline`, `readThrough`, and the header explaining what is deliberately
  absent.
- `web/src/storage/cache.ts` — the second database, the LRU bookkeeping, `looksFull`.
- `web/src/storage/cloud/cached.test.ts` + `cache.test.ts` — the patterns to
  copy: two real Dexie databases and a `Proxy` that fakes a lost signal.
- `web/src/storage/repository.ts` — the `Repository` interface. The write methods
  to wrap (`savePosition`, `addQuote`, `addBookmark`, `removeBookmark`, …) are
  named here.
- `web/src/storage/cloud/cloudRepository.ts` — what those writes do today.
- `docs/decisions.md` — the WP-58 block. **Read the seven bullets before writing
  anything.**

### Out of scope

The tutor loop (WP-17→20), WP-43, WP-25. Any change to the eviction rule or the
twenty-book cap. A "keep this book offline" pin — deliberately not built, and
`decisions.md` says why.

### Two answers owed by the reader, both cheap and neither blocking

1. **Offline, the shelf shows only the books it can open.** The alternative is
   all 33 with the unavailable ones greyed out, Spotify-style. Working as
   designed either way; this is a taste question, not a bug.
2. **Two design-hook findings, never triaged.** The side-stripe in
   `pages/page.module.css` (L114, L134 — **pre-existing**) and the width
   animation in `pages/LibraryCopy.module.css` (L46 — added 2026-08-10). Keep,
   change, or silence the rule.

---

## Second thread — the reader's eye, still unspent

Untouched this session and still the real next task once the cloud is up. **The
whole WP-55 round remains unseen on a phone**, and the live question from
2026-08-09 was never answered:

- **Did taking the update bring the logo back?** The likely answer is an older
  cached build, not a broken splash — the splash was the last of eleven commits,
  and `registerType: 'prompt'` means an installed app never updates itself.
  **Don't debug `splash.ts` or `index.html` until a current build is confirmed**;
  the splash is measured present at ~557 ms and removed from the DOM after.
- **Then, only what a browser cannot answer.** Does 557 ms read as arriving or
  as a toll gate? Does 85% look like too much shrink (there is budget to 90%)?
  Gestures — swipe, the 500 ms / 10 px long press — **verified on the phone or
  not at all**. The new three-token tempo. The library's list and grid, still
  never reacted to.
- **Run Library → Update** to pull covers forward to `PARSER_VERSION` 9.

### Files in scope for that thread
- `web/index.html` — the splash markup, inline CSS, pre-paint theme script,
  watchdog. **Start here**; its notes say why each piece can't live in the
  bundle.
- `web/src/app/splash.ts` — `MIN_VISIBLE`, `FADE_MS`.
- `web/src/styles/theme.css` + `styles/motionTokens.test.ts` — the tempo.
- `web/src/pages/Reader.tsx` + `.module.css` — the scale-for-toolbar, and
  **`dismissTopLayer`**.
- `web/scripts/make-icons.mjs` — the mark. Also hand-inlined in `index.html` and
  `web/public/favicon.svg` — **change one, change all three.**

---

## Still unseen from earlier rounds

- **The library's *looks*.** Grid card proportions, the progress bar in list
  view, whether the floating "+" clears the last book. Every round since
  2026-08-06 has been the reader reporting something broken; not one has been
  them saying how it reads.
- **Did the covers come back?** The fix is in the *parser*, so it reaches a book
  already on the shelf only when **Library → Update** is run. If *Beyond
  Mindfulness in Plain English* still shows a placeholder afterwards, **ask for
  the epub before diagnosing** — all four cover rules are unit-tested.
- **Long contents entries cut off at the right edge** (2026-08-05, `bbeb6b8`).
  Measured fixed in headless Chrome; the reader's exact line was never
  reproduced. The book is Nestor, *Breath*, not in the repo. **Ask for the file
  rather than guessing again.**
- **Finished is deliberately not a shelf on Home.** The reader asked for three;
  their reference had four. Putting it back is a `<Shelf>` block in `Home.tsx`
  plus `shelves.finished` in the cover list. They were told — wait for their call.
- **The blank line between paragraphs is gone**, replaced by a first-line indent.
  One line in `blocks.module.css` to restore.
- **Subtitle cutting is a guess** and will occasionally take a real title too
  far. The manual rename on the detail page is the way back.
- **A garbled-diacritics report is open**, waiting on the reader's actual file.

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
- **No 3D transform on a shelf tile.**
