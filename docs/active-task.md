> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-46→49 fast-follow (reader's first live reaction) is done

The garbled-title bug (a hash baked into some epubs' own `<dc:title>`
metadata, not just the filename) was fixed 2026-08-03, `PARSER_VERSION` → 5.

The reader then shared a reference design (warm, illustrated "wood shelf"
library view, cover-forward grid, plus a per-book detail screen with rating/
notes/quotes/mood) and asked for it broken into waypoints. All four shipped
and merged to `main` the same session, 2026-08-03:

- **WP-46** — Home shelves: bigger cover-forward tiles, the currently-reading
  book in its own raised card. Visual only, existing theme tokens.
- **WP-47** — new `/book/:bookId/info` route (`BookInfo.tsx`), reached from a
  "ⓘ" on each shelf tile (tapping the cover still opens the reader directly).
  Title/author/format/subject/status/dates + a 1–5 overall rating
  (`BookMeta.rating`, `repository.rateBook`).
- **WP-48** — favorite quotes on that page. Scoped down to a typed-in MVP (a
  new `quotes` table, schema v7) rather than waiting on true in-reader
  selection, which still needs WP-17/25 (unbuilt — see `backlog.md`).
- **WP-49** — `BookMeta.notes` on the same page. Originally also shipped
  `.moods` / `.secondaryRatings`, **removed same session** — see below.

The reader then saw it live and asked for a fast-follow, same session,
2026-08-03:

- **Title cleanup, round 2.** Some epubs (from a download/conversion
  pipeline such as Anna's Archive) don't just have a stray hash in
  `<dc:title>` — the whole thing is a citation dump: title run straight into
  author, publisher, ISBN, a hash and a trailing "Anna's Archive" credit, no
  punctuation between fields (`The Quantum and the Lotus A Journey to the
  Frontiers Where Ricard, Matthieu;Trinh, Xuan Thuan Place of publication not
  identified, 2009 9780307566126 6402e734… Anna's Archive`). `cleanTitle` in
  `parse/epub.ts` now recognises each field (ISBN digit run, the "Anna's
  Archive" / "place of publication not identified" phrases, and the known
  author's name in "Lastname, Firstname" form) and cuts the title at the
  earliest one found. `PARSER_VERSION` → 6.
  **Known gap, by design:** a subtitle mashed into the same string with none
  of those markers of its own (as in the example above — the cut lands after
  "…Frontiers Where", not at "…the Lotus") can't be told apart from the real
  title algorithmically; there's no delimiter left to find it by. That's what
  the manual rename below is for.
- **Manual title rename.** A pencil next to the title on the detail page
  (`TitleField` in `BookInfo.tsx`, `repository.renameBook`) — the escape
  hatch for whatever the automatic cleanup above can't get exactly right.
- **Mood and More ratings sections removed.** The reader found them
  unnecessary clutter after seeing the page live. Pulled the UI, the
  `repository.setMoods` / `.rateBookAxis` methods, and the `BookMeta.moods` /
  `.secondaryRatings` / `SecondaryRatingAxis` type entirely — same-day code
  nobody had used yet, so a full removal rather than leaving it dead.
- **Layout fixes on the detail page.** `.title`/`.author`/`.quoteText`/`.fact
  dd` now all get `overflow-wrap: anywhere` and `.page` gets
  `overflow-x: hidden`, so a long unbroken metadata string (a hash, an ISBN)
  can never again push the page wider than the screen and clip the Status /
  Added / Last read rows off the edge — which is what was actually happening
  in the reader's screenshot, not a narrow-column bug.
- **Page tightened**, not made fully static: removing Mood + More ratings
  shrank it a lot, and textareas lost a row each. True "never scrolls" isn't
  promised — Favorite quotes is an open-ended list by nature and will grow
  past one screen on a book with several saved.

Gates re-run: typecheck clean, full suite green (524/524 — the previously
noted `docx.test.ts` flake did not recur this run), build clean.

**Not yet done:** the reader hasn't seen *this* round live yet either.
Next session should open the same way — check their reaction, especially
whether the title heuristic and the manual rename together actually get them
to "just the title" on their other Anna's Archive-sourced books, before
picking anything new.

### Files in scope
None right now — no task is in flight. If the reader wants further
adjustments, start from `web/src/parse/epub.ts` (title cleanup),
`web/src/pages/BookInfo.tsx` (+ `.module.css`) and `web/src/pages/Home.tsx`
(+ `.module.css`).

### Out of scope
The rest of WP-14 (reader font size/spacing/theme, page-turn animation,
in-book search, bookmarks) is parked, not abandoned — still `[~]` in
`backlog.md`, and is the natural next task if the reader has nothing further
on the shelf/detail screens.

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
