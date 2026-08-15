> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Done, awaiting the phone — the page curl, rebuilt so it cannot stall

**The reader asked for this explicitly** (2026-08-15): put the finger-tracked
curl back, built so it cannot stall the phone. It is built, measured and shipped.
`DRAG_TURNS` is gone — the curl is simply on. What is left is the reader's own
eyes on a phone, which is the only place a gesture can be judged.

### What was wrong, measured rather than reasoned

`beginDrag` built the sheet from `STRIPS` (16) copies, and a copy was
`cloneNode(true)` of the **whole laid-out section** — the entire chapter as a
multi-column strip thousands of columns wide.

On a single-section book of 6,003 nodes / 2,542 pages: **one drag = 24,583 ms**
of blocked main thread and **102,300 DOM nodes**. On the phone that is the
"Aw, Snap!" renderer OOM the reader hit, and it is why taps did nothing — they
were queued behind a thread that never came back.

**The bitmap route was considered and rejected.** A split experiment settled it:
`cloneNode(true)` of the whole section costs **7 ms**; inserting it and laying it
out costs **1,529 ms**. Copying was never the expense, so replacing the copy with
a raster would have solved the cheap half. The expense is *how much* gets laid
out, and the fix is to lay out less.

### What was built

Three changes, in the order they were found:

1. **`pageCopy` cuts the copy down** to the pages around the one on screen —
   typically 7 children out of 6,001. A binary search over the children's left
   edges finds the window, a spacer holds the first one at its true height, and
   `shift` records how many content pixels were cut so the scroll position still
   lands on the right page. Editing a detached node is free; the browser lays out
   nothing until it is inserted. Whole-strip fallback whenever anything is
   unmeasurable, so jsdom and a zero-width strip both still work.
2. **`measureSheet` reads every rectangle once**, before the first sheet exists,
   and `place` is handed the answer instead of asking for it. Sixteen bands used
   to interleave sixteen reads with sixteen insertions, and each read forced a
   full relayout.
3. **The copy is moved with a transform, not a scroll.** This was the big one and
   it was not the one predicted: `scrollLeft` on sixteen copies cost **165 ms of
   the remaining 200 ms**. A scroll is a write the browser must lay out to
   honour, and it cannot batch sixteen. A transform is not a layout at all. The
   copy is `overflow: visible` now and the sheet around it clips.

### Measured after, on the same 2,542-page book

| | before | after |
|---|---|---|
| drag start, main thread | 24,583 ms | **56–76 ms** (incl. a forced full flush) |
| DOM nodes added | 102,300 | ~90 |

**360× faster**, and nothing leaks — the node count returns to 6,074 after five
consecutive drags. The <50 ms target is narrowly missed; what is left is the
binary search's own first rectangle read (~15 ms) and one real layout of the
sixteen small sheets. Both scale with the *page*, not the chapter, which was the
invariant that mattered.

### What still needs the reader

- The curl on a real phone: the shape, the shadow, the snap-back, the tempo.
- The 1,583-page atlas that crashed. It is the proof this is closed.

### The original acceptance criteria, unchanged

Anchored at the **left screen edge** — single-column portrait, so the sheet peels
off the whole screen right-to-left. No central spine.

**Done when:**
- Dragging left curls the page continuously. Stop the thumb and the sheet **holds
  its exact shape** — no easing, no drift, no animation running underneath.
- The free edge curls off the screen plane (Z) as it travels; the hinge at x=0
  never moves.
- The next page is visible under the peeling sheet from the first millimetre —
  not revealed at the end.
- The fold's shadow deepens as the fold steepens and is **exactly zero** at flat.
- Release past 50%, or fast in either direction, completes the turn. Under 50%
  and slow springs back to perfectly flat.
- Dragging right curls the *previous* page back on from the left, the same motion
  run backwards.
- Reduced motion keeps today's instant change. Tap-the-edge and the arrow keys
  still turn pages and still play the existing `playFlip`.
- Tests, typecheck, build green. **The gesture itself is provable on the phone
  and nowhere else** — a synthetic pointer is not a thumb.

### The math, so it isn't re-derived

The sheet is one snapshot sliced into **N = 16 vertical strips**. Strips, because
the browser has no mesh warp for live DOM: N flat quads with their own
`rotate3d` is the same deformation matrix evaluated per strip instead of per
vertex, and at 16 the seams are invisible.

