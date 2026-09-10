def test_chat_history_starts_empty(client, project):
    r = client.get(f"/api/v1/projects/{project['id']}/chat")
    assert r.status_code == 200
    assert r.json() == []


def test_send_message_persists_user_and_assistant_turns(client, project):
    r = client.post(f"/api/v1/projects/{project['id']}/chat", json={"content": "こんにちは"})
    assert r.status_code == 200, r.text
    turns = r.json()
    assert len(turns) == 2
    assert turns[0]["role"] == "user"
    assert turns[0]["content"] == "こんにちは"
    assert turns[1]["role"] == "assistant"

    r = client.get(f"/api/v1/projects/{project['id']}/chat")
    history = r.json()
    assert len(history) == 2
    assert [m["role"] for m in history] == ["user", "assistant"]


def test_send_message_not_found_project(client):
    r = client.post("/api/v1/projects/999999/chat", json={"content": "hi"})
    assert r.status_code == 404


def test_clear_chat_history(client, project):
    client.post(f"/api/v1/projects/{project['id']}/chat", json={"content": "one"})
    r = client.delete(f"/api/v1/projects/{project['id']}/chat")
    assert r.status_code == 204
    r = client.get(f"/api/v1/projects/{project['id']}/chat")
    assert r.json() == []
