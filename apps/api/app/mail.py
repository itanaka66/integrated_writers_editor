"""Minimal outbound-email sending for the "forgot password" flow.

Stdlib-only (smtplib + email.message.EmailMessage) — no new dependency, in
the same spirit as editor_common.passwords/session_tokens. There is no
mail-sending module anywhere else in this codebase to build on, so this is
deliberately small: one function, synchronous (run it in a thread if it
ever needs to not block an event loop; the password-reset endpoint's own
work is already tiny so this hasn't been necessary yet).
"""
import logging
import smtplib
from email.message import EmailMessage

from .config import settings

logger = logging.getLogger(__name__)


def send_mail(to_address: str, subject: str, body: str) -> bool:
    """Sends a plain-text email via the configured SMTP server.

    Returns True on success, False on any failure or missing configuration
    (logged, never raised) — callers that must not leak whether an email
    exists (see the password-reset request endpoint) rely on this never
    raising so the HTTP response stays identical either way.
    """
    if not settings.smtp_host:
        logger.warning('SMTP is not configured (SMTP_HOST unset); skipping sending email to %s', to_address)
        return False
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = settings.smtp_from or settings.smtp_username or 'no-reply@localhost'
    msg['To'] = to_address
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(msg)
        return True
    except Exception:
        logger.exception('Failed to send email to %s', to_address)
        return False
