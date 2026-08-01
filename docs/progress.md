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
- WP-01 · Scaffold the stack — not started.

### Recently done
- Repo reorganized into the lightweight context system: `CLAUDE.md` +
  `.claude/skills/` (`/startup`, `/wrap-session`, `/plan-task`) + `docs/*`;
  `books/` and `research-paper/` split out for source material.
- Old `STARTUP.md` / `PROGRESS_LOG.md` deleted — fully superseded by
  `docs/active-task.md` + `docs/progress.md`.
- `wayfinder_build_board.html` (visual Kanban mirror of the 34 waypoints) added
  to the repo root; kept static, synced by `/wrap-session` (see decisions.md).

### Blockers
- None.

### Next up
- WP-03 storage seam → WP-04 app shell → then WP-05, the structure schema
  (the keystone everything downstream reads from).