Let `W` = sheet width, `p ∈ [0,1]` = progress, `w = W/N`, and `mᵢ` = the midpoint
of strip *i* in `[0,1]`.

**Bend angle along the sheet.** A page hinged at a spine tilts as a *whole* and
curls *extra* near its free edge, so the angle is a floor plus a rising term:

```
θmax(p) = π · p
θᵢ      = θmax · ( A + (1 − A) · mᵢ^k )      A = 0.55
k(p)    = 1 + 1.4 · (1 − p)
```

`A` is the rigid part — at `A = 1` the sheet is a flat board pivoting, at `A = 0`
it is a scroll unrolling. `k` is why the corner peels first and the fold evens
out: high early (bend concentrated at the free edge), 1 by the end (a clean
even fold).

**Position, by cumulative sum.** Each strip's left edge starts where the previous
strip's right edge landed, which is what makes the seams *exact* rather than
nearly-right:

```
x₀ = 0,  z₀ = 0
xᵢ₊₁ = xᵢ + w · cos θᵢ
zᵢ₊₁ = zᵢ + w · sin θᵢ
```

**Transform per strip**, absolutely positioned at `left = i·w`, origin `0% 50%`:

```
translate3d(xᵢ − i·w, 0, zᵢ) rotateY(−θᵢ)
```

Perspective goes on the *container*, once (`FLIP_PERSPECTIVE`, 1600px — keep the
existing value, a shallower one reads as a pop-up book).

**Shading, per strip, from that strip's own angle.** This is the existing
`shadeOver` idea generalised: a strip goes paper-blank exactly as *it* passes
edge-on, so the free edge blanks before the hinge does, which is what makes it
read as a fold rather than a spinning rectangle.

```
blank ᵢ = clamp((θᵢ − 70°) / 25°, 0, 1)        the back of the page: no text on it
darkᵢ   = S · (1 − cos θᵢ) / 2                 S ≈ 0.42
```

`darkᵢ` is zero when `θᵢ = 0` by construction — the shadow cannot survive a flat
page, which is the requirement, enforced by the formula rather than by a guard.

**Release.** Velocity is an exponential moving average of `dx/dt` across
pointermoves. Complete if `p > 0.5` or `|v| > 0.5 px/ms`; otherwise spring back.
Completion is an ease-out to 1; snap-back is a critically damped spring
(`ω = 18`, no overshoot — paper does not wobble).

### Files in scope

- `web/src/reader/pageTurn.ts` — where all of it lives. `pageCopy` (the cut),
  `measureSheet` (the rectangles), `place` (the transform), `fillSheet` and
  `beginDrag` (the callers). `clearSheets` and both `setTimeout` backstops stay
  exactly as they are.
- `web/src/reader/pageCurl.ts` — **read, do not edit.** Pure maths, fully tested,
  consumed unchanged.
- `web/src/pages/Reader.tsx` — the pointer handlers on the `<article>` and
  `settleOn`. `DRAG_TURNS` is deleted; a comment says why it existed.
- `web/src/reader/pageTurn.test.ts` — sheet contents, the sweep backstops, and
  the two new tests for the cut and the transform.
- `web/src/pages/Reader.module.css` — `touch-action: none`, and only if the bands
  need new painting rules.

**Also fixed in this thread and no longer open:** `withinHere` now reaches the
page number. `wordsAt` takes it as `pagesInto` and converts at `WORDS_PER_PAGE`,
which is exact rather than approximate because in this model that constant *is*
the definition of a page. The offset goes into the word total, not onto the
finished page number, so the page, the percentage and the chapter countdown all
move together instead of disagreeing.

Out of scope: the maths, the other nine themes, Stats, and mirrored show-through
text on the back of the sheet (the back stays blank paper — the reader has
already called the blank-back turn beautiful).

### Traps this task walks straight into

- **`position: fixed` dies inside the frame**, and the sheet is full of copied
  furniture. `copyOf` already places everything from measured rectangles for
  exactly this reason — do not "simplify" it back to inherited styles.
- **`:root:not([data-theme='light'])` outranks a bare `:root`.** The darkening is
  written on `[data-theme='paper']`, which is safe, but check the computed value
  on an OS-dark phone anyway. This has cost two rounds already.
