from urllib.parse import urlparse

from editor_common import ollama as _common_ollama
from .runtime_config import get_effective_config

# Two physical Ollama hosts are in play, with very different VRAM budgets —
# the RTX3090 box can handle a much larger context/prediction window than
# the A770 one, so options are only pushed up for the host that can afford
# it. The A770 host gets no "options" at all (None), i.e. Ollama's own
# built-in defaults, rather than guessing a smaller-but-still-explicit set.
RTX3090_HOST = '192.168.0.180'
GENERATION_OPTIONS_RTX3090 = {
    'num_ctx': 65536,
    'num_predict': 32768,
    'temperature': 0.7,
    'top_p': 0.9,
    'repeat_penalty': 1.1,
}


def _generation_options(url):
    return GENERATION_OPTIONS_RTX3090 if urlparse(url).hostname == RTX3090_HOST else None


async def generate(prompt, model=None, url=None, timeout=240):
    cfg = get_effective_config()
    resolved_url = url or cfg.ollama_url
    return await _common_ollama.generate(prompt, model or cfg.ollama_model, resolved_url, timeout, options=_generation_options(resolved_url))


async def generate_with_usage(prompt, model=None, url=None, timeout=240):
    """Same as generate(), but also returns Ollama's own token counts
    (prompt_eval_count/eval_count) so callers can log usage — see usage.py."""
    cfg = get_effective_config()
    resolved_url = url or cfg.ollama_url
    return await _common_ollama.generate_with_usage(prompt, model or cfg.ollama_model, resolved_url, timeout, options=_generation_options(resolved_url))


async def stream_generate(prompt, model=None, url=None, timeout=240):
    """Yields response text deltas as they arrive, then a final usage dict."""
    cfg = get_effective_config()
    resolved_url = url or cfg.ollama_url
    async for chunk in _common_ollama.stream_generate(prompt, model or cfg.ollama_model, resolved_url, timeout, options=_generation_options(resolved_url)):
        yield chunk


async def embed(texts):
    cfg = get_effective_config()
    return await _common_ollama.embed(texts, cfg.ollama_embed_model, cfg.ollama_url)
