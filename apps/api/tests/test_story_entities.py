import pytest

ENTITY_CASES = [
    (
        "characters",
        {"name": "田中", "role": "主人公"},
        {"name": "田中太郎"},
    ),
    (
        "world",
        {"name": "集落", "entity_type": "location"},
        {"name": "大集落"},
    ),
    (
        "plots",
        {"title": "本編"},
        {"title": "本編改"},
    ),
    (
        "foreshadowings",
        {"title": "伏線A"},
        {"status": "resolved"},
    ),
    (
        "timeline",
        {"episode_number": 1, "title": "出来事"},
        {"title": "出来事改"},
    ),
]

SINGULAR = {
    "characters": "characters",
    "world": "world",
    "plots": "plots",
    "foreshadowings": "foreshadowings",
    "timeline": "timeline",
}


@pytest.mark.parametrize("path,create_body,update_body", ENTITY_CASES)
def test_entity_crud_round_trip(client, project, path, create_body, update_body):
    r = client.post(f"/api/v1/projects/{project['id']}/{path}", json=create_body)
    assert r.status_code == 200, r.text
    obj = r.json()

    r = client.get(f"/api/v1/projects/{project['id']}/{path}")
    assert any(o["id"] == obj["id"] for o in r.json())

    r = client.put(f"/api/v1/{path}/{obj['id']}", json=update_body)
    assert r.status_code == 200, r.text
    updated = r.json()
    for k, v in update_body.items():
        assert updated[k] == v
    # Fields not included in the update payload must be preserved.
    for k, v in create_body.items():
        if k not in update_body:
            assert updated[k] == v

    r = client.delete(f"/api/v1/{path}/{obj['id']}")
    assert r.status_code == 204

    r = client.get(f"/api/v1/projects/{project['id']}/{path}")
    assert all(o["id"] != obj["id"] for o in r.json())


@pytest.mark.parametrize("path", ["characters", "world", "plots", "foreshadowings", "timeline"])
def test_entity_update_not_found(client, path):
    r = client.put(f"/api/v1/{path}/999999", json={})
    assert r.status_code == 404


@pytest.mark.parametrize("path", ["characters", "world", "plots", "foreshadowings", "timeline"])
def test_entity_delete_not_found(client, path):
    r = client.delete(f"/api/v1/{path}/999999")
    assert r.status_code == 404


def test_character_relation_add_and_delete(client, project):
    a = client.post(f"/api/v1/projects/{project['id']}/characters", json={"name": "A"}).json()
    b = client.post(f"/api/v1/projects/{project['id']}/characters", json={"name": "B"}).json()

    r = client.post(
        f"/api/v1/projects/{project['id']}/character-relations",
        json={"from_character_id": a["id"], "to_character_id": b["id"], "relation_type": "friend"},
    )
    assert r.status_code == 200, r.text
    rel = r.json()

    r = client.get(f"/api/v1/projects/{project['id']}/graphs/characters")
    assert r.status_code == 200
    edges = r.json()["edges"]
    assert any(e["source"] == a["id"] and e["target"] == b["id"] for e in edges)

    r = client.get(f"/api/v1/projects/{project['id']}/character-relations")
    assert r.status_code == 200
    assert any(x["id"] == rel["id"] for x in r.json())

    r = client.delete(f"/api/v1/character-relations/{rel['id']}")
    assert r.status_code == 204

    r = client.get(f"/api/v1/projects/{project['id']}/character-relations")
    assert all(x["id"] != rel["id"] for x in r.json())


def test_world_relation_add_and_delete(client, project):
    a = client.post(f"/api/v1/projects/{project['id']}/world", json={"name": "村"}).json()
    b = client.post(f"/api/v1/projects/{project['id']}/world", json={"name": "森"}).json()

    r = client.post(
        f"/api/v1/projects/{project['id']}/world-relations",
        json={"from_world_id": a["id"], "to_world_id": b["id"], "relation_type": "隣接"},
    )
    assert r.status_code == 200, r.text
    rel = r.json()

    r = client.get(f"/api/v1/projects/{project['id']}/world-relations")
    assert r.status_code == 200
    assert any(x["id"] == rel["id"] for x in r.json())

    r = client.delete(f"/api/v1/world-relations/{rel['id']}")
    assert r.status_code == 204

    r = client.get(f"/api/v1/projects/{project['id']}/world-relations")
    assert all(x["id"] != rel["id"] for x in r.json())
