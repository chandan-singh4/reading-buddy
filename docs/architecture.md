> **What's in here (read when touching folder layout, the parsed-book structure,
> or the anchor grammar).** The map of where things live: the monorepo layout
> (`web/`, `shell/`, `api/`) and the on-disk shape a book takes after parsing —
> the folder tree, per-chapter/section files, `manifest.md`, `learner.md`,
> `crossrefs.md`, and the anchor grammar. Since nothing is built yet, this
> describes the *target* structure; update it as reality lands. Read this before
> writing any parser, the renderer, or the retrieval assembler, since they all
> depend on this shape. Skip it for unrelated work.

---

### Repo layout (target)

```
/
├─ web/             # reusable UI — the actual product (React + Vite + TS, PWA)
├─ shell/           # Tauri desktop harness — disposable, retired at WP-34
├─ api/             # tiny endpoint holding the Claude key
├─ docs/            # the session-state context files (this folder)
└─ .claude/skills/  # /startup, /wrap-session, /plan-task
```

### Parsed book on disk (target) — produced once at import

```
/book/
├─ manifest.md          # title + one-line summary per chapter (locate w/o reading)
├─ crossrefs.md         # cross-chapter links, built once at import
├─ learner.md           # adaptive learner model (per book)
├─ ch01/
│  ├─ index.md          # chapter index
│  ├─ s01.md  s02.md …  # per-section files
└─ ch02/ …
```

- **Anchor grammar:** `[ch02-s03-p013]` = chapter 02, section 03, paragraph 013.
  Permanent once assigned.
- **The path is the address:** a query loads `manifest.md` + the chapter's
  `index.md` + one `sNN.md`, never the whole tree.

> **The tree above is a mental model, not a filesystem.** A browser PWA has no
> disk to write folders to, so the paths are realised as **storage keys** — a
> section lives in one IndexedDB row keyed `ch02/s03`, one row per section. The
> address rule is unchanged and load-bearing; only the lookup mechanism differs.
> Don't go looking for these files on disk. — WP-05, 2026-08-01

Implemented in `web/src/structure/` (WP-05): `types.ts` holds the shape,
`anchor.ts` the grammar and address helpers, `index.ts` is the only entry point
other code should import from. Anchor rules are strict — malformed input throws
rather than being repaired, since a plausible-but-wrong permanent id would
silently mis-address saved highlights forever.

### Storage (WP-03)

`web/src/storage/` is the only code allowed to touch IndexedDB. Dexie database
`reading-buddy`, schema version 1:

| Table | Primary key | Holds |
|---|---|---|
| `books` | `id` | `BookMeta` — indexed on title, type, importedAt |
| `manifests` | `bookId` | one `Manifest` per book |
| `chapters` | `[bookId+chapter]` | one `ChapterIndex` per chapter |
| `sections` | `[bookId+path]` | **one row per section** — the retrieval atom |

- **Import `./storage`, never `./storage/db.ts`.** `repository.ts` is the door;
  the database behind it stays swappable.
- **There is deliberately no `loadBook()`.** Retrieval is `getManifest` +
  `getChapterIndex` + one `getSection`. Adding a whole-book read would quietly
  undo the token strategy.
- **Schema changes go in a new `.version(n)` block** — never edit a shipped one,
  or existing installs lose data. Highlights/notes (WP-25) and reading position
  (WP-15) land as version 2.
- Import and delete both run in transactions: no half-parsed books, no orphaned
  sections eating the phone's storage quota.
- **Book metadata set at import:** type (`light-fiction` | `dense/technical`),
  subject/domain tag, and per-chapter concepts / vocabulary / themes.

### Other top-level items (not part of the target build)
- `books/`, `research-paper/` — source files used to test parsing; not shipped.
- `prototypes/` — throwaway prototype code, not the real implementation.
- `wayfinder_build_board.html` — static visual mirror of `docs/backlog.md`.
- `Claude API/` — holds API credentials; never read into context.
- `wayfinder/reading-buddy/` (external, one level up) — the original planning
  archive; ask before opening (see `CLAUDE.md`).
