from app import main as main_module


def test_summarize_material_with_text(client, monkeypatch):
    async def fake_generate(prompt):
        assert "資料本文" in prompt
        return "要約結果", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)

    r = client.post("/api/v1/tools/summarize-material", data={"text": "資料本文です。"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"] == "要約結果"
    assert body["model"] == "test-model"


def test_summarize_material_requires_input(client):
    r = client.post("/api/v1/tools/summarize-material", data={})
    assert r.status_code == 400


def test_summarize_material_with_pdf(client, monkeypatch):
    async def fake_generate(prompt):
        assert "PDF本文" in prompt
        return "PDF要約", "test-model"

    monkeypatch.setattr(main_module, "generate", fake_generate)
    monkeypatch.setattr(main_module.materials, "extract_text_from_pdf", lambda data: "PDF本文")

    r = client.post(
        "/api/v1/tools/summarize-material",
        files={"file": ("doc.pdf", b"%PDF-fake", "application/pdf")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["summary"] == "PDF要約"
