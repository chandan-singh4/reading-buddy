> **What's in here (read at every startup).** The single task in flight right
> now — its goal, its definition of done, the exact list of files to open, and
> what's explicitly out of scope. This is the linchpin of the token strategy: the
> build session reads *only* the paths under "Files in scope" and nothing else. If
> a task genuinely needs another file, add its path here with a one-line reason
> rather than scanning the repo. Rewritten at the end of every session by
> `/wrap-session` so the next one resumes without re-reading code.

---

## Task — WP-08 · Markdown parser → structure

Turn a `.md` file into the WP-05 structure: chapters, sections, anchored
paragraphs. Chosen ahead of epub/pdf because it needs no binary decoding, so it
proves the parse → store → render loop end-to-end at the lowest cost.

### Definition of done
- [ ] `web/src/parse/markdown.ts` takes raw markdown + `BookMeta` and returns a
      `ParsedBook` (meta, manifest, chapter indexes, sections) ready to hand
      straight to `repository.saveParsedBook`.
- [ ] Heading levels are **resolved from what the document actually contains**
      (`decisions.md`): the shallowest heading present becomes chapters, the
      next becomes sections. A file with no headings falls back to fixed-size
      bucketing so it still parses.
- [ ] Anchors are assigned via `structure/anchor.ts` — never hand-built — and
      are stable: re-parsing identical input yields identical anchors.
- [ ] Tests cover a normal `#`/`##` document, a `##`/`###`-only document, a
      heading-free document (fallback), and anchor stability across two runs.
- [ ] `npm test`, `npm run typecheck`, `npm run build` all pass.

### Files in scope
- `web/src/parse/markdown.ts` (new)
- `web/src/parse/index.ts` (new — public entry point)
- `web/src/parse/markdown.test.ts` (new)
- `web/src/structure/index.ts` (read only — the target shape and anchor helpers)
- `web/src/storage/index.ts` (read only — the `ParsedBook` shape to produce)
- *(create as needed — add any new path to this list)*

### Out of scope
- Epub (WP-06) and PDF (WP-07). One shared structure, but their front-ends come
  later; don't generalise prematurely for formats not yet written.
- Manifest **summaries** and crossrefs (WP-09) and classification (WP-10) — emit
  placeholder summaries, leave the fields present but unfilled.
- The import UI (WP-11) and the renderer (WP-12). This task ends at a
  `ParsedBook` in memory, verified by tests.

### Useful context (already known — don't re-derive)
- Gates: `npm test`, `npm run typecheck`, `npm run build`, all from the repo root.
- `books/` holds a real EPUB and `research-paper/` a PDF for later format work;
  neither is tracked by git.
