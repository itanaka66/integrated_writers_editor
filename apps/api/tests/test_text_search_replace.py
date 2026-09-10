def _add_episode(client, pid, number, title, content):
    r = client.post(f"/api/v1/projects/{pid}/episodes", json={"number": number, "title": title, "content": content})
    assert r.status_code == 200
    return r.json()


def test_search_finds_matches_across_episodes(client, project):
    pid = project["id"]
    _add_episode(client, pid, 1, "第一話", "少年は森を歩いた。森は深かった。")
    _add_episode(client, pid, 2, "第二話", "海が見えた。")

    r = client.get(f"/api/v1/projects/{pid}/text-search", params={"query": "森"})
    assert r.status_code == 200
    body = r.json()
    assert body["total_matches"] == 2
    assert len(body["matches"]) == 1
    assert body["matches"][0]["count"] == 2


def test_search_is_case_insensitive_when_requested(client, project):
    pid = project["id"]
    _add_episode(client, pid, 1, "第一話", "Hello World")

    r = client.get(f"/api/v1/projects/{pid}/text-search", params={"query": "hello", "case_sensitive": False})
    assert r.json()["total_matches"] == 1

    r = client.get(f"/api/v1/projects/{pid}/text-search", params={"query": "hello", "case_sensitive": True})
    assert r.json()["total_matches"] == 0


def test_replace_all_updates_content_and_snapshots_a_revision(client, project):
    pid = project["id"]
    e = _add_episode(client, pid, 1, "第一話", "森で火を起こした。森は静かだった。")

    r = client.post(f"/api/v1/projects/{pid}/text-replace", json={"query": "森", "replacement": "山"})
    assert r.status_code == 200
    body = r.json()
    assert body["total_replaced"] == 2
    assert body["episodes"][0]["replaced_count"] == 2

    ep = client.get(f"/api/v1/projects/{pid}/episodes").json()[0]
    assert ep["content"] == "山で火を起こした。山は静かだった。"

    revisions = client.get(f"/api/v1/episodes/{e['id']}/revisions").json()
    assert len(revisions) == 1  # pre-replace content was snapshotted


def test_replace_is_scoped_to_given_episode_ids(client, project):
    pid = project["id"]
    e1 = _add_episode(client, pid, 1, "第一話", "森だ")
    _add_episode(client, pid, 2, "第二話", "森だ")

    r = client.post(f"/api/v1/projects/{pid}/text-replace", json={"query": "森", "replacement": "山", "episode_ids": [e1["id"]]})
    assert r.json()["total_replaced"] == 1

    eps = {e["number"]: e["content"] for e in client.get(f"/api/v1/projects/{pid}/episodes").json()}
    assert eps[1] == "山だ"
    assert eps[2] == "森だ"


def test_replace_with_empty_query_is_rejected(client, project):
    r = client.post(f"/api/v1/projects/{project['id']}/text-replace", json={"query": "", "replacement": "x"})
    assert r.status_code == 400
