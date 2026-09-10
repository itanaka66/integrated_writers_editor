def make_episode(client, project):
    r = client.post(f"/api/v1/projects/{project['id']}/episodes", json={"number": 1, "title": "第一話", "summary": "s", "content": "本文A"})
    assert r.status_code == 200
    return r.json()


def test_no_revisions_until_content_changes(client, project):
    ep = make_episode(client, project)
    r = client.get(f"/api/v1/episodes/{ep['id']}/revisions")
    assert r.status_code == 200
    assert r.json() == []


def test_saving_new_content_snapshots_the_old_version(client, project):
    ep = make_episode(client, project)
    client.put(f"/api/v1/episodes/{ep['id']}", json={"content": "本文B"})

    r = client.get(f"/api/v1/episodes/{ep['id']}/revisions")
    revisions = r.json()
    assert len(revisions) == 1
    assert revisions[0]["title"] == "第一話"

    r = client.get(f"/api/v1/episodes/{ep['id']}/revisions/{revisions[0]['id']}")
    assert r.json()["content"] == "本文A"


def test_saving_identical_content_does_not_snapshot(client, project):
    ep = make_episode(client, project)
    client.put(f"/api/v1/episodes/{ep['id']}", json={"content": "本文A"})
    r = client.get(f"/api/v1/episodes/{ep['id']}/revisions")
    assert r.json() == []


def test_restore_brings_back_old_content_and_snapshots_current(client, project):
    ep = make_episode(client, project)
    client.put(f"/api/v1/episodes/{ep['id']}", json={"content": "本文B"})
    revisions = client.get(f"/api/v1/episodes/{ep['id']}/revisions").json()
    old_revision_id = revisions[0]["id"]

    r = client.post(f"/api/v1/episodes/{ep['id']}/revisions/{old_revision_id}/restore")
    assert r.status_code == 200
    assert r.json()["content"] == "本文A"

    # Restoring itself created a new revision snapshotting "本文B", so we can
    # undo the undo.
    revisions = client.get(f"/api/v1/episodes/{ep['id']}/revisions").json()
    assert len(revisions) == 2
    contents = {rv["id"]: client.get(f"/api/v1/episodes/{ep['id']}/revisions/{rv['id']}").json()["content"] for rv in revisions}
    assert "本文B" in contents.values()


def test_revision_history_is_capped(client, project):
    ep = make_episode(client, project)
    for i in range(25):
        client.put(f"/api/v1/episodes/{ep['id']}", json={"content": f"本文{i}"})
    revisions = client.get(f"/api/v1/episodes/{ep['id']}/revisions").json()
    assert len(revisions) == 20


def test_revisions_not_found_for_missing_episode(client):
    r = client.get("/api/v1/episodes/999999/revisions")
    assert r.status_code == 404


def test_restore_not_found_for_missing_revision(client, project):
    ep = make_episode(client, project)
    r = client.post(f"/api/v1/episodes/{ep['id']}/revisions/999999/restore")
    assert r.status_code == 404
