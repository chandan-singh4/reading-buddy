> **What's in here (read when planning the next task or on `/plan-task`).** The
> full build backlog — all 39 waypoints across the six legs, each with a status
> box, a one-line description, and its dependencies ("after N"). This is the
> master list `/plan-task` picks from; respect the dependency notes so nothing
> gets built before its foundation. Don't read this during a normal build session
> — `active-task.md` already holds the scoped work. Statuses are flipped by
> `/wrap-session` as waypoints move. Mirrors the interactive Wayfinder build
> board. `[ ]` = to do · `[~]` = in progress · `[x]` = done.

---

### Leg 0 — Basecamp (scaffold & stack)
- [x] **WP-01 Scaffold the stack** — Vite + React + TS, PWA plugin, monorepo web/shell/api · *start here*
- [ ] **WP-02 Wrap the Tauri dev shell** — disposable desktop harness · *after 01*
- [x] **WP-03 Local storage layer** — IndexedDB/Dexie seam for all persistence · *after 01, **05*** 
- [x] **WP-04 App shell + routing** — Library/Reader/Settings + theme tokens · *after 01*

### Leg 1 — Cartography (parsing pipeline)
- [x] **WP-05 Shared structure schema** — path-as-address, manifest, anchor grammar · *KEYSTONE, **before 03** (reordered 2026-08-01)*
- [x] **WP-06 Epub parser → structure** — unzip + OPF spine, chapters via WP-35 · *after 05,35*
- [x] **WP-07 PDF parser → structure** — pdf.js, lazy-loaded; reuse rule + running-header/footer filter · *after 06*
- [x] **WP-08 Markdown parser → structure** — resolve present heading levels · *after 05*
- [ ] **WP-09 Manifest + crossrefs at import** — per-chapter summaries, crossrefs once · *after 06,07,08*
- [ ] **WP-10 Import classification** — fiction vs dense, subject tag, concepts/vocab/themes · *after 09*
- [x] **WP-38 Non-prose blocks (KEYSTONE-ADJACENT)** — add `kind` to `Paragraph`; keep tables, figures, formulas, code, quotes, footnotes as *one* block each instead of shattering them · ***before 11** — anchors are permanent, and this changes paragraph numbering*
- [ ] **WP-11 In-app import + auto-parse** — phone picker, parse-on-import, land in library · *after 06,07,08,**38***
- [x] **WP-35 HTML → structure (shared step)** — one heading/paragraph walker reused by epub + docx · *after 08 (inherits its level-resolution rule)*
- [x] **WP-36 TXT parser → structure** — conservative CHAPTER/PART detection, else WP-08's fallback · *after 08*
- [x] **WP-37 DOCX parser → structure** — mammoth (lazy-loaded) maps Word heading styles → HTML, then WP-35 · *after 35*

> **Declined: `.azw3` / `.kfx` (Kindle).** `.kfx` is a proprietary DRM-encrypted
> container — reading it means circumventing DRM, which we won't build, and
> Amazon's 2025 scheme change breaks even the third-party tooling. `.azw3` is
> technically parseable but has no maintained browser library. Users convert to
> EPUB in Calibre; the import UI (WP-11) should say so in one line.

### Leg 2 — Reading Room (reader UI & comfort)
- [ ] **WP-12 Structured renderer** — anchored paragraphs, paginated · *after 05,11*
- [ ] **WP-13 Nav overlay (Books-style)** — tap-fade, progress slider, ToC · *after 12*
- [ ] **WP-14 Reader conveniences** — font/spacing, day/night, in-book search, bookmarks · *after 12*
- [ ] **WP-15 Reopen where left off** — persist/restore anchor position · *after 12,03*
- [ ] **WP-16 Read-aloud** — phone built-in TTS via Web Speech API · *after 12*

### Leg 3 — The Tutor (inline explain + Claude)
- [ ] **WP-17 Selection menu** — Highlight / Copy / Define (local) / Ask · *after 12*
- [ ] **WP-18 Retrieval assembler** — manifest + chapter index + one section + learner.md · *after 05,09*
- [ ] **WP-19 Claude API call shape** — Haiku→Sonnet tier, caching, streaming, retry · *after 18*
- [ ] **WP-20 Inline popup + streaming UI** — popup, follow-up box, auto-saved Q&A · *after 17,19*
- [ ] **WP-39 Ask about a picture** — tap a figure/table/formula → send that image + surrounding text to Claude. Source image from the epub/docx archive where it exists; pdf.js renders the region for PDFs. The escape hatch for everything WP-38 can only describe · *after 19,20,38*
- [ ] **WP-21 Tutor persona + teaching modes** — subject-driven, 12 modes, dense books only · *after 19,10*
- [ ] **WP-22 learner.md adaptive model** — understood/struggled/analogies/misconceptions · *after 20*
- [ ] **WP-23 Chapter recap** — zero-token summary + things learned + cheap quiz · *after 21,22*

### Leg 4 — The Archive (library & persistence)
- [ ] **WP-24 Multi-book library** — covers, progress, status grouping · *after 04,11*
- [ ] **WP-25 Highlights & notes list** — dedicated per-book view · *after 17,03*
- [ ] **WP-26 Vocabulary / glossary view** — surfaced from learner.md · *after 22*
- [ ] **WP-27 Cost / usage visibility** — per-book/session/model-tier screen · *after 19*
- [ ] **WP-28 Books-stay-separate guard** — no cross-book memory/lookups · *after 18,22*

