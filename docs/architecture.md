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
- **Book metadata set at import:** type (`light-fiction` | `dense/technical`),
  subject/domain tag, and per-chapter concepts / vocabulary / themes.

### Other top-level items (not part of the target build)
- `books/`, `research-paper/` — source files used to test parsing; not shipped.
- `prototypes/` — throwaway prototype code, not the real implementation.
- `wayfinder_build_board.html` — static visual mirror of `docs/backlog.md`.
- `Claude API/` — holds API credentials; never read into context.
- `wayfinder/reading-buddy/` (external, one level up) — the original planning
  archive; ask before opening (see `CLAUDE.md`).
