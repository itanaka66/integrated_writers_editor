"""Dispatches text generation to whichever AI backend is configured
(Ollama/local, Anthropic Claude, OpenAI ChatGPT, or Google Gemini).

Everything else in the app (main.py's /ai/generate and chat routes,
materials.py's summarizer) calls the single `generate(prompt)` / streaming
`generate_stream(prompt)` here instead of talking to a vendor directly —
the effective provider and its API key are resolved fresh on every call via
`get_effective_config()`, so switching providers in 設定 → AIプロバイダー
takes effect on the next request with no restart. Embeddings (RAG
indexing/search) are unaffected: they always go through Ollama (see
rag.py / ollama.embed), independent of this setting.

Every completed call — streamed or not — is logged via usage.log_usage()
so 設定 → 使用状況 can show token counts and an estimated cost per
provider/model. Logging failures never break generation (see usage.py).

Each vendor call is a plain httpx POST — no vendor SDK dependency — mirroring
the retry-free-but-timeout-bounded style already used for embeddings; the
richer retry-on-transient-failure behavior stays specific to ollama.py since
that's the only backend a self-hosted deployment depends on for uptime.
"""
import json

import httpx

from .ollama import generate_with_usage as _ollama_generate_with_usage, stream_generate as _ollama_stream_generate
from .runtime_config import get_effective_config
from .usage import log_usage

TIMEOUT = 240


class ProviderError(Exception):
    pass


# ---- non-streaming ---------------------------------------------------

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
    usage = data.get('usage', {})
    return text, cfg.anthropic_model, {'input_tokens': usage.get('input_tokens'), 'output_tokens': usage.get('output_tokens')}


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
    usage = data.get('usage', {})
    return text, cfg.openai_model, {'input_tokens': usage.get('prompt_tokens'), 'output_tokens': usage.get('completion_tokens')}


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
    usage = data.get('usageMetadata', {})
    return text, cfg.google_model, {'input_tokens': usage.get('promptTokenCount'), 'output_tokens': usage.get('candidatesTokenCount')}


async def generate(prompt, project_id: int | None = None):
    cfg = get_effective_config()
    provider = cfg.ai_provider or 'ollama'
    if provider == 'anthropic':
        text, model, usage = await _anthropic_generate(prompt, cfg)
    elif provider == 'openai':
        text, model, usage = await _openai_generate(prompt, cfg)
    elif provider == 'google':
        text, model, usage = await _google_generate(prompt, cfg)
    else:
        provider = 'ollama'
        text, model, usage = await _ollama_generate_with_usage(prompt)
    log_usage(project_id, provider, model, usage.get('input_tokens'), usage.get('output_tokens'))
    return text, model


# ---- streaming ---------------------------------------------------------
# Each generator yields {'delta': str} chunks as text arrives, and exactly
# one final {'done': True, 'model': str} once the vendor's stream ends —
# usage is logged internally at that point, not exposed to the caller.

async def _stream_anthropic(prompt, cfg, project_id):
    if not cfg.anthropic_api_key:
        raise ProviderError('Anthropic APIキーが設定されていません。設定画面から登録してください。')
    usage = {'input_tokens': None, 'output_tokens': None}
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        async with c.stream(
            'POST', 'https://api.anthropic.com/v1/messages',
            headers={'x-api-key': cfg.anthropic_api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': cfg.anthropic_model, 'max_tokens': 4096, 'stream': True, 'messages': [{'role': 'user', 'content': prompt}]},
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith('data: '):
                    continue
                event = json.loads(line[6:])
                t = event.get('type')
                if t == 'content_block_delta':
                    text = event.get('delta', {}).get('text', '')
                    if text:
                        yield {'delta': text}
                elif t == 'message_start':
                    usage['input_tokens'] = event.get('message', {}).get('usage', {}).get('input_tokens')
                elif t == 'message_delta':
                    out = event.get('usage', {}).get('output_tokens')
                    if out is not None:
                        usage['output_tokens'] = out
    log_usage(project_id, 'anthropic', cfg.anthropic_model, usage['input_tokens'], usage['output_tokens'])
    yield {'done': True, 'model': cfg.anthropic_model}


async def _stream_openai(prompt, cfg, project_id):
    if not cfg.openai_api_key:
        raise ProviderError('OpenAI APIキーが設定されていません。設定画面から登録してください。')
    usage = {'input_tokens': None, 'output_tokens': None}
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        async with c.stream(
            'POST', 'https://api.openai.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {cfg.openai_api_key}', 'content-type': 'application/json'},
            json={'model': cfg.openai_model, 'stream': True, 'stream_options': {'include_usage': True}, 'messages': [{'role': 'user', 'content': prompt}]},
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith('data: '):
                    continue
                payload = line[6:]
                if payload == '[DONE]':
                    break
                chunk = json.loads(payload)
                choices = chunk.get('choices') or []
                if choices:
                    text = choices[0].get('delta', {}).get('content', '')
                    if text:
                        yield {'delta': text}
                if chunk.get('usage'):
                    usage['input_tokens'] = chunk['usage'].get('prompt_tokens')
                    usage['output_tokens'] = chunk['usage'].get('completion_tokens')
    log_usage(project_id, 'openai', cfg.openai_model, usage['input_tokens'], usage['output_tokens'])
    yield {'done': True, 'model': cfg.openai_model}


async def _stream_google(prompt, cfg, project_id):
    if not cfg.google_api_key:
        raise ProviderError('Google APIキーが設定されていません。設定画面から登録してください。')
    usage = {'input_tokens': None, 'output_tokens': None}
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        async with c.stream(
            'POST', f'https://generativelanguage.googleapis.com/v1beta/models/{cfg.google_model}:streamGenerateContent',
            params={'key': cfg.google_api_key, 'alt': 'sse'},
            json={'contents': [{'parts': [{'text': prompt}]}]},
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith('data: '):
                    continue
                chunk = json.loads(line[6:])
                candidates = chunk.get('candidates') or []
                if candidates:
                    parts = candidates[0].get('content', {}).get('parts', [])
                    text = ''.join(p.get('text', '') for p in parts)
                    if text:
                        yield {'delta': text}
                meta = chunk.get('usageMetadata')
                if meta:
                    usage['input_tokens'] = meta.get('promptTokenCount')
                    usage['output_tokens'] = meta.get('candidatesTokenCount')
    log_usage(project_id, 'google', cfg.google_model, usage['input_tokens'], usage['output_tokens'])
    yield {'done': True, 'model': cfg.google_model}


async def _stream_ollama(prompt, cfg, project_id):
    model = None
    async for event in _ollama_stream_generate(prompt):
        if event.get('done'):
            model = event.get('model')
            u = event.get('usage', {})
            log_usage(project_id, 'ollama', model, u.get('input_tokens'), u.get('output_tokens'))
            yield {'done': True, 'model': model}
        else:
            yield event


async def generate_stream(prompt, project_id: int | None = None):
    cfg = get_effective_config()
    provider = cfg.ai_provider or 'ollama'
    if provider == 'anthropic':
        async for event in _stream_anthropic(prompt, cfg, project_id):
            yield event
    elif provider == 'openai':
        async for event in _stream_openai(prompt, cfg, project_id):
            yield event
    elif provider == 'google':
        async for event in _stream_google(prompt, cfg, project_id):
            yield event
    else:
        async for event in _stream_ollama(prompt, cfg, project_id):
            yield event
