> **What's in here (read when a "why is it this way?" question comes up, or
> before changing an architectural choice).** The finalized, load-bearing
> decisions from the Wayfinder Map spec — the ones that constrain how features get
> built. Each is a one-liner: the decision plus, where it matters, the reason.
> Treat these as settled; if a session wants to reverse one, flag it to me first
> and append the change here with a date. Not needed during routine building —
> only when a choice is in question. Grouped by area.

---

### Architecture / retrieval
- **Address-based retrieval.** A book parses once into a folder tree where the
  path *is* the address (`/book/ch02/index.md`, `s03.md`, anchors like
  `[ch02-s03-p013]`). A query loads `manifest.md` + the chapter index + one
  section file — never the whole book. This is the entire token strategy.
- **Anchors are permanent** once assigned.
- **Books stay fully separate** — no cross-book memory or lookups, ever.
- **One shared parser, three front-ends.** epub / pdf / md all feed one structure.
  PDF adds a running-header/footer filter; md resolves to whichever heading levels
  exist; all fall back to fixed-size bucketing.

### Product / platform
- **Target is a mobile-first installable PWA.** The Tauri desktop shell is a
  disposable dev/test surface, retired at the end (WP-34). The web UI is the asset.
- **Import via in-app file picker**, never OS file-type association; books always
  reopen from the in-app library.
- **.epub / .pdf / .md all ship in the first build.**

### The tutor
- **Book-type gating.** Classified light-fiction vs dense/technical at import
  (manual override). Gating drives the whole tutor apparatus; a novel gets only
  Highlight / Copy / Define / Ask.
- **Persona** is a domain-expert tutor blend, teaching-first; prerequisite gaps
  identified by live judgment, not a precomputed dependency map.
- **12 named teaching modes** as quick-taps, dense books only.
- **learner.md** tracks understood/struggled concepts, working analogies, and
  misconceptions; read into every Ask; actively shortens re-explanations.
- **Chapter recap** = precomputed zero-token summary + "things learned" (from
  saved notes) + optional cheap live quiz; quiz misses feed learner.md.

### Claude API
- **Tiered models:** Haiku 4.5 for the first 5 exchanges per thread, then
  Sonnet 5. Prompt caching on. Errors surface as a retry button. Responses stream
  and stay concise regardless of selection length.
- **Key** lives in env-var / OS secret now, moving behind a small backend endpoint
  once the phone can reach it.

### Session tooling
- **Build board stays static, no live persistence.** `wayfinder_build_board.html`
  mirrors `docs/backlog.md`'s 34 waypoints for an at-a-glance view; its
  `window.storage` calls don't work unpublished, so clicking cards won't save.
  `docs/backlog.md` is the single source of truth — `/wrap-session` mirrors any
  flipped checkbox into the board's baked-in `state` object. — 2026-08-01

### UX misc
- **Select → inline popup** (not a side panel). Ask is the only action that calls
  Claude; every Ask auto-saves a plain-language Q&A note.
- **Nav overlay** is Google-Books-style (tap-fade, bottom slider, left ToC icon).
- **Reader ships:** font/spacing, day/night, bookmarks, in-book search,
  reopen-where-left-off, read-aloud (phone TTS).
- **Cost visibility** = detailed per-book / per-session / per-model-tier screen.
- **Google Drive backup/restore** is opt-in, off by default.
- **Install path:** mkcert local HTTPS, one-time manual trust per phone.
