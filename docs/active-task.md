> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-05 · Shared structure schema  ·  KEYSTONE

Define the one shape every other waypoint reads and writes: the parsed-book
structure, the path-as-address rule, and the anchor grammar. Types and pure
helpers only — no parser, no database, no UI.

**Order note (2026-08-01):** the backlog lists WP-05 as *after 03*. Reordered by
Chandan to run **before** WP-03, so the storage layer is built to fit a settled
schema rather than the reverse. WP-03 becomes *after 05*.

### Definition of done
- [ ] `web/src/structure/types.ts` declares the full parsed-book shape —
      `BookMeta`, `Manifest`, `ChapterIndex`, `Section`, `Paragraph` — with
      book-type gating (`light-fiction` | `dense-technical`) present from the
      start.
- [ ] `web/src/structure/anchor.ts` provides pure `formatAnchor` /
      `parseAnchor` / `isAnchor` over the `[ch02-s03-p013]` grammar, plus
      `sectionPath()` returning the `ch02/s03` address used as the storage key.
      Malformed input fails loudly rather than returning a wrong anchor.
- [ ] Vitest installed, `npm test` wired at the root, and the anchor grammar
      covered by tests — round-trip, padding, and loud failure on malformed
      input. (Approved by Chandan 2026-08-01 as a rider on this task, since the
      anchor rules are permanent and every Leg 1 parser depends on them.)
- [ ] `npm run typecheck`, `npm run build` and `npm test` all pass, and
      `docs/architecture.md` is updated to record that the on-disk folder tree
      is realised as **keys**, not files, in the browser.

### Files in scope
- `web/src/structure/types.ts` (new)
- `web/src/structure/anchor.ts` (new)
- `web/src/structure/anchor.test.ts` (new)
- `web/src/structure/index.ts` (new — the single public entry point)
- `web/package.json`, `package.json`, `web/vite.config.ts` (wire up Vitest)
- `docs/architecture.md` (record path-as-key; it currently implies real files)
- *(create as needed — add any new path to this list)*

### Out of scope
- Any parser (WP-06/07/08), the storage layer (WP-03), and all UI.
- `crossrefs.md` / `learner.md` shapes — later waypoints; leave them undeclared.
- Syncing `docs/backlog.md` / `docs/progress.md` — deferred to after WP-03 at
  Chandan's request.
