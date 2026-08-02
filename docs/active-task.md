> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-11 · In-app import + auto-parse

Nothing in the app calls the parsers yet. This is the step that makes them real:
pick a file on the phone → choose the parser by extension → save through
`repository.saveParsedBook` → the book appears in the Library.

This closes the walking skeleton's first half (import → store → list). WP-12
(the renderer) is what makes it readable.

### Definition of done
- [ ] `web/src/import/importBook.ts` takes a `File`, picks the parser from the
      extension (`.epub .pdf .md .txt .docx`), builds `BookMeta` (new `BookId`,
      `importedAt`, `type` defaulting to `dense-technical` until WP-10), and
      saves via `repository.saveParsedBook`.
- [ ] A file input on the Library page — accepts the five extensions, handles one
      file at a time, and shows progress. Parsing a large epub blocks briefly;
      the UI must not look frozen.
- [ ] **Failure is explained, never silent.** An unsupported extension, a
      DRM/corrupt file (`EpubError` / `DocxError` / `PdfError`), and a scanned
      PDF that yields *zero* blocks each produce a distinct, plain-language
      message. The scanned-PDF case is the one most likely to look like a bug.
- [ ] A one-line note in the picker that Kindle files should be converted to EPUB
      first (see the declined `.azw3`/`.kfx` entry in `backlog.md`).
- [ ] Import is atomic — a failure part-way leaves no half-parsed book (the
      repository already handles this; the UI must not defeat it).
- [ ] Library lists the imported book and it survives a reload.
- [ ] Tests: extension routing, each failure path, and one end-to-end import into
      a fake-indexeddb repository.
- [ ] `npm test`, `npm run typecheck`, `npm run build` all pass.

### Files in scope
- `web/src/import/importBook.ts` (new)
- `web/src/import/importBook.test.ts` (new)
- `web/src/import/index.ts` (new — public entry point)
- `web/src/pages/Library.tsx` (edit — the picker + progress + error states)
- `web/src/pages/Library.module.css` (edit — if it exists; create if not)
- `web/src/import/dropped.ts` (new — turns a drop, folders included, into files)
- `web/src/import/shelf.ts` (new — guesses book / paper / document at import)
- `web/src/import/shelf.test.ts` (new)
- `web/src/pages/page.module.css` (edit — import, card and shelf styles went here,
  in the shared stylesheet, rather than into a new `Library.module.css`)
- `web/src/storage/db.ts` (edit — schema v2/v3 for the duplicate fingerprints)
- `web/src/storage/repository.ts` (edit — fingerprint lookups; the index only
  re-exports names, so the signatures had to be read here)
- `web/src/structure/types.ts` (edit — `contentHash`, `textSignature`, `shelf`;
  same reason as above)
- `web/src/parse/index.ts` (read only — the five parser entry points)
- `web/src/storage/index.ts` (read only — `repository`, `ParsedBook`)
- `web/src/structure/index.ts` (read only — `BookMeta`, `BookId`, `SourceFormat`)
- *(create as needed — add any new path to this list)*

### Out of scope
- The renderer (WP-12). This task ends at "the book is in the library".
- Manifest summaries (WP-09) and classification (WP-10) — both need a model call.
  Leave summaries empty and `type` at its default.
- Cover extraction, multi-file import, drag-and-drop, and import progress *inside*
  a parse (the parsers are synchronous once started).

### Useful context (already known — don't re-derive)
- Gates: `npm test`, `npm run typecheck`, `npm run build`, all from the repo root.
- Parsers are `parseEpub` / `parsePdf` / `parseDocx` (async) and `parseMarkdown` /
  `parseTxt` (sync). All take `(data, meta)` and return a `ParsedBook`.
- `books/` holds a real EPUB and `research-paper/` a PDF, both untracked — useful
  for manual checking, not for tests.
- Vitest defaults to the `node` environment; add `// @vitest-environment jsdom`
  per file when a DOM is needed (epub/docx/html parsing and React tests).
