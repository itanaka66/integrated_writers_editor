import asyncio

import pytest

from app import providers
from app.providers import ProviderError
from app.runtime_config import EffectiveConfig


def _cfg(**overrides):
    base = dict(
        qdrant_url="http://qdrant:6333",
        ollama_url="http://ollama:11434",
        ollama_model="stub-writer-model",
        ollama_embed_model="stub-embed-model",
        controller_ollama_url="http://ollama:11434",
        controller_ollama_model="stub-controller-model",
    )
    base.update(overrides)
    return EffectiveConfig(**base)


def test_generate_dispatches_to_ollama_by_default(monkeypatch):
    async def fake_ollama_generate(prompt):
        return f"ollama:{prompt}", "stub-writer-model"

    monkeypatch.setattr(providers, "get_effective_config", lambda: _cfg(ai_provider="ollama"))
    monkeypatch.setattr(providers, "_ollama_generate", fake_ollama_generate)

    text, model = asyncio.run(providers.generate("hi"))
    assert text == "ollama:hi"
    assert model == "stub-writer-model"


def test_generate_dispatches_to_anthropic(monkeypatch):
    async def fake_anthropic(prompt, cfg):
        assert prompt == "hi"
        return "claude reply", cfg.anthropic_model

    monkeypatch.setattr(providers, "get_effective_config", lambda: _cfg(ai_provider="anthropic", anthropic_api_key="key", anthropic_model="claude-x"))
    monkeypatch.setattr(providers, "_anthropic_generate", fake_anthropic)

    text, model = asyncio.run(providers.generate("hi"))
    assert text == "claude reply"
    assert model == "claude-x"


def test_generate_dispatches_to_openai(monkeypatch):
    async def fake_openai(prompt, cfg):
        return "gpt reply", cfg.openai_model

    monkeypatch.setattr(providers, "get_effective_config", lambda: _cfg(ai_provider="openai", openai_api_key="key", openai_model="gpt-x"))
    monkeypatch.setattr(providers, "_openai_generate", fake_openai)

    text, model = asyncio.run(providers.generate("hi"))
    assert text == "gpt reply"
    assert model == "gpt-x"


def test_generate_dispatches_to_google(monkeypatch):
    async def fake_google(prompt, cfg):
        return "gemini reply", cfg.google_model

    monkeypatch.setattr(providers, "get_effective_config", lambda: _cfg(ai_provider="google", google_api_key="key", google_model="gemini-x"))
    monkeypatch.setattr(providers, "_google_generate", fake_google)

    text, model = asyncio.run(providers.generate("hi"))
    assert text == "gemini reply"
    assert model == "gemini-x"


def test_anthropic_generate_without_api_key_raises_provider_error():
    cfg = _cfg(ai_provider="anthropic", anthropic_api_key="", anthropic_model="claude-x")
    with pytest.raises(ProviderError):
        asyncio.run(providers._anthropic_generate("hi", cfg))


def test_openai_generate_without_api_key_raises_provider_error():
    cfg = _cfg(ai_provider="openai", openai_api_key="", openai_model="gpt-x")
    with pytest.raises(ProviderError):
        asyncio.run(providers._openai_generate("hi", cfg))


def test_google_generate_without_api_key_raises_provider_error():
    cfg = _cfg(ai_provider="google", google_api_key="", google_model="gemini-x")
    with pytest.raises(ProviderError):
        asyncio.run(providers._google_generate("hi", cfg))
