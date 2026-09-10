def test_search_all_falls_back_to_postgres_across_projects(client):
    p1 = client.post("/api/v1/projects", json={"name": "作品A"}).json()
    p2 = client.post("/api/v1/projects", json={"name": "作品B"}).json()
    client.post(f"/api/v1/projects/{p1['id']}/episodes", json={"number": 1, "title": "EP1", "content": "森で目覚めた少年"})
    client.post(f"/api/v1/projects/{p2['id']}/episodes", json={"number": 1, "title": "EP1", "content": "森を歩く騎士"})

    r = client.post("/api/v1/rag/search-all", json={"query": "森", "limit": 10})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "postgresql"
    project_ids = {x["project_id"] for x in body["results"]}
    assert project_ids == {p1["id"], p2["id"]}
    names = {x["project_name"] for x in body["results"]}
    assert names == {"作品A", "作品B"}


def test_search_all_does_not_require_project_id(client):
    r = client.post("/api/v1/rag/search-all", json={"query": "anything"})
    assert r.status_code == 200
