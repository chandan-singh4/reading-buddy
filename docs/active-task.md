> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-01 · Scaffold the stack

Set up the monorepo and toolchain so every later waypoint has a home.

### Definition of done
- [x] `web/` runs a blank Vite + React + TypeScript app with `vite-plugin-pwa`
      installed and wired (not yet configured).
- [x] Root scripts `dev`, `typecheck`, and `build` all pass.
- [x] Empty `shell/` and `api/` folders committed with placeholder READMEs.

### Files in scope
- `package.json`, `tsconfig.json`, `vite.config.ts`
- `web/` (new)
- `README.md` (record the monorepo layout)
- *(create as needed — add any new path to this list)*

### Out of scope
- Any parser, reader UI, or Claude call — those are later waypoints.
- Tauri wiring — that's WP-02.
