def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_project_create_and_list(client, project):
    r = client.get("/api/v1/projects")
    assert r.status_code == 200
    assert any(p["id"] == project["id"] for p in r.json())


def test_project_not_found(client):
    r = client.get("/api/v1/projects/999999")
    assert r.status_code == 404


def test_episode_crud_and_save_warnings(client, project):
    # A character must exist, otherwise update_character_states legitimately
    # has nothing to do and returns early without touching Ollama.
    client.post(f"/api/v1/projects/{project['id']}/characters", json={"name": "田中"})

    r = client.post(
        f"/api/v1/projects/{project['id']}/episodes",
        json={"number": 1, "title": "第一話", "summary": "s", "content": "本文"},
    )
    assert r.status_code == 200
    ep = r.json()

    r = client.get(f"/api/v1/projects/{project['id']}/episodes")
    assert len(r.json()) == 1

    # PUT hits RAG indexing and character-state update, both of which fail in
    # the test environment (no Ollama/Qdrant) — they must be reported as
    # warnings, not swallowed or turned into a 500.
    r = client.put(f"/api/v1/episodes/{ep['id']}", json={"title": "改題"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "改題"
    assert len(body["warnings"]) == 2

    r = client.delete(f"/api/v1/episodes/{ep['id']}")
    assert r.status_code == 204
    r = client.get(f"/api/v1/projects/{project['id']}/episodes")
    assert r.json() == []


def test_episode_put_not_found(client):
    r = client.put("/api/v1/episodes/999999", json={"title": "x"})
    assert r.status_code == 404
