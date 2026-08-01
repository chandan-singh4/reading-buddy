# Reading Buddy

A mobile-first PWA reading companion. The web app in `web/` **is** the product;
`shell/` is a throwaway Tauri harness for desktop dev, and `api/` is a tiny
endpoint that holds the Claude key so it never reaches the browser.

## Repo layout

```
reading-buddy/
├─ package.json            # monorepo root — npm workspaces, the dev/build scripts
├─ tsconfig.json           # solution file, references web/
├─ web/                    # THE PRODUCT — Vite + React + TS, PWA
│  ├─ index.html
│  ├─ vite.config.ts       # React + vite-plugin-pwa (wired, not yet configured)
│  ├─ tsconfig.json        # → tsconfig.app.json (src) + tsconfig.node.json (config)
│  └─ src/
├─ shell/                  # Tauri dev harness — placeholder until WP-02
├─ api/                    # Claude proxy endpoint — placeholder
├─ books/                  # source material
├─ research-paper/         # source material
├─ prototypes/             # scratch explorations, not built
├─ CLAUDE.md               # auto-loaded every session (the manifest)
├─ .claude/skills/
│  ├─ startup/SKILL.md     # /startup
│  ├─ wrap-session/SKILL.md# /wrap-session
│  └─ plan-task/SKILL.md   # /plan-task
└─ docs/
   ├─ active-task.md       # the one task in flight (+ its file list)
   ├─ progress.md          # you-are-here snapshot
   ├─ backlog.md           # all 34 waypoints + status
   ├─ decisions.md         # settled architectural choices
   └─ architecture.md      # folder layout + parsed-book structure
```

`web/` is the only workspace. Run everything from the repo root.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces (run once, from the root). |
| `npm run dev` | Vite dev server on <http://localhost:5173>. |
| `npm run typecheck` | `tsc -b` across the project references. No emit. |
| `npm run build` | Typecheck, then production build to `web/dist/`. |
| `npm run preview` | Serve the built output locally. |

## The session loop

1. **`/startup`** — reads only `progress.md` + `active-task.md`, opens only the
   files that task lists, and waits.
2. Build the task.
3. **`/wrap-session`** — writes state back into the docs and sets up the next
   `active-task.md`, so tomorrow's `/startup` is just as cheap.

`/plan-task` fills `active-task.md` from the backlog when you finish one and need
the next.

## Why the docs are shaped this way

`CLAUDE.md` is a small routing table, not the codebase. Everything else is read
*on demand*. The build session's default reading list is one short file
(`active-task.md`) plus the handful of code paths it names — not a tree scan.
State lives in Markdown the model can reload in a few hundred tokens instead of
replaying whole files. It's the same trick Reading Buddy itself uses on books: a
manifest so the model finds the right slice without reading everything.

*(Aside on naming: "Wayfinder" was the planning method used to map this build
end-to-end. It lives on only in the planning artefacts — the build board and the
34 "waypoints" in `docs/backlog.md` — not as the product's name.)*
