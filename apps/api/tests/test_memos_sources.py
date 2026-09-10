def test_memo_crud(client, project):
    r = client.get(f"/api/v1/projects/{project['id']}/memos")
    assert r.status_code == 200
    assert r.json() == []

    r = client.post(f"/api/v1/projects/{project['id']}/memos", json={"category": "リサーチ", "title": "メモ1", "content": "内容"})
    assert r.status_code == 200, r.text
    memo = r.json()
    assert memo["category"] == "リサーチ"
    assert memo["project_id"] == project["id"]

    r = client.put(f"/api/v1/memos/{memo['id']}", json={"title": "更新後"})
    assert r.status_code == 200
    assert r.json()["title"] == "更新後"

    r = client.get(f"/api/v1/projects/{project['id']}/memos")
    assert len(r.json()) == 1

    r = client.delete(f"/api/v1/memos/{memo['id']}")
    assert r.status_code == 204
    r = client.get(f"/api/v1/projects/{project['id']}/memos")
    assert r.json() == []


def test_memo_update_not_found(client):
    r = client.put("/api/v1/memos/999999", json={"title": "x"})
    assert r.status_code == 404


def test_source_crud(client, project):
    r = client.post(
        f"/api/v1/projects/{project['id']}/episodes",
        json={"number": 1, "title": "記事1", "summary": "", "content": ""},
    )
    episode = r.json()

    r = client.get(f"/api/v1/episodes/{episode['id']}/sources")
    assert r.status_code == 200
    assert r.json() == []

    r = client.post(
        f"/api/v1/episodes/{episode['id']}/sources",
        json={"title": "出典1", "url": "https://example.com", "note": "メモ"},
    )
    assert r.status_code == 200, r.text
    source = r.json()
    assert source["episode_id"] == episode["id"]
    assert source["project_id"] == project["id"]

    r = client.put(f"/api/v1/sources/{source['id']}", json={"note": "更新後のメモ"})
    assert r.status_code == 200
    assert r.json()["note"] == "更新後のメモ"

    r = client.get(f"/api/v1/episodes/{episode['id']}/sources")
    assert len(r.json()) == 1

    r = client.delete(f"/api/v1/sources/{source['id']}")
    assert r.status_code == 204
    r = client.get(f"/api/v1/episodes/{episode['id']}/sources")
    assert r.json() == []


def test_source_add_episode_not_found(client):
    r = client.post("/api/v1/episodes/999999/sources", json={"title": "x"})
    assert r.status_code == 404
