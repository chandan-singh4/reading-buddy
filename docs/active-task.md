> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Judge the chapter openings and the selection menu on the phone

Nothing is mid-edit. Build green, **1363 tests across 78 files** (2026-08-16).

Two features landed. The Browser pane has no book on its shelf, so neither was
proved by eye.

### 1. Judge on the phone (no code needed)

- **The chapter opening.** Open a chapter and look at its title. Four settings
  exist. A religious or spiritual book gets the ornament. Fiction gets the
  ruled nameplate. A numbered chapter gets the large figure. Everything else
  gets the plain setting.
- **The selection menu.** Select some words. Check the card lands near them, and
  flips above the selection near the foot of the screen.
- **Highlights and notes.** Both write a row into the Notes tab under *Quotes*.
  A highlight keeps its colour as a bar beside it.

### 2. Then: the tutor, and the two lookups

Six actions in the menu say "not built yet" when tapped. They need work this app
has not done:

- **Ask Claude** (four actions) needs the tutor loop — WP-17 onward.
- **Define** needs a dictionary. **Translate** needs a translator.

### Files in scope

| Path | Why |
|---|---|
| `web/src/reader/chapterHeading.ts` | Which of the four settings a chapter takes. Pure. |
| `web/src/reader/ChapterOpening.tsx` | Draws the four settings. |
| `web/src/reader/ChapterOpening.module.css` | Their type and spacing. |
| `web/src/reader/selection.ts` | A DOM selection turned into text plus an anchor. |
| `web/src/reader/SelectionMenu.tsx` | The menu itself. |
| `web/src/reader/SelectionMenu.module.css` | Its look, and where the tutor block sits. |
| `web/src/reader/NoteComposer.tsx` | The box a note is written in. |
| `web/src/pages/Reader.tsx` | Mounts all of the above; holds the actions. |
| `web/src/storage/notes.ts` | `addNote`, now with `quote` and `colour`. |
| `web/src/storage/db.ts` | `StoredNote`. Both new fields are unindexed. |
| `web/src/reader/NotesPanel.tsx` | Shows a highlight's colour. |

### Out of scope

- The tutor loop. It is its own waypoint.
- A cloud path for notes. Notes are still device-local.
- Any other screen, and any design token.
