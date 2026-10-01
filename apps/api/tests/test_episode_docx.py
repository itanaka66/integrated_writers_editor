import io

from docx import Document

from app.docx_convert import markdown_to_docx


def make_episode(client, project):
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "第一話", "summary": "s", "content": "本文A"})
    assert r.status_code == 200
    return r.json()


def test_docx_import_updates_content_and_snapshots_revision(client, project):
    ep = make_episode(client, project)
    docx_bytes = markdown_to_docx("## 新しい見出し\n\n本文B")

    r = client.post(
        f"/api/v1/episodes/{ep['id']}/docx-import",
        files={"file": ("import.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 200
    body = r.json()
    assert "新しい見出し" in body["content"]
    assert "本文B" in body["content"]

    revisions = client.get(f"/api/v1/episodes/{ep['id']}/revisions").json()
    assert len(revisions) == 1
    old = client.get(f"/api/v1/episodes/{ep['id']}/revisions/{revisions[0]['id']}").json()
    assert old["content"] == "本文A"


def test_docx_import_identical_content_does_not_snapshot(client, project):
    ep = make_episode(client, project)
    docx_bytes = markdown_to_docx(ep["content"])

    r = client.post(
        f"/api/v1/episodes/{ep['id']}/docx-import",
        files={"file": ("import.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 200

    revisions = client.get(f"/api/v1/episodes/{ep['id']}/revisions").json()
    assert revisions == []


def test_docx_import_rejects_non_docx_upload(client, project):
    ep = make_episode(client, project)
    r = client.post(
        f"/api/v1/episodes/{ep['id']}/docx-import",
        files={"file": ("notdocx.txt", b"this is not a docx file", "text/plain")},
    )
    assert r.status_code == 400


def test_docx_import_not_found_for_missing_episode(client):
    docx_bytes = markdown_to_docx("本文")
    r = client.post(
        "/api/v1/episodes/999999/docx-import",
        files={"file": ("import.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 404


def test_docx_export_returns_valid_docx_matching_content(client, project):
    ep = make_episode(client, project)
    r = client.get(f"/api/v1/episodes/{ep['id']}/docx-export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert "attachment" in r.headers["content-disposition"]
    assert "第一話" in r.headers["content-disposition"] or "filename*=" in r.headers["content-disposition"]

    doc = Document(io.BytesIO(r.content))
    text = "\n\n".join(p.text for p in doc.paragraphs)
    assert "本文A" in text


def test_docx_export_not_found_for_missing_episode(client):
    r = client.get("/api/v1/episodes/999999/docx-export")
    assert r.status_code == 404
