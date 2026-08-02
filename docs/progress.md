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
- Nothing. **Leg 0 is complete** (bar WP-02, deliberately skipped). WP-08 is
  planned and scoped in `active-task.md`, not started.

### Recently done
- **WP-04 · App shell + routing** — three routes (Library `/`, Settings, Reader
  `/book/:bookId`), bottom tab bar, Reader full-bleed outside the shell.
  `theme.css` holds all design tokens, dark follows the OS. Library reads real
  data via the WP-03 repository. 5 jsdom smoke tests.
- **WP-03 · Local storage layer** — Dexie `reading-buddy` v1: books /
  manifests / chapters / sections, one row per section keyed `[bookId+path]`.
  `storage/repository.ts` is the only door; import and delete transactional.
- **WP-05 · Shared structure schema (KEYSTONE)** — `web/src/structure/`:
  parsed-book types with book-type gating, strict `[ch02-s03-p013]` anchors.
  **Reordered before WP-03** so storage fit a settled schema.
- **WP-01 · Scaffold the stack** — Vite 7 + React 19 + TS, PWA plugin wired but
  unconfigured, `shell/`/`api/` placeholders.
- Repo published: **github.com/chandan-singh4/reading-buddy** (public). Product
  renamed Reading Buddy — *Wayfinder* was the planning method, not the product.

**Gates:** `npm test` (44), `npm run typecheck`, `npm run build` — all passing.

### Blockers
- None.

### Next up
- **WP-08 · Markdown parser → structure** — scoped in `active-task.md`. The
  shortest path to the walking skeleton: it's the only format that needs no
  binary decoding, so it proves the whole parse → store → render loop first.
- Then WP-11 (import) → WP-12 (renderer). WP-06/07 (epub/pdf) follow once the
  loop is real. WP-02 (Tauri) stays skipped until it's actually needed.

### Open items
- **The live Anthropic key still sits in `Claude API/API.txt`** inside a public
  repo's folder. Gitignored, never committed (history scanned clean), but it
  should move outside the project and be read from an env var when `api/` is
  built.
- Nothing has been checked on a real phone yet — WP-31/32 territory, but worth
  an early look once something renders.