- **Scaled rectangles come back scaled.** `drawnAt` is handed in for that reason;
  `W` must be the *unscaled* sheet width or every strip lands at the wrong pitch.
- **Every layer owes Back an answer** (`dismissTopLayer`). A drag in flight is not
  a layer — it is cancelled by `pointercancel`, not by Back — but say so in the
  code so the next reader doesn't wire it in.
- **A hidden preview pane runs no rAF.** The Browser pane cannot observe this at
  all. Verify the math in tests and the look on the phone.
- **A small test book proves nothing here.** The first attempt was tested on a
  section of 8 nodes / 2 pages and looked instant. Import a deliberately large
  single-section book — 6,000 paragraphs, ~2.5 M characters — and time
  `beginDrag` with `performance.now()` before believing any of it.
- **`getBoundingClientRect` lies about a paragraph that breaks across a column.**
  It gives the box around *all* the pieces, so `top` is the top of the continued
  piece and not the top of the paragraph. The cut copy used it, started the text
  a column too high, and showed the reader a page of words they had not reached.
  Use `getClientRects()[0]` for "where does this begin".
- **A copy must reproduce margin collapsing, or the columns break early.** The
  spacer holds the first kept paragraph at its measured top, and that measurement
  is to the border box. The paragraph's own `margin-top` then applies a second
  time. It is set to 0 in the copy.
- **Matching the height above a column break does not match the break.**
  `orphans` and `widows` count the lines on both sides of it, and a spacer is
  not lines. So a copy that starts with a spacer can break one line out and pull
  a line of the page before onto the page. Start the copy at a child that
  already starts a column, and there is nothing to make up. Keep the spacer only
  as the fallback, because the other fallback — copying the whole chapter — is
  the 24 s stall.
- **A flick can deliver one move, and the browser joins the rest into it.**
  Count the release point as a move, or a fast swipe never reaches the speed
  that completes the turn. Seed a speed average with its first reading too: an
  average that starts at zero reports about a third of a short flick.
- **Prove a copy by comparing geometry, not by looking.** Print every visible
  fragment as `text@left,top` for the real page and for the sheet and compare the
  strings. Six scroll positions × both directions caught what one screenshot did
  not. jsdom cannot do this — it has no layout, so it always takes the
  copy-everything fallback.
- **Setting `scrollLeft` is a layout, and sixteen of them is sixteen layouts.**
  This was 165 ms of a 200 ms turn and it was found by decomposition, not by
  reading the code — the theory going in blamed the rectangle reads, which turned
  out to be a tenth of it. **Insertion looks free and is not**: the browser defers
  the layout, so the cost lands on whatever reads or scrolls next. Time a forced
  `document.body.getBoundingClientRect()` or the number is fiction.
- **Do not measure a leak in the preview pane.** It delivers zero frames, so
  every sheet strands there and it cannot tell a real leak from its own artefact.
  This cost a round and nearly shipped a wrong root cause.

---

## Parked — WP-59 step 4: the Stats tab

Steps 1–3 are shipped: `finishedAt`, ISBN/publisher/subtitle out of the OPF, and
the Google Books lookup with its match guard, shelf backfill and per-book
Refresh. Stats is what is left, and it has real data to stand on — `pageCount`,
`subjects`, `averageRating` and `ratingsCount` are stored on the 32 books.

**Done when (Stats):**
- Pages read = **finished books × the print edition's page count**, summed — the
  reader's own simplification, and why there is no reading-events log.
- A part-read book counts in proportion: `percent × pageCount`.
- **All of a book's pages land on its finish date.** Yearly totals only; a
  monthly chart would be spiky and slightly fictional.
- Books Google could not match are reported — "3 books uncounted" — never
  quietly under-reported.
- Genres blend Google's coarse `subjects` with the app's own `genre`.

**Files (when it restarts):** `web/src/structure/types.ts`,
`web/src/pages/BookInfo.tsx` + `.module.css` (the visual language to match, and
the seven-theme `color-mix` pattern), `web/src/app/AppShell.tsx`,
`web/src/storage/index.ts`.

Known and accepted about the page maths:

- **Page counts are a convention, not a measurement.** These books have no pages
  — text flows into columns, so the count changes with type size, which is why
  bookmarks anchor to a paragraph. `percent × printedPageCount` is meaningful to
  a human even though nothing ever rendered "page 412". Say so before someone
  "fixes" it.
