> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — the rest of WP-14: how it looks

Page turning, links (WP-42), bulk delete (WP-44), the second and third phone
rounds (WP-45; bare reading screen, no pager, permanent status line) and book
pictures (WP-39's first half) all shipped 2026-08-02. Two phone-reported bugs
(redundant `[Figure]` caption text; the reading screen bobbing mid-swipe) were
fixed and merged to `main` 2026-08-03, alongside the app's first production
deploy (Vercel, auto-deploying from `main` — see `progress.md`). Gates:
**473 tests**, typecheck, build. App-shell precache ~425.3 KiB.

What is left of WP-14 is the *look*, which the reader has confirmed twice is the
next thing they want:

- **Font size, line spacing, margins.** These are the reason word-counted pages
  exist — the page number survives them, because it counts words not screens.
- **Themes: light / dark / sepia.** Dark already follows the OS; sepia is new.
  All of it flows from `styles/theme.css` tokens — no component hard-codes a
  colour, so this is a `data-theme` attribute and a token block.
- **The page-turn animation.** The seam is built (`turnPage`); only *instant* is
  wired. Ship slide next, honour `prefers-reduced-motion`, ~200 ms ceiling, and
  a fast tapper must be able to outrun it. Page curl stays a labelled slot.
- **In-book search and real bookmarks** — the two stub tabs in the nav sheet,
  which are a visible promise. Shelf search exists (WP-45); this is the other
  one.

### Definition of done
A reader can set type size, spacing and theme from the nav sheet; the choice
persists; page numbers do not shift when they change it; pages slide rather than
snap, and reduced-motion users still get instant.

### Files in scope
- `web/src/styles/theme.css` — every colour and size token lives here.
- `web/src/reader/Chrome.tsx` + `Chrome.module.css` — where the settings go.
- `web/src/pages/Reader.tsx` + `Reader.module.css` — the column strip and the
  turn.
- `web/src/reader/columns.ts` — the page arithmetic a re-flow must not break.
- `web/src/reader/focusMode.ts` — the existing pattern for a persisted setting;
  copy it rather than inventing a second one.
- `web/src/reader/blocks.module.css` — per-block spacing, and the figure cap
  (`max-height: 70dvh`) that a change to type size or margins interacts with.

### Out of scope
The tutor loop (WP-17→20), WP-43 folder re-scan, WP-39's second half (tap a
figure → ask Claude about it), pdf.js region rendering.

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
