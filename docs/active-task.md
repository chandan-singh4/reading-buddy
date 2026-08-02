> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-03 · Local storage layer

The single door to all persistence: a Dexie/IndexedDB seam that stores the
WP-05 structure. Nothing outside `web/src/storage/` may touch the database.

**Order note (2026-08-01):** run after WP-05, not before — reordered by Chandan
so storage is built to fit a settled schema.

### Definition of done
- [ ] `web/src/storage/db.ts` declares a versioned Dexie database with tables
      for books, manifests, chapter indexes and sections — **one row per
      section**, keyed by `[bookId+path]` so `ch02/s03` is a direct lookup.
- [ ] `web/src/storage/repository.ts` is the only public API: put/get for each
      shape, `listBooks`, bulk `putSections`, and a `deleteBook` that cascades
      in a transaction so no orphan sections survive.
- [ ] Tests against a real IndexedDB implementation (`fake-indexeddb`) cover
      round-trip, section-level retrieval, bulk insert and cascade delete.
- [ ] `npm test`, `npm run typecheck`, `npm run build` all pass.

### Files in scope
- `web/src/storage/db.ts` (new)
- `web/src/storage/repository.ts` (new)
- `web/src/storage/index.ts` (new — the single public entry point)
- `web/src/storage/repository.test.ts` (new)
- `web/package.json` (add `dexie`, `fake-indexeddb`)
- `docs/architecture.md` (record the storage layout)
- *(create as needed — add any new path to this list)*

### Out of scope
- Highlights, notes and reading-position tables — WP-25 and WP-15 add these via
  a Dexie version bump; that mechanism is what this task exists to provide.
- Any parser, retrieval assembler or UI. Nothing renders yet.
- Google Drive backup (WP-33).

### Deferred, don't lose
- `docs/backlog.md` and `docs/progress.md` are stale: WP-01 and WP-05 are done
  but still show `[ ]`, and the 05-before-03 reorder isn't recorded. Chandan
  asked to sync these once WP-03 lands.
