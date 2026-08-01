"""
PROTOTYPE -- throwaway, answers one question, do not ship as-is.

Question (wayfinder ticket: multi-format-parsing):
How do .pdf and .md files map onto the shared chapter/section/paragraph
structure with permanent anchors -- using the same "best-effort inference,
fixed-size fallback" rule already validated for .epub -- and can one shared
pipeline (format-specific front end -> common anchor writer) serve all
formats without drifting the manifest/anchor convention?

Test files (both already sitting in reading-buddy/):
  - STARTUP.md               (has real ## headings to test the friendly case)
  - s42240-024-00169-w.pdf    (a real PDF with no epub-style semantic structure)

Run:  python prototypes/multi_format_parsing_prototype.py
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import pdfplumber

MD_PATH = Path(__file__).parent.parent / "STARTUP.md"
PDF_PATH = Path(__file__).parent.parent / "s42240-024-00169-w.pdf"

FALLBACK_BUCKET_SIZE = 3  # paragraphs per section, when no headings are found

# --------------------------------------------------------------------------
# Shared data shape (this is the part meant to survive past the prototype)
# --------------------------------------------------------------------------


@dataclass
class Paragraph:
    anchor: str
    text: str
    approximate: bool


@dataclass
class Section:
    title: str
    paragraphs: list[Paragraph]
    approximate: bool


@dataclass
class Chapter:
    title: str
    sections: list[Section]
    approximate: bool


@dataclass
class Book:
    source: str
    chapters: list[Chapter]


# Raw shape each format's front end produces, before anchors are assigned.
# (title, paragraphs, approximate)
RawSection = tuple[str, list[str], bool]
# (title, sections, approximate)
RawChapter = tuple[str, list[RawSection], bool]


def bucket(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def build_book(source: str, raw_chapters: list[RawChapter]) -> Book:
    """Shared anchor-assignment step -- the one writer both front ends funnel into."""
    chapters: list[Chapter] = []
    for ci, (c_title, raw_sections, c_approx) in enumerate(raw_chapters, start=1):
        sections: list[Section] = []
        for si, (s_title, paragraphs, s_approx) in enumerate(raw_sections, start=1):
            paras = [
                Paragraph(anchor=f"ch{ci:02d}-s{si:02d}-p{pi:03d}", text=text, approximate=(c_approx or s_approx))
                for pi, text in enumerate(paragraphs, start=1)
            ]
            sections.append(Section(title=s_title, paragraphs=paras, approximate=s_approx))
        chapters.append(Chapter(title=c_title, sections=sections, approximate=c_approx))
    return Book(source=source, chapters=chapters)


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


# --------------------------------------------------------------------------
# Markdown front end
# --------------------------------------------------------------------------


def md_to_raw_chapters(text: str) -> list[RawChapter]:
    lines = text.splitlines()
    heading_re = re.compile(r"^(#{1,6})\s+(.*)")

    # Walk the file collecting (level, title, body_lines) blocks.
    blocks: list[tuple[int, str, list[str]]] = []
    current_level, current_title, current_body = 0, "(preamble)", []
    for line in lines:
        m = heading_re.match(line)
        if m:
            blocks.append((current_level, current_title, current_body))
            current_level, current_title, current_body = len(m.group(1)), m.group(2).strip(), []
        else:
            current_body.append(line)
    blocks.append((current_level, current_title, current_body))
    blocks = [b for b in blocks if b[1] != "(preamble)" or any(l.strip() for l in b[2])]

    heading_levels = sorted({level for level, _, _ in blocks if level > 0})
    # Use the *highest* (numerically smallest) heading level actually present
    # as "chapter", and the next level down as "section" -- a doc using only
    # ## has no need for an absent #.
    chapter_level = heading_levels[0] if heading_levels else None
    section_level = heading_levels[1] if len(heading_levels) > 1 else None

    if chapter_level is None:
        # No chapter-level headings anywhere -> fixed-size fallback, whole file
        # is one approximate chapter, paragraphs bucketed into fake sections.
        all_paragraphs = split_paragraphs(text)
        raw_sections = [(f"(untitled, paragraphs {i * FALLBACK_BUCKET_SIZE + 1}-{i * FALLBACK_BUCKET_SIZE + len(chunk)})", chunk, True)
                         for i, chunk in enumerate(bucket(all_paragraphs, FALLBACK_BUCKET_SIZE))]
        return [("(untitled document)", raw_sections, True)]

    # Real chapters exist. Group blocks under their nearest preceding H1;
    # H2 blocks become real sections; anything else (preamble, H3+) gets
    # folded into a fallback-bucketed section under the current chapter.
    raw_chapters: list[RawChapter] = []
    chapter_title, chapter_sections, loose_paragraphs = None, [], []

    def flush_loose():
        if loose_paragraphs:
            for i, chunk in enumerate(bucket(loose_paragraphs, FALLBACK_BUCKET_SIZE)):
                chapter_sections.append((f"(untitled section {i + 1})", chunk, True))
            loose_paragraphs.clear()

    for level, title, body_lines in blocks:
        body_text = "\n".join(body_lines)
        paras = split_paragraphs(body_text)
        if level == chapter_level:
            if chapter_title is not None:
                flush_loose()
                raw_chapters.append((chapter_title, chapter_sections, False))
            chapter_title, chapter_sections, loose_paragraphs = title, [], []
            loose_paragraphs.extend(paras)
        elif level == section_level and chapter_title is not None:
            flush_loose()
            chapter_sections.append((title, paras, False))
        elif chapter_title is not None:
            # deeper heading levels or preamble-with-no-chapter-yet: fallback-bucketed loose text.
            loose_paragraphs.extend(paras)

    if chapter_title is not None:
        flush_loose()
        raw_chapters.append((chapter_title, chapter_sections, False))

    return raw_chapters


# --------------------------------------------------------------------------
# PDF front end
# --------------------------------------------------------------------------


def pdf_to_raw_chapters(path: Path) -> list[RawChapter]:
    from collections import Counter

    lines_info = []  # (page_no, top, size, bold, text)

    with pdfplumber.open(path) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            words = page.extract_words(extra_attrs=["size", "fontname"])
            if not words:
                continue
            # group words into lines by rounded 'top'
            rows: dict[int, list] = {}
            for w in words:
                rows.setdefault(round(w["top"]), []).append(w)
            for top in sorted(rows):
                row = sorted(rows[top], key=lambda w: w["x0"])
                text = " ".join(w["text"] for w in row)
                size = sum(w["size"] for w in row) / len(row)
                bold = sum(1 for w in row if "bold" in w["fontname"].lower()) > len(row) / 2
                lines_info.append((page_no, top, round(size, 1), bold, text))

    if not lines_info:
        return [("(no extractable text -- likely a scanned/image PDF)", [], True)]

    # Running headers/footers: near-identical text (digits normalized out)
    # repeating across several pages. Real chapter/section text doesn't
    # repeat like that, so strip it before heading detection.
    normalized_counts = Counter(re.sub(r"\d+", "#", text) for *_, text in lines_info)
    n_pages = len({page_no for page_no, *_ in lines_info})
    boilerplate_threshold = max(3, n_pages // 2)
    lines_info = [
        row for row in lines_info
        if normalized_counts[re.sub(r"\d+", "#", row[4])] < boilerplate_threshold
    ]

    if not lines_info:
        return [("(all text looked like repeated header/footer boilerplate)", [], True)]

    size_counts = Counter(round(s) for *_, s, _, _ in lines_info)
    body_size = size_counts.most_common(1)[0][0]

    def is_heading(size, bold, text):
        return (size >= body_size + 2 or bold) and len(text) < 90 and not text.endswith((".", ",", ";"))

    heading_sizes = sorted({round(s) for *_, s, b, t in lines_info if is_heading(s, b, t)}, reverse=True)

    if not heading_sizes:
        # No structural cues at all -> fixed-size fallback over the whole document.
        full_text = "\n\n".join(text for *_, text in lines_info)
        all_paragraphs = split_paragraphs(full_text) or [full_text]
        raw_sections = [(f"(untitled, paragraphs {i * FALLBACK_BUCKET_SIZE + 1}-{i * FALLBACK_BUCKET_SIZE + len(chunk)})", chunk, True)
                         for i, chunk in enumerate(bucket(all_paragraphs, FALLBACK_BUCKET_SIZE))]
        return [("(untitled document)", raw_sections, True)]

    # Two-tier if we see >=2 distinct heading sizes, else treat the single
    # tier as section-level headings under one whole-document chapter.
    chapter_size = heading_sizes[0] if len(heading_sizes) > 1 else None

    raw_chapters: list[RawChapter] = []
    chapter_title, chapter_sections = "(untitled document)", []
    section_title, section_lines = None, []

    def flush_section():
        if section_lines:
            text = "\n\n".join(section_lines)
            paras = split_paragraphs(text) or [text]
            chapter_sections.append((section_title or "(untitled section)", paras, False))
            section_lines.clear()

    def flush_chapter():
        flush_section()
        if chapter_sections:
            raw_chapters.append((chapter_title, chapter_sections.copy(), False))
            chapter_sections.clear()

    for _, _, size, bold, text in lines_info:
        heading = is_heading(size, bold, text)
        if heading and chapter_size and round(size) == chapter_size:
            flush_chapter()
            chapter_title = text
            section_title = None
        elif heading:
            flush_section()
            section_title = text
        else:
            section_lines.append(text)

    flush_chapter()
    return raw_chapters if raw_chapters else [("(untitled document)", [("(untitled section)", ["(no text found)"], True)], True)]


# --------------------------------------------------------------------------
# TUI shell (throwaway -- navigates the parsed tree so you can eyeball it)
# --------------------------------------------------------------------------

BOLD, DIM, RESET = "\x1b[1m", "\x1b[2m", "\x1b[0m"


def load_books() -> dict[str, Book]:
    md_text = MD_PATH.read_text(encoding="utf-8")
    books = {
        "md": build_book("md", md_to_raw_chapters(md_text)),
        "pdf": build_book("pdf", pdf_to_raw_chapters(PDF_PATH)),
    }
    return books


def render(book: Book, ci: int, si: int):
    print("\033[2J\033[H", end="")
    chapter = book.chapters[ci]
    section = chapter.sections[si] if chapter.sections else None

    print(f"{BOLD}source:{RESET} {book.source}   {DIM}({len(book.chapters)} chapter(s)){RESET}")
    print(f"{BOLD}chapter {ci + 1}/{len(book.chapters)}:{RESET} {chapter.title} "
          f"{DIM}[{'APPROXIMATE' if chapter.approximate else 'inferred'}]{RESET}")
    if section is None:
        print(f"{DIM}(no sections){RESET}")
    else:
        print(f"{BOLD}section {si + 1}/{len(chapter.sections)}:{RESET} {section.title} "
              f"{DIM}[{'APPROXIMATE' if section.approximate else 'inferred'}]{RESET}")
        print()
        for p in section.paragraphs:
            flag = f"{DIM}~{RESET}" if p.approximate else " "
            preview = p.text.replace("\n", " ")[:100]
            print(f"  {DIM}[{p.anchor}]{RESET}{flag} {preview}")
    print()
    print(f"{BOLD}[m]{RESET}{DIM}d file  {RESET}"
          f"{BOLD}[j/k]{RESET}{DIM} chapter  {RESET}"
          f"{BOLD}[n/p]{RESET}{DIM} section  {RESET}"
          f"{BOLD}[q]{RESET}{DIM}uit{RESET}")


def getch() -> str:
    import msvcrt
    return msvcrt.getch().decode(errors="ignore")


def main():
    books = load_books()
    source = "md"
    ci, si = 0, 0

    while True:
        book = books[source]
        ci = max(0, min(ci, len(book.chapters) - 1))
        si = max(0, min(si, len(book.chapters[ci].sections) - 1)) if book.chapters[ci].sections else 0
        render(book, ci, si)

        key = getch()
        if key == "q":
            break
        elif key == "m":
            source = "pdf" if source == "md" else "md"
            ci, si = 0, 0
        elif key == "j":
            ci += 1
            si = 0
        elif key == "k":
            ci -= 1
            si = 0
        elif key == "n":
            si += 1
        elif key == "p":
            si -= 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not MD_PATH.exists() or not PDF_PATH.exists():
        print(f"Missing test file: {MD_PATH if not MD_PATH.exists() else PDF_PATH}", file=sys.stderr)
        sys.exit(1)
    main()
