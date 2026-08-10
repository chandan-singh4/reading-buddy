> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## No task in flight — WP-58 is closed

**WP-58 finished on 2026-08-10.** Reading *and* writing a cloud book now survive
a tunnel. The write queue is `web/src/storage/cloud/outbox.ts`, its own tiny
database (`reading-buddy-outbox`), drained on the `online` event, at launch, and
after any write that gets through.

What the queue turned out to need beyond the settled decisions:

- **Its own database, not a table in the cache.** The cache is the one store in
  the app that is safe to delete at any moment; a queued bookmark is the one
  thing here that isn't. Different lifetimes, different databases.
- **A durable local→cloud id map, not a one-shot rewrite.** `addBookmark` and
  `addQuote` mint their id server-side, so a bookmark made offline keeps the
  *copy's* id for as long as that copy lives — a delete queued tomorrow still
  names it. Rewriting what happened to be queued at drain time was the first
  attempt and a test caught it.
- **Two small interface additions**, both to make a settled rule actually true:
  `savePosition(…, at?)` so a replayed page turn carries the moment it happened
  rather than the moment the signal returned, and `addQuote → Promise<StoredQuote>`
  so the id is knowable, exactly as `addBookmark` already was.
- **A delete of something still queued cancels the add**, so a ribbon tapped
  twice in one tunnel sends nothing at all.

**Pick the next task from `progress.md` → "Next up".** The reader's eye (the
whole WP-55 round, still unseen on a phone) is the oldest debt; WP-43 and the
tutor loop WP-17→20 are the next build work.

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
