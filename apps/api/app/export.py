"""Build a downloadable export of a project's episodes.

Deliberately dependency-free: text/markdown are just string building, and
the EPUB is a minimal valid EPUB3 assembled by hand with the stdlib
`zipfile` rather than pulling in an ebook-authoring library for what is,
structurally, a handful of static XML files plus one XHTML file per
episode.
"""
import html
import io
import uuid
import zipfile


def _episode_heading(e):
    return f'第{e.number}話 {e.title}'.strip()


def build_text(project, episodes) -> str:
    parts = [project.name, '']
    if project.description:
        parts += [project.description, '']
    for e in episodes:
        parts += [_episode_heading(e), '', e.content or '(本文未入力)', '', '']
    return '\n'.join(parts)


def build_markdown(project, episodes) -> str:
    parts = [f'# {project.name}', '']
    if project.description:
        parts += [project.description, '']
    for e in episodes:
        parts += [f'## {_episode_heading(e)}', '']
        if e.summary:
            parts += [f'> {e.summary}', '']
        parts += [e.content or '*(本文未入力)*', '', '']
    return '\n'.join(parts)


def _epub_xhtml(title, body):
    escaped_title = html.escape(title)
    body_html = ''.join(f'<p>{html.escape(line)}</p>' for line in (body or '').split('\n') if line.strip())
    return f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{escaped_title}</title><meta charset="utf-8"/></head>
<body><h1>{escaped_title}</h1>{body_html or '<p>(本文未入力)</p>'}</body>
</html>'''


def build_epub(project, episodes) -> bytes:
    book_id = f'urn:uuid:{uuid.uuid4()}'
    chapters = [(f'ch{i}', f'第{e.number}話 {e.title}'.strip(), e.content) for i, e in enumerate(episodes, start=1)]

    manifest_items = ''.join(f'<item id="{cid}" href="{cid}.xhtml" media-type="application/xhtml+xml"/>' for cid, _, _ in chapters)
    spine_items = ''.join(f'<itemref idref="{cid}"/>' for cid, _, _ in chapters)
    nav_items = ''.join(f'<li><a href="{cid}.xhtml">{html.escape(title)}</a></li>' for cid, title, _ in chapters)

    content_opf = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">{book_id}</dc:identifier>
<dc:title>{html.escape(project.name)}</dc:title>
<dc:language>ja</dc:language>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
{manifest_items}
</manifest>
<spine>{spine_items}</spine>
</package>'''

    nav_xhtml = f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目次</title><meta charset="utf-8"/></head>
<body><nav epub:type="toc"><ol>{nav_items}</ol></nav></body>
</html>'''

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        # The mimetype entry must be first and stored uncompressed for
        # readers that sniff the file before parsing the zip properly.
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="utf-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>''')
        z.writestr('OEBPS/content.opf', content_opf)
        z.writestr('OEBPS/nav.xhtml', nav_xhtml)
        for cid, title, body in chapters:
            z.writestr(f'OEBPS/{cid}.xhtml', _epub_xhtml(title, body))
    return buf.getvalue()
