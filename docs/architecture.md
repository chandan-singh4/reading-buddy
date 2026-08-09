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
  Permanent once assigned. A "paragraph" is any block — a table or figure takes
  exactly one anchor, same as a prose paragraph (WP-38, 2026-08-02).
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

### Parsing (WP-06/07/08/35/36/37/38)

```
web/src/parse/
├─ assemble.ts    Block[] → ParsedBook. Level resolution, bucketing fallback,
│                 anchoring, furniture removal. The only place these rules live.
├─ html.ts        HTML → Block[] via the browser's DOMParser (no dependency)
├─ markdown.ts    markdown → Block[]
├─ txt.ts         plain text → Block[]
├─ epub.ts        ZIP + OPF spine → per-chapter HTML → Block[]   (fflate)
├─ docx.ts        Word styles → HTML → Block[]                   (mammoth, lazy)
├─ pdf.ts         pdf.js wrapper — glyph geometry only           (pdfjs, lazy)
├─ pdf-layout.ts  pure geometry: lines, columns, furniture, headings
└─ index.ts       the only entry point other code should import from
```

Every format does the same thing: **bytes → `Block[]` → `assembleBook`.** A block
is a heading or one of nine content kinds (`prose`, `quote`, `list`, `code`,
`figure`, `table`, `formula`, `note`, `furniture`) — see `structure/types.ts`.

- **A table, figure, list or formula is one block**, never one per cell/item/
  symbol. Each carries a readable `text` *plus* its structure (`rows`, `image`),
  so nothing downstream must understand a kind it hasn't met.
- **`furniture` is dropped in `assembleBook`, before anchors are assigned** — the
  ToC and running heads must never consume a permanent anchor.
- **Epub figure `src` values are archive paths**, resolved against the chapter
  that referenced them while that context still exists.
- **`startsPage` marks where the source book itself divided** — an epub spine
  document: the cover, the copyright page, the dedication, the preface. A
  boundary recorded by the parser, rendered as `break-before: column`. It is
  deliberately *not* a section split; sections are the navigation and the anchor
  grammar, and a chapter spread over three files would fragment the contents
  list.
- **`label` carries the finer distinction a `kind` deliberately doesn't** —
  `dedication` and `epigraph` (set apart the way print sets them apart), the
  note types, a figure's real caption. New display treatments belong here rather
  than in a tenth kind.
- **A consumed heading's ids are inherited by the block beneath it.** A heading
  that opens a chapter or section becomes that division's *title* and the block
  itself is discarded — so without this, every link pointing at a chapter
  heading resolved to nothing and was dropped.
- **PDF emits only `heading` and `prose`.** It has no structural markup — tables
  and figures there are geometry, not tags.

### UI (WP-04)

```
web/src/
├─ app/       AppShell (top bar, drawer, swipe nav) · Cover · Portal · hooks
├─ pages/     Home · Library · Reader · BookInfo · Stats · Settings
├─ library/   WP-53 — the library screen's parts and its rules
├─ reader/    the reading screen's parts (columns, page turn, settings)
├─ styles/    theme.css — all design tokens
├─ structure/ WP-05 schema
├─ parse/     WP-06/07/08/35–38 parsers
└─ storage/   WP-03 persistence
```

- **Routes:** `/` Home · `/library` · `/stats` · `/settings` · `/book/:bookId`
  Reader · `/book/:bookId/info` · `*` → Home.
- **Reader and BookInfo render outside `AppShell`** so reading is full-bleed;
  navigation appears on tap instead (WP-13).
- **Navigation is a drawer plus a horizontal swipe**, both moving through
  Home ↔ Library ↔ Stats ↔ Settings in that order. There is no bottom tab bar
  and **no page index held anywhere** — the URL is the state.
- **A screen is a shell; its rules are pure functions beside it.** `library/`
  is the pattern: the screen holds state and talks to storage, while what is
  shown, in what order, and how far through each book is are pure and tested
  (`filter.ts`, `status.ts`, `prefs.ts`). Anything that can be *wrong* rather
  than merely ugly belongs on that side of the line.
