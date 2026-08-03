> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-46: shelf visual redesign

The garbled-title bug (a hash baked into some epubs' own `<dc:title>`
metadata, not just the filename — a follow-on from the earlier title-priority
fix) was found and fixed 2026-08-03, `PARSER_VERSION` → 5. Deployed to `main`.

The reader shared a reference design (warm, illustrated "wood shelf" library
view, cover-forward grid, plus a per-book detail screen with rating/notes/
quotes/mood) and asked for it broken into waypoints rather than attempted in
one shot. Backlog now carries this as WP-24 (mostly shipped: status grouping,
progress %, real covers) → **WP-46 (this task, visual only)** → WP-47 (book
detail page) → WP-48 (favorite quotes, blocked on WP-17/25) → WP-49 (mood +
notes + secondary ratings). See `backlog.md` Leg 4 for the full breakdown and
dependency notes.

**WP-46 itself is visual only — no new data, no new screens.** Make the
existing Home shelves (`Shelves`/`BookTile` in `Home.tsx`) read closer to the
reference: covers as the dominant element, less competing chrome, a warmer
surface treatment. Stay inside the existing token system
(`styles/theme.css`) — WP-14's light/dark/sepia theming is separate,
unfinished work; don't fork a second colour mechanism to chase the reference
image's specific wood/cream palette without checking with the reader first,
since that's a bigger branding call than this waypoint's "make it look more
like a shelf" scope.

### Definition of done
Home's shelves read as cover-forward and less spartan than before, using only
existing theme tokens (or new tokens added the same way `--text-xs` was).
Reader has seen it and confirmed direction before WP-47 starts.

### Files in scope
- `web/src/pages/Home.tsx` + `Home.module.css` — the shelves and tiles.
- `web/src/app/Cover.tsx` + `Cover.module.css` — the cover component itself.
- `web/src/styles/theme.css` — tokens only; no hard-coded colour/space/size in
  a component.

### Out of scope
WP-47's detail page, WP-48's quotes, WP-49's mood/ratings/notes — all need the
reader's go-ahead on WP-46's direction first. The rest of WP-14 (reader font
size/spacing/theme, page-turn animation, in-book search, bookmarks) is parked,
not abandoned — still `[~]` in `backlog.md`, resume after this arc.

---

## Carried forward — things that will bite

- **Pictures only exist for books imported or updated under `PARSER_VERSION` 3.**
  The shelf offers the update; it needs the kept source file. Watch what this
  does to storage on a real phone — a picture-heavy library roughly doubles.
- **Books imported before a parser change keep the old parse, silently.** This
  has now cost two rounds: links didn't appear on already-imported books, and
  there was no way to tell. Worth stamping each book with the parser version
  that made it and having the shelf say "re-import for links". Do this *before*
  the next parser change.
- **Columns break awkwardly around tall figures, wide tables and long code.**
  The Jung epub has 141 figures. `backlog.md` accepted this and named the
  remedy: plain scrolling as a per-section fallback. Not built — wait until it
  is actually hit.
- **`Reader.test.tsx` is timing-sensitive under load.** Two different tests each
  failed once on a full run while a build was running, and passed on three clean
  full runs plus four isolated ones. Not diagnosed. If it recurs on an idle
  machine, it is real.
- **The live Anthropic key is still in `Claude API/API.txt`**, on the reader's
  machine. `.env.example` is ready at the repo root (2026-08-03); the key
  itself still needs a manual copy into a local `.env`, and into Vercel's
  Environment Variables once `api/` has code. More urgent than it was — the
  app now has a public URL, not just a home LAN.
- **The certificate names an address.** If the router gives this PC a new one,
  `npm run lan` prints both the address and the mkcert command to reissue it.
  Mostly moot now for phone testing — the app is live on Vercel and
  auto-deploys from `main`, so a push + reopening the installed app is the new
  path; LAN/mkcert only matters for testing an unpushed change.
- **Don't strip `touch-action: pan-x` (`Reader.module.css` `.page`) or
  `overscroll-behavior: none` (`index.css`, `html`/`body`) while reworking
  margins, spacing or the page-turn animation.** They're what stops the
  browser from reading a not-quite-horizontal swipe as a scroll attempt — pull
  them out and the reading screen bobs up and down again on a phone.
- **`deploy-vercel` branch (the `.env.example` prep) isn't merged to `main`
  yet.** No functional change, low-risk merge whenever convenient.
- **A garbled-diacritics report is open**, waiting on the reader to share the
  actual epub or its title-page markup — traced to the source file's own SVG
  `<title>`, not our parser, but unconfirmed. Don't attempt a fix blind.

## Decisions already made — don't re-derive these
- **A reading place is an anchor, never a page number** (WP-15).
- **Pages are counted in words, not screens** (WP-40, `structure/words.ts`).
  300 words to a page; changing that constant renumbers every book.
- **The spine is not a whole-book read.** Manifest plus chapter *indexes* only.
- **Pagination is CSS columns**, not JavaScript measurement, and **the page turn
  is a seam** — navigation and animation stay separate. Both in `backlog.md`
  under WP-14.
- **Focus Mode hides, never removes.** Anything added to the reading screen has
  to keep working with the overlay hidden.
- **A link is a range of a paragraph** (`start`, `end`, `anchor` or `url`),
  resolved *after* assembly, with epub ids qualified by their source file.
- **Position is remembered by identity, not by offset** — the shelf remembers
  which book you opened (`useRowMemory`), not how far down you had scrolled.

## Useful context (already known — don't re-derive)
- Gates: `npm test` (473), `npm run typecheck`, `npm run build`, from the repo
  root. App-shell precache ~425.3 KiB.
- Retrieval path, and the whole of it: `getManifest(bookId)` →
  `getChapterIndex(bookId, n)` → `getSection(bookId, path)`. There is
  deliberately no "load the book" call — don't add one.
- `web/src/reader/`: `blocks.tsx` (one component per `BlockKind`, plus link
  runs), `linkRuns.ts` (`runsOf`, `lineRunsOf`), `navigation.ts`, `progress.ts`,
  `bar.ts`, `columns.ts`, `position.ts`, `swipe.ts`, `useBackDismiss.ts`,
  `Chrome.tsx`, `focusMode.ts`. All via `reader/index.ts`.
- **`Reader.tsx` has one `goTo` and one `turnPage`** — every move goes through
  them. That is the seam the page transition plugs into; keep it that way.
- Anchors reach the DOM as ids with the brackets stripped (`ch02-s03-p013`).
- Vitest defaults to `node`; add `// @vitest-environment jsdom` per file for
  React tests. Testing Library needs an explicit `afterEach(cleanup)` — `globals`
  is off, so nothing auto-cleans.
- jsdom has no layout: stub `window.scrollTo` **and**
  `Element.prototype.scrollIntoView` in any test that mounts Reader.
- Real books for manual checks: the 15 MB Jung epub in `books/`, the Springer
  PDF in `research-paper/`. Both untracked.
