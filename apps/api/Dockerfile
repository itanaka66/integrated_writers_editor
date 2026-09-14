FROM python:3.13-slim

WORKDIR /app

# postgresql-client provides pg_dump, used by app/backup.py's scheduled and
# on-demand database backups (runs against the `db` service over the
# network, so only the client — not the server — is needed here). git is
# required by pip to install requirements.txt's editor-common dependency,
# a git+https VCS requirement (see that file) — pip cannot fetch it
# without the git binary on PATH.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client git \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
