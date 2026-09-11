"""Records one row per AI generation call for the 設定 → 使用状況 screen.

Kept out of providers.py's request path on purpose: a logging failure here
must never break AI generation, so this opens its own short-lived session
(same reasoning as runtime_config.get_effective_config) and swallows its
own errors.
"""
import logging

from .db import SessionLocal
from .models import AiUsageLog
from .pricing import estimate_cost

logger = logging.getLogger(__name__)


def log_usage(project_id: int | None, provider: str, model: str, input_tokens: int | None, output_tokens: int | None) -> None:
    try:
        cost = estimate_cost(provider, model, input_tokens, output_tokens)
        db = SessionLocal()
        try:
            db.add(AiUsageLog(
                project_id=project_id, provider=provider, model=model or '',
                input_tokens=input_tokens, output_tokens=output_tokens,
                estimated_cost_usd=cost,
            ))
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception('Failed to record AI usage (provider=%s, model=%s)', provider, model)
