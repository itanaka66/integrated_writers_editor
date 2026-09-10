def test_template_crud(client, project):
    r = client.get(f"/api/v1/projects/{project['id']}/templates")
    assert r.status_code == 200
    assert r.json() == []

    r = client.post(
        f"/api/v1/projects/{project['id']}/templates",
        json={"name": "SEO記事テンプレ", "structure": "# 導入\n# 本論\n# まとめ"},
    )
    assert r.status_code == 200, r.text
    template = r.json()
    assert template["name"] == "SEO記事テンプレ"
    assert template["project_id"] == project["id"]

    r = client.put(f"/api/v1/templates/{template['id']}", json={"name": "更新後"})
    assert r.status_code == 200
    assert r.json()["name"] == "更新後"

    r = client.get(f"/api/v1/projects/{project['id']}/templates")
    assert len(r.json()) == 1

    r = client.delete(f"/api/v1/templates/{template['id']}")
    assert r.status_code == 204
    r = client.get(f"/api/v1/projects/{project['id']}/templates")
    assert r.json() == []


def test_template_update_not_found(client):
    r = client.put("/api/v1/templates/999999", json={"name": "x"})
    assert r.status_code == 404
