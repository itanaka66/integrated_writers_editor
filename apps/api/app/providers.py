"""Dispatches text generation to whichever AI backend is configured
(Ollama/local, Anthropic Claude, OpenAI ChatGPT, or Google Gemini).

Everything else in the app (main.py's /ai/generate and chat routes,
materials.py's summarizer) calls the single `generate(prompt)` here instead
of talking to a vendor directly — the effective provider and its API key
are resolved fresh on every call via `get_effective_config()`, so switching
providers in 設定 → AIプロバイダー takes effect on the next request with no
restart. Embeddings (RAG indexing/search) are unaffected: they always go
through Ollama (see rag.py / ollama.embed), independent of this setting.

Each vendor call is a plain httpx POST — no vendor SDK dependency — mirroring
the retry-free-but-timeout-bounded style already used for embeddings; the
richer retry-on-transient-failure behavior stays specific to ollama.py since
that's the only backend a self-hosted deployment depends on for uptime.
"""
import httpx

from .ollama import generate as _ollama_generate
from .runtime_config import get_effective_config

TIMEOUT = 240


class ProviderError(Exception):
    pass


async def _anthropic_generate(prompt, cfg):
    if not cfg.anthropic_api_key:
        raise ProviderError('Anthropic APIキーが設定されていません。設定画面から登録してください。')
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.post(
            'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': cfg.anthropic_api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': cfg.anthropic_model, 'max_tokens': 4096, 'messages': [{'role': 'user', 'content': prompt}]},
        )
        r.raise_for_status()
        data = r.json()
    text = ''.join(b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text')
    return text, cfg.anthropic_model


async def _openai_generate(prompt, cfg):
    if not cfg.openai_api_key:
        raise ProviderError('OpenAI APIキーが設定されていません。設定画面から登録してください。')
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.post(
            'https://api.openai.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {cfg.openai_api_key}', 'content-type': 'application/json'},
            json={'model': cfg.openai_model, 'messages': [{'role': 'user', 'content': prompt}]},
        )
        r.raise_for_status()
        data = r.json()
    text = data.get('choices', [{}])[0].get('message', {}).get('content', '')
    return text, cfg.openai_model


async def _google_generate(prompt, cfg):
    if not cfg.google_api_key:
        raise ProviderError('Google APIキーが設定されていません。設定画面から登録してください。')
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/{cfg.google_model}:generateContent',
            params={'key': cfg.google_api_key},
            json={'contents': [{'parts': [{'text': prompt}]}]},
        )
        r.raise_for_status()
        data = r.json()
    candidates = data.get('candidates', [])
    parts = candidates[0].get('content', {}).get('parts', []) if candidates else []
    text = ''.join(p.get('text', '') for p in parts)
    return text, cfg.google_model


async def generate(prompt):
    cfg = get_effective_config()
    provider = cfg.ai_provider or 'ollama'
    if provider == 'anthropic':
        return await _anthropic_generate(prompt, cfg)
    if provider == 'openai':
        return await _openai_generate(prompt, cfg)
    if provider == 'google':
        return await _google_generate(prompt, cfg)
    return await _ollama_generate(prompt)
