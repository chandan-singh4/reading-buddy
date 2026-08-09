> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — finish turning the cloud on, live

**Pick up exactly here: the reader clicks *Send me a link* on
`https://reading-buddy-web-nu.vercel.app` and signs in.** Everything before that
is done. This is a hand-holding task, not a building one — the reader is
following `docs/cloud-setup.md` on their own Windows machine and reporting
screenshots. Read that file before anything else.

### Where the setup actually stands

| Step | State |
|---|---|
| Supabase project, tables, RLS (`0001`, `0002`) | ✅ run |
| Cloudflare R2 bucket + API token | ✅ |
| `.env` at the repo root, locally | ✅ |
| Vercel Environment Variables (bulk `.env` import) | ✅ |
| R2 CORS policy | ✅ done 2026-08-09, `GET`/`PUT`/`DELETE` |
| **Sign in once** | ⏳ **429 — email allowance used up. Wait an hour.** |
| Supabase 1.4 — *Allow new users to sign up* → **off** | ⬜ only after signing in |
| Import one small book, check both dashboards | ⬜ the real test |

### Definition of done

1. Signed in on the Vercel deployment, and the session survives a reload.
2. Sign-ups turned off (§ 1.4) — **do this only after step 1**, or the project
   locks the one account out of itself. The app now says so when it happens.
3. One small book imported on the cloud backend, and both halves verified by
   eye: a `books` row in Supabase with the right `user_id` and `ready` true,
   and `users/<id>/books/<book-id>/source/…` objects in R2.
4. Switch back to the device library and confirm all **32 books** are still
   there. This is the reassurance the whole design was built around; don't skip
   it because it seems obvious.

### The thing to expect

**The SQL and the round trip have never run against a real database.** The pure
halves are covered by tests and the compiler checked all 48 methods against the
`Repository` type — but a column name, an RPC argument name, or a policy that
refuses a legitimate write are exactly what neither of those can catch. **Expect
the first live import to find something.** That is the point of doing it with
one small book rather than thirty-two.

### How this session found its bugs, and the rule that came out of it

Three faults, and **all three reported the wrong thing to the reader**:

- Sign-in failures all said *"check the address and try again."* The address was
  never once the problem. The real cause (`PGRST125` on one occasion, `429` on
  another) was only ever visible in DevTools.
- A blank page with a `404` for a hashed bundle — no error on screen, because
  the code that renders errors is the code that failed to load.
- Vercel's own `404: NOT_FOUND`, which says nothing about SPA routing.

**Rule: when a setup step fails, get the console before theorising.** Both
opaque messages were fixed rather than merely diagnosed — `signInFailureMessage`
and `normaliseSupabaseUrl` exist because the same paste error cost two evenings.
If a new class of setup failure turns up, fix the message in the same commit as
the diagnosis. A guide that needs DevTools is a guide that failed.

### Recovery moves worth having to hand

- **Blank page, `404` on `assets/index-<hash>.js`** — stale service worker
  serving an old `index.html`. DevTools → Application → **Service Workers →
  Unregister**, then **Cache storage → Delete**, then Ctrl+Shift+R. **Never
  *Clear site data*** — it wipes IndexedDB, where the 32 books are.
- **Stuck on the sign-in screen** — *Use the library on this device instead* at
  the bottom. That escape hatch is load-bearing; never remove it.
- **Forced back to the device library from the console** —
  `localStorage.setItem('rb.backend','local')`, then reload. Chrome blocks
  console pastes until you type `allow pasting`, so prefer clicking through the
  Application panel where there is a UI for it.

### Shipped this session — 2026-08-09

`4b1066c` and `1fd0c62`, both on `main`. 863 tests, typecheck, build.

- `vercel.json` — SPA rewrite, excluding `/api/` and `/assets/`.
- `signInFailureMessage` in `cloud/client.ts` — surfaces Supabase's real reason,
  names the three that happen. Six new tests.
- `cloud-setup.md` — `DELETE` added to the CORS policy, the guessed Vercel
  address replaced with a placeholder, two new troubleshooting rows.

### Files in scope

**Read `docs/cloud-setup.md` first and mostly only that** — this is a setup
task, not a code task. Open the rest only when a live failure points at it.

- `docs/cloud-setup.md` — the click-by-click walkthrough and its troubleshooting
  table. **Start here.**
- `web/src/storage/cloud/client.ts` — `normaliseSupabaseUrl`,
  `signInFailureMessage`, and the session helpers. Where any *new* opaque
  sign-in message gets fixed.
- `web/src/storage/cloud/cloudRepository.ts` — the 48 methods. **Open this when
  the first import fails**; its header says what changed from Dexie and why.
- `web/src/storage/cloud/rows.ts` + `keys.ts` — the pure, tested halves.
  `null` is not the same as absent, and Postgres timestamps sort differently as
  strings.
- `supabase/migrations/0001_schema.sql` — tables, indexes, RLS. Check here when
  a write is refused rather than wrong.
- `supabase/migrations/0002_functions.sql` — the RPCs. Check here when an
  argument name doesn't match.
- `api/r2/sign.ts` — the `users/<id>/` prefix check **is** the security model.
  Also where a 401 on upload comes from.
- `web/src/storage/cloud/blobs.ts` — the browser half of R2. CORS errors and
  upload failures surface here.
- `vercel.json` — the SPA rewrite, if any path 404s from the server again.

### Out of scope

Copying the 32 device books into the cloud (the obvious next build — read from
`deviceRepository`, write through `repository`, book by book, resumable — but
**wait until one live import has actually worked**). Offline for the cloud
backend. The tutor loop (WP-17→20), WP-43, WP-25.

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
