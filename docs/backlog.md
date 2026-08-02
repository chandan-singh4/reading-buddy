> **What's in here (read when planning the next task or on `/plan-task`).** The
> full build backlog — all 34 waypoints across the six legs, each with a status
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
- [ ] **WP-04 App shell + routing** — Library/Reader/Settings + theme tokens · *after 01*

### Leg 1 — Cartography (parsing pipeline)
- [x] **WP-05 Shared structure schema** — path-as-address, manifest, anchor grammar · *KEYSTONE, **before 03** (reordered 2026-08-01)*
- [ ] **WP-06 Epub parser → structure** — inference + fixed-size fallback, permanent anchors · *after 05*
- [ ] **WP-07 PDF parser → structure** — reuse rule + running-header/footer filter · *after 06*
- [ ] **WP-08 Markdown parser → structure** — resolve present heading levels · *after 05*
- [ ] **WP-09 Manifest + crossrefs at import** — per-chapter summaries, crossrefs once · *after 06,07,08*
- [ ] **WP-10 Import classification** — fiction vs dense, subject tag, concepts/vocab/themes · *after 09*
- [ ] **WP-11 In-app import + auto-parse** — phone picker, parse-on-import, land in library · *after 06,07,08*

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
