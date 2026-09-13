from editor_common import ollama as _common_ollama
from .runtime_config import get_effective_config


async def generate(prompt, model=None, url=None, timeout=240):
    cfg = get_effective_config()
    return await _common_ollama.generate(prompt, model or cfg.ollama_model, url or cfg.ollama_url, timeout)


async def generate_with_usage(prompt, model=None, url=None, timeout=240):
    """Same as generate(), but also returns Ollama's own token counts
    (prompt_eval_count/eval_count) so callers can log usage — see usage.py."""
    cfg = get_effective_config()
    return await _common_ollama.generate_with_usage(prompt, model or cfg.ollama_model, url or cfg.ollama_url, timeout)


async def stream_generate(prompt, model=None, url=None, timeout=240):
    """Yields response text deltas as they arrive, then a final usage dict."""
    cfg = get_effective_config()
    async for chunk in _common_ollama.stream_generate(prompt, model or cfg.ollama_model, url or cfg.ollama_url, timeout):
        yield chunk


async def embed(texts):
    cfg = get_effective_config()
    return await _common_ollama.embed(texts, cfg.ollama_embed_model, cfg.ollama_url)