- **Google's categories are coarse** ("Body, Mind & Spirit"). The app's own
  `type` and `subject` are finer; the good answer probably blends them.

---

## Open only on someone else's input

Not waiting on the reader's taste — waiting on a file or a chore.

- **Redeploy on Vercel** so the *Production* `GOOGLE_BOOKS_KEY` takes effect,
  then press Refresh on one book before running the 32-book backfill. Env vars
  are per-environment: adding one to Preview does nothing for Production, and
  neither reaches a deploy that already went out. Probe reads: 401 = key
  present, 503 = key missing, 404 = endpoint not deployed.
- **Migration `0008`, agreed and deferred:** drop `subject`, `type`,
  `type_overridden`, `title_overridden`; remove `repository.renameBook` (no UI)
  and the `healTitles` override skip.
- ~~Apply `0003_finished_at.sql` and `0006_position_within.sql`.~~ **Both have
  been run** — confirmed by the reader on 2026-08-15, who checked the `positions`
  table and watched `within` change live. This file and `progress.md` both said
  they were outstanding, and that stale note sent one round of diagnosis at the
  wrong bug entirely. **A migration listed here is a claim, not a fact — ask.**
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
- **The reading page's furniture is signed off.** Paper themes, the running head,
  the gutter shadow and the two decks were shipped unseen on 2026-08-14 and have
  now been looked at on the phone. `--page-deck` (11px), `--page-gutter` (24px)
  and `--running-head` (1.5rem) stand as they are. Only the paper's *lightness*
  came back, and that is the task above.

---

## Carried forward — things that will bite

- **Run the suite as `npm test --workspace web`.** From the repo root it misses
  `web/`'s Vite config and reports phantom failures (`Failed to resolve import
  "virtual:pwa-register"`) that look exactly like a regression. Cost a round.
- **Never rewrite a source file with a PowerShell `-replace` pipeline.**
  `(Get-Content -Raw) … | Set-Content -Encoding utf8` mangled every non-ASCII
  character in `BookInfo.tsx` (`—` → `â€”`) *and* the pattern did not match. Use
  the Edit tool. `git checkout --` was the recovery.
- **`git commit -m` with a PowerShell here-string on one line** is parsed as
  pathspecs. Write the message to a scratch file and use `git commit -F`.
- **`git checkout main` fails inside a worktree** — `main` is checked out in the
  primary tree. Merge from there instead: `git -C C:\Users\chand\Python\
  reading-buddy merge <branch>` then push. A merge run *inside* the worktree
  merges the branch into itself and prints "Already up to date" — nothing ships,
  and it looks like success.
- **`subject` is not `subjects`.** `subject` is the app's own single domain tag
  (being dropped in `0008`); `subjects` is Google's BISAC heading list, and is
  what the book page displays.
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
  `PARSER_VERSION` is 19 and the shelf offers the update — but it needs the kept
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
- **`:root:not([data-theme='light'])` outranks a bare `:root`.** (0,2,0) against
  (0,1,0), so file order is irrelevant — a default written in `:root` loses to
  the dark override on every OS-dark phone, and most phones are. Write per-theme
  values per theme. This has now cost two rounds (the vignette, then the deck
  colours) and **both were invisible in the file** — the only thing that found
  them was reading `getComputedStyle` back out of a live browser while flipping
  `document.documentElement.dataset.theme` through all ten themes. Do that.
- **The reading page's column box must not change width.** Anything added at the
  side edges reserves a *constant* channel and varies only what is drawn inside
  it. A box that resized as you read would re-decide every page break in the
  section on every turn — the page under the thumb changes as it is tapped.
- **Furniture that flips carries `data-page-furniture`; furniture that holds
  still does not.** `pageTurn.ts` reads that attribute and nothing else. The
  status line, the running head and the gutter shadow flip. The decks do not.
- **A new `BlockKind` shifts every anchor after it.** Highlights are pinned to
  anchors, so finer types are *labelled* (`label: 'subheading'`, `'break'`) on a
  block that was already there. Bumping `PARSER_VERSION` is the cheap half; the
  anchors are the part that cannot be undone.
- **Never import a `@fontsource` package's own CSS.** It pulls every alphabet it
  ships into `dist/`, and the service worker then precaches all of it. Name the
  Latin `.woff2` by hand in `styles/fonts.css`, as the existing faces do.
