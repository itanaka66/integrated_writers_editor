"""Rough, hand-maintained per-model pricing used only to show an estimated
cost next to recorded token usage (設定 → 使用状況). These are illustrative
list-price snapshots, not billing-accurate — vendors change pricing
independently of this app, so treat the numbers here as "ballpark", not
"invoice". A model missing from this table returns an unknown (None) cost
rather than a wrong number; Ollama is always free (self-hosted).
"""

# USD per 1,000 tokens: (input_rate, output_rate)
PRICING: dict[tuple[str, str], tuple[float, float]] = {
    ('anthropic', 'claude-sonnet-4-5'): (0.003, 0.015),
    ('anthropic', 'claude-opus-4-1'): (0.015, 0.075),
    ('anthropic', 'claude-haiku-4-5'): (0.0008, 0.004),
    ('openai', 'gpt-4o'): (0.0025, 0.01),
    ('openai', 'gpt-4o-mini'): (0.00015, 0.0006),
    ('openai', 'gpt-4.1'): (0.002, 0.008),
    ('openai', 'gpt-4.1-mini'): (0.0004, 0.0016),
    ('google', 'gemini-2.0-flash'): (0.0001, 0.0004),
    ('google', 'gemini-1.5-pro'): (0.00125, 0.005),
}


def estimate_cost(provider: str, model: str, input_tokens: int | None, output_tokens: int | None) -> float | None:
    if provider == 'ollama':
        return 0.0
    if input_tokens is None or output_tokens is None:
        return None
    rate = PRICING.get((provider, model))
    if not rate:
        return None
    in_rate, out_rate = rate
    return round(input_tokens / 1000 * in_rate + output_tokens / 1000 * out_rate, 6)
