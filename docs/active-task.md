> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Two things wait on the phone, then WP-25 finishes

Nothing is mid-edit. Build green, **1335 tests across 77 files** (2026-08-15).
`main` is pushed, so both items below are live on the phone now.

### 1. Judge on the phone (reader only — no code needed)

- **The finger-tracked page curl.** jsdom has no compositor, so no drag has ever
  been under a thumb. This is provable on the phone or not at all.
- **The new Bookmarks and Notes panels.** The Browser pane has no book on its
  shelf, so both were proved by tests, not by eye. Look for the ribbon growing
  down when a bookmark unfurls, and for the two note styles side by side.

### 2. Then: finish WP-25 — something that *writes* a note

The Notes tab reads a table that nothing fills. That is the next task.

**Definition of done**

1. A reader can make a note from a selected paragraph, and it appears in the
   Notes tab against the right anchor, with `author: 'you'`.
2. Deleting a note works from the panel.
3. Tests cover the write path the way `notes.test.ts` covers the read path.
4. Build green, then ship per CLAUDE.md.

**Open question to settle first:** whether notes stay device-local or go to the
cloud. Going to the cloud means a Supabase table, an outbox entry and a method on
`Repository` — a session of its own. Recommend shipping device-local first.

### Files in scope

| Path | Why |
|---|---|
| `web/src/storage/notes.ts` | The note store. `addNote` already exists; wire it. |
| `web/src/reader/NotesPanel.tsx` | Where a new note must appear. |
| `web/src/reader/notes.ts` | Order, filters and chapter grouping. Pure. |
| `web/src/pages/Reader.tsx` | Builds `noteRows`; the write must refresh them. |
| `web/src/reader/Chrome.tsx` | Where the panels mount. |
| `web/src/storage/db.ts` | The `notes` table at `version(11)`. |
| `web/src/reader/BookmarksPanel.tsx` | Only if the reader asks for a change. |
| `web/src/reader/BookmarksPanel.module.css` | Only if the reader asks for a change. |
| `web/src/reader/NotesPanel.module.css` | Only if the reader asks for a change. |

### Out of scope

- Highlights. WP-25 names them, but a note is the smaller half; do it first.
- A cloud path for notes. See the open question above.
- Any other screen, and any design token.
