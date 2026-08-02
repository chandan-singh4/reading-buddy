> **What's in here (read at every startup).** A living snapshot of where the
> build stands — recently finished work, what's in flight, current blockers, and
> the immediate next moves. It's the "you are here" pin: read it first every
> session so you know the state without inspecting git history or the codebase.
> Kept deliberately short — only the last handful of done items survive, older
> history is dropped. Updated at the end of every session by `/wrap-session`. If
> this file and the code ever disagree, trust the code and fix this file.

---

**Current leg:** Leg 0 — Basecamp
**Near-term arc:** the *walking skeleton* — import a `.md` → render → select →
Ask → streamed answer (WP 01 → 03 → 04 → 05 → 08 → 11 → 12 → 17 → 18 → 19 → 20).
Get that loop working before building any breadth.

### In flight
- Nothing. WP-03 just landed; next task not yet planned.

### Recently done
- **WP-03 · Local storage layer** — Dexie database (`reading-buddy`, v1) with
  `books` / `manifests` / `chapters` / `sections`, one row per section keyed
  `[bookId+path]`. `storage/repository.ts` is the only door; import and delete
  are transactional. 13 tests against `fake-indexeddb`.
- **WP-05 · Shared structure schema (KEYSTONE)** — `web/src/structure/`:
  parsed-book types with book-type gating, and a strict `[ch02-s03-p013]`
  anchor grammar that throws on malformed input. 26 tests. **Reordered to run
  before WP-03** so storage was built to a settled schema.
- **WP-01 · Scaffold the stack** — Vite 7 + React 19 + TS, PWA plugin wired but
  unconfigured, `shell/`/`api/` placeholders.
- Vitest added; `npm test` runs from the root. 39 tests total.
- Repo published: **github.com/chandan-singh4/reading-buddy** (public). Product
  renamed Reading Buddy — *Wayfinder* was the planning method, not the product.
- Repo reorganized into the lightweight context system: `CLAUDE.md` +
  `.claude/skills/` + `docs/*`.

### Blockers
- None.

### Next up
- **WP-04 · App shell + routing** (Library/Reader/Settings + theme tokens) —
  the last Leg 0 piece, and the first thing that puts pixels on screen.
- Then Leg 1 parsing: WP-08 (markdown, simplest) is the fastest route to the
  walking skeleton; WP-06/07 (epub/pdf) follow.

### Open items
- **The live Anthropic key still sits in `Claude API/API.txt`** inside a public
  repo's folder. It is gitignored and has never been committed (history was
  scanned), but it should move outside the project and be read from an env var
  when `api/` is built.
- `wayfinder_build_board.html` checkboxes not yet mirrored (WP-01/03/05 done).
