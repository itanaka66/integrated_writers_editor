import zipfile
from io import BytesIO


def setup_episode(client, project):
    client.post(
        f"/api/v1/projects/{project['id']}/episodes",
        json={"number": 1, "title": "転移", "summary": "少年が目覚める", "content": "少年は森で目を覚ました。"},
    )


def test_export_txt(client, project):
    setup_episode(client, project)
    r = client.get(f"/api/v1/projects/{project['id']}/export", params={"format": "txt"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert "attachment" in r.headers["content-disposition"]
    assert "第1話 転移" in r.text
    assert "少年は森で目を覚ました。" in r.text


def test_export_markdown(client, project):
    setup_episode(client, project)
    r = client.get(f"/api/v1/projects/{project['id']}/export", params={"format": "md"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/markdown")
    assert f"# {project['name']}" in r.text
    assert "## 第1話 転移" in r.text


def test_export_epub_is_a_valid_zip_with_expected_entries(client, project):
    setup_episode(client, project)
    r = client.get(f"/api/v1/projects/{project['id']}/export", params={"format": "epub"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/epub+zip"

    z = zipfile.ZipFile(BytesIO(r.content))
    names = z.namelist()
    assert "mimetype" in names
    assert "META-INF/container.xml" in names
    assert "OEBPS/content.opf" in names
    assert "OEBPS/ch1.xhtml" in names
    assert z.read("mimetype") == b"application/epub+zip"
    assert "転移" in z.read("OEBPS/ch1.xhtml").decode("utf-8")


def test_export_rejects_unknown_format(client, project):
    r = client.get(f"/api/v1/projects/{project['id']}/export", params={"format": "pdf"})
    assert r.status_code == 400


def test_export_not_found_project(client):
    r = client.get("/api/v1/projects/999999/export")
    assert r.status_code == 404


def test_export_empty_project_does_not_crash(client, project):
    r = client.get(f"/api/v1/projects/{project['id']}/export", params={"format": "epub"})
    assert r.status_code == 200
