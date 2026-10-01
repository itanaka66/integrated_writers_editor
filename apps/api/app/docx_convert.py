"""Best-effort, lossy conversion between this app's plain-text-with-Markdown
content format and real .docx files, scoped to per-episode import/export.

Deliberately narrow: the editor's only formatting affordances are bold
(**text**), italic (*text*), headings (## text) and blockquotes (> text) —
see WritePanel.tsx's editorToolbar. This module round-trips exactly those
four constructs and nothing else. Tables, images, lists and links are NOT
supported: a docx containing them will have that content flattened to plain
paragraph text on import, and markdown_to_docx never produces them.
"""
import io
import re

from docx import Document

_RUN_PATTERN = re.compile(r'(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*)')


def _add_runs(paragraph, text: str):
    """Split `text` on **bold**/*italic*/***bold italic*** markers and add
    one run per segment to `paragraph`, with .bold/.italic set and the
    markers themselves stripped out."""
    for part in _RUN_PATTERN.split(text):
        if not part:
            continue
        if part.startswith('***') and part.endswith('***') and len(part) >= 6:
            run = paragraph.add_run(part[3:-3])
            run.bold = True
            run.italic = True
        elif part.startswith('**') and part.endswith('**') and len(part) >= 4:
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part.startswith('*') and part.endswith('*') and len(part) >= 2:
            run = paragraph.add_run(part[1:-1])
            run.italic = True
        else:
            paragraph.add_run(part)


def markdown_to_docx(content: str) -> bytes:
    """Convert the editor's Markdown-ish plain text into a .docx file.

    Best-effort, lossy, and scoped to exactly four constructs: a line
    starting with "## " becomes a level-2 heading, a line starting with
    "> " becomes a block quote (python-docx's built-in 'Intense Quote'
    style), and **bold**/*italic*/***bold italic*** markers within any
    paragraph's text become real run formatting. Everything else is a plain
    paragraph. No tables, images, lists, or links are produced.
    """
    doc = Document()
    blocks = (content or '').split('\n\n')
    for block in blocks:
        lines = block.split('\n')
        for line in lines:
            if line.startswith('## '):
                p = doc.add_heading(level=2)
                _add_runs(p, line[3:])
            elif line.startswith('> '):
                p = doc.add_paragraph(style='Intense Quote')
                _add_runs(p, line[2:])
            else:
                p = doc.add_paragraph()
                _add_runs(p, line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _run_markup(run) -> str:
    text = run.text
    if not text:
        return ''
    if run.bold and run.italic:
        return f'***{text}***'
    if run.bold:
        return f'**{text}**'
    if run.italic:
        return f'*{text}*'
    return text


def docx_to_markdown(file_bytes: bytes) -> str:
    """Convert a .docx file's paragraphs into the editor's Markdown-ish plain
    text.

    Best-effort, lossy, and scoped to exactly four constructs: any paragraph
    whose style name starts with "Heading" becomes "## " + text (all heading
    levels collapse to the editor's single heading affordance), any
    paragraph whose style name contains "Quote" becomes "> " + text, and
    bold/italic runs are reconstructed as **bold**/*italic*/***bold
    italic*** markers. Everything else becomes a plain paragraph. Tables,
    images, lists, and links are NOT supported — their content is flattened
    to plain text or dropped.
    """
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = []
    for para in doc.paragraphs:
        text = ''.join(_run_markup(r) for r in para.runs) or para.text
        style_name = (para.style.name if para.style else '') or ''
        if style_name.startswith('Heading'):
            paragraphs.append(f'## {text}')
        elif 'Quote' in style_name:
            paragraphs.append(f'> {text}')
        else:
            paragraphs.append(text)
    return '\n\n'.join(paragraphs)