### Leg 5 — Landfall (deploy, install, backup)
- [ ] **WP-29 Tiny key backend** — one endpoint holding the API key · *after 19*
- [ ] **WP-30 PWA manifest + service worker** — installable, offline caching · *after 04*
- [ ] **WP-31 mkcert HTTPS + phone trust** — local cert, one-time trust, LAN serve · *after 30*
- [ ] **WP-32 Install on iOS + Android** — add-to-home-screen, verify offline · *after 31*
- [ ] **WP-33 Google Drive backup/restore** — opt-in Settings toggle, off by default · *after 25*
- [ ] **WP-34 Retire the Tauri shell** — drop the disposable harness · *last, after 32*

---

## Reader's feature wishlist — captured 2026-08-02

> Raised by the reader after WP-11, to be discussed when the relevant leg comes
> up. Not scheduled. Most of it lands inside waypoints that already exist —
> the `→ WP-nn` notes say where, so this list stays a wishlist and the legs above
> stay the plan. Items marked **NEW** have no home yet and need a waypoint (or a
> decision to decline) before they can be built.

### Library — finding the next book
- Rename a book → **NEW** (small; pairs with reading real title/author out of EPUB and docx metadata, since titles are filename-derived today)
- Search the library → WP-24
- Filter by status (Unread / Reading / Finished) → WP-24 ("status grouping")
- Sort: recently read, recently added, title, author → WP-24
- Cover images → WP-24
- Continue Reading → WP-24, needs WP-15
- Reading progress (% and last location) → WP-24, needs WP-15
- Import folder / watch a directory → **NEW.** Folder *import* shipped in WP-11; *watching* a directory is a different thing and the browser can't do it unaided — needs the Tauri shell or the File System Access API. Decide before promising it.
- Favourites / pin important books → **NEW** (small, sits in WP-24)
- Archive instead of delete → **NEW** (small, sits in WP-24)
- Recently opened list → **NEW** (small, needs WP-15)
- Rate a book on finishing, then 5 recommendations: 2 by the same author, 3 on the topic by others → **NEW, and the largest item here.** Needs a book-metadata source we don't have — the shelf only knows what's been imported, so recommendations must come from Claude or an external catalogue. Worth its own waypoint and its own decision, including whether it violates "no book recommendations everywhere" below. The reader's framing is *at the end of a book only*, which is the version that survives that rule.

### Reading experience
- Adjustable font, line spacing, margins → WP-14
- Theme: light / dark / sepia → WP-14 (day/night exists; sepia is the addition)
- Full-screen reading → **Focus Mode**, below
- Keyboard shortcuts, plus mobile equivalents where they apply → WP-14
- Table of contents, chapter navigation → WP-13
- Estimated time remaining in chapter and in book → **NEW** (small once WP-12 knows section lengths)
- Reading streak → **NEW**, optional, and in tension with the "no streak pressure" rule below. If built, it must never nag.

### Navigation
- Back button (return to previous location) → WP-13
- Jump to page/location, jump to chapter → WP-13
- Reading history → **NEW** (needs WP-15)

### Bookmarks — kept separate from notes
- Bookmark a page, name a bookmark, list bookmarks → WP-14

### Highlights
- Four colours with fixed meanings: yellow = important, blue = question, green = insight, red = confusing → WP-17 (colour semantics are **NEW** on top of it)
- Tap a paragraph or drag across text → prompt offering highlight (by colour), define, pronounce, copy, search → WP-17. Pronounce leans on WP-16's TTS.
- Search opens a scrollable pop-up of results, each labelled with its chapter and page → **NEW**, overlaps WP-14's in-book search but the result-with-location pop-up is its own piece of work.

### AI notebook
- Collects highlights, notes, questions and AI conversations, organised by chapter automatically → WP-25 (highlights/notes) + WP-20 (saved Q&A). Auto-organisation by chapter falls out of anchors for free.

### Reading analytics — deliberately minimal
- Current book, progress, last read, reading time, books completed → **NEW** (needs WP-15)
- Reading challenge set by the reader, tracked by month and year → **NEW**
- Explicitly skipped: badges, XP, leaderboards, coins, daily rewards — they optimise for app engagement rather than reading.

### Quality of life
- Auto-save reading position → WP-15
- Undo an accidental highlight → WP-17
- Export notes, export highlights → WP-25
- Offline reading, with cloud sync that catches up when back online → WP-30 (offline) + WP-33 (sync). Note the ordering: the app is local-first and already works offline; the *sync* half is the new part.
- Open multiple books at once → **NEW**, and in tension with WP-28 (books stay separate). Separate *memory* and separate *tabs* aren't the same thing, but the guard needs checking first.
- Recently closed books → **NEW** (small)
- Persistent search within a book, find next/previous, remember last search → WP-14

### Explicitly declined
Social feeds · public comments · reading leaderboards · achievement badges ·
recommendations scattered everywhere · AI that interrupts on its own · daily
challenges · streak pressure · notifications while reading · infinite discovery
pages. All of these pull attention toward the app and away from the book.

### Focus Mode — **NEW**, and the reader's own idea
The default reading mode. Hides library, settings, AI panel, progress statistics
and chapter list, leaving text and Previous / Next. AI stays available but only
on an explicit selection or shortcut — it never appears on its own.

> Worth noting this is less a feature than the shape of the whole reader: if
> Focus Mode is the *default*, WP-12 and WP-13 should be built with it as the
> baseline and the chrome as the thing that appears on demand, rather than
> building full chrome and hiding it afterwards. That is a cheaper decision to
> make now than later. **The goal: less a content platform, more a quiet reading
> desk.**
