from editor_common import ollama as _common_ollama
from .runtime_config import get_effective_config

# Passed as Ollama's "options" on every generation call (not embeddings —
# these are generation-sampling knobs, meaningless for /api/embed). num_ctx
# and num_predict are large enough for long-form article writing/editing;
# temperature/top_p/repeat_penalty are Ollama's own defaults made explicit
# so behavior doesn't silently drift if Ollama's own defaults ever change.
GENERATION_OPTIONS = {
    'num_ctx': 65536,
    'num_predict': 32768,
    'temperature': 0.7,
    'top_p': 0.9,
    'repeat_penalty': 1.1,
}


async def generate(prompt, model=None, url=None, timeout=240):
    cfg = get_effective_config()
    return await _common_ollama.generate(prompt, model or cfg.ollama_model, url or cfg.ollama_url, timeout, options=GENERATION_OPTIONS)


async def generate_with_usage(prompt, model=None, url=None, timeout=240):
    """Same as generate(), but also returns Ollama's own token counts
    (prompt_eval_count/eval_count) so callers can log usage — see usage.py."""
    cfg = get_effective_config()
    return await _common_ollama.generate_with_usage(prompt, model or cfg.ollama_model, url or cfg.ollama_url, timeout, options=GENERATION_OPTIONS)


async def stream_generate(prompt, model=None, url=None, timeout=240):
    """Yields response text deltas as they arrive, then a final usage dict."""
    cfg = get_effective_config()
    async for chunk in _common_ollama.stream_generate(prompt, model or cfg.ollama_model, url or cfg.ollama_url, timeout, options=GENERATION_OPTIONS):
        yield chunk


async def embed(texts):
    cfg = get_effective_config()
    return await _common_ollama.embed(texts, cfg.ollama_embed_model, cfg.ollama_url)