- **`position: fixed` does not work inside `AppShell`'s frame.** The frame
  carries a permanent CSS `filter`, which makes it a containing block for fixed
  descendants — so anything meaning "fixed to the screen" renders through
  `app/Portal.tsx`, below the drawer's z-index. See `decisions.md`.
- **No hard-coded colours or spacing in components** — everything reads a token
  from `theme.css`, so the WP-14 day/night toggle is a single `data-theme`
  attribute on `<html>`. Dark currently follows the OS setting.
- Styling is CSS Modules, co-located with each component.

### Storage (WP-03)

`web/src/storage/` is the only code allowed to touch IndexedDB. Dexie database
`reading-buddy`, currently schema version 10:

| Table | Primary key | Holds | Since |
|---|---|---|---|
| `books` | `id` | `BookMeta` — indexed on title, type, importedAt, contentHash, textSignature, and `*folderIds` (multiEntry, v9) | v1 |
| `manifests` | `bookId` | one `Manifest` per book | v1 |
| `chapters` | `[bookId+chapter]` | one `ChapterIndex` per chapter | v1 |
| `sections` | `[bookId+path]` | **one row per section** — the retrieval atom | v1 |
| `positions` | `bookId` | where reading stopped, indexed on `at` | v4 |
| `sources` | `bookId` | the original file, so a parser fix can be re-applied | v5 |
| `assets` | `[bookId+path]` | one row per picture, addressed like a section | v6 |
| `quotes` | `[bookId+id]` | favourite passages | v7 |
| `folders` | `id` | the reader's own shelves, indexed on name | v8 |
| `bookmarks` | `[bookId+id]` | a marked place, indexed on `bookId` | v10 |

- **Everything per-book is its own table, keyed by `bookId`.** A reading
  position is written every few seconds while reading, and a picture can be a
  megabyte — neither belongs on the book row, which would then be rewritten in
  full on every save and read in full on every shelf paint.
- **A book may be in any number of folders** (`BookMeta.folderIds`, absent =
  loose), and **deleting a folder unfiles its books rather than deleting them.**
  It shipped as one-folder-per-book in v8 and became many in v9 at the reader's
  request. The property that keeps it a *folder* rather than a *tag* is that the
  shelf shows each book **once**, however many folders it is in.
- **"Unread" and "Finished" are folders with no rows.** They are worked out from
  the `positions` table each time the shelf is drawn, so membership cannot drift
  from the book's own progress. Their ids are namespaced `system:` and the
  repository refuses to write them onto a book — see
  `library/systemFolders.ts`.
- **A bookmark stores an anchor, never a page number.** Pages are laid out from
  the reader's own type size, so a stored page number would name a different
  sentence the moment the text grew — and this app puts that control two taps
  away. `deleteBook` cascades to `bookmarks`, or a mark would outlive its book
  and reattach to whatever was next imported under that id.

- **Import `./storage`, never `./storage/db.ts`.** `repository.ts` is the door;
  the database behind it stays swappable.
- **There is deliberately no `loadBook()`.** Retrieval is `getManifest` +
  `getChapterIndex` + one `getSection`. Adding a whole-book read would quietly
  undo the token strategy.
- **Schema changes go in a new `.version(n)` block** — never edit a shipped one,
  or existing installs lose data. Most additions need no migration: an absent
  field is the state every existing row is already in (`folderId` in v8 was the
  worked example — a book without one is loose, which all of them were).
  **v9 is the exception and the one to copy when a migration is genuinely
  needed**: `folderId` → `folderIds` had to rewrite every filed book, because an
  absent list does *not* mean the same thing as the old single field, and
  skipping it would have opened every folder the reader made as empty. It is
  tested against a database written at v8 and reopened at v9 — a direct call to
  the upgrade function cannot catch "the upgrade never ran".
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
