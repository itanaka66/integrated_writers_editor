# Integrated writers Editor (INE) — DB Migrations

This app's database schema is owned by [Alembic](https://alembic.sqlalchemy.org/).
Migration scripts live in [`apps/api/alembic/versions/`](apps/api/alembic/versions/).

Applying the schema **is automatic** on container startup: `apps/api/Dockerfile`'s `CMD` is
`alembic upgrade head && uvicorn app.main:app ...` — every time the `api` container starts
(including a plain restart, not just a rebuild), it runs pending migrations before the
server comes up. `apps/api/app/main.py`'s own startup hook is a separate, later step that
only seeds demo data / bootstrap accounts — it does not run migrations itself, but by the
time it runs, migrations already have.

**Do not also run `alembic upgrade head` yourself against a container that's starting or
about to start** — two invocations racing (the automatic one in `CMD`, plus a manual one)
can interleave against the same database and leave a migration half-applied: one process's
`ADD COLUMN` commits, then the other's identical `ADD COLUMN` fails with
`DuplicateColumn`, crash-looping the container indefinitely since every restart re-runs the
same broken migration attempt. If you hit this, see "Recovering from a stuck migration"
below rather than restarting repeatedly.

## Running a migration

Normally nothing beyond a routine deploy is needed — pulling a new `main` with a new file
under `apps/api/alembic/versions/` and restarting/rebuilding the `api` container is enough,
since `CMD` runs `alembic upgrade head` automatically:

```bash
cd ~/integrated_writers_editor
git pull origin main
docker compose -f docker-compose.release.yml up -d --build --no-deps api
```

Using the build-from-source compose file, swap `docker-compose.release.yml` for
`docker-compose.yml`. Only reach for a manual `alembic` invocation (verifying state,
rolling back, or recovering below) when the container is **not** concurrently starting —
use `docker compose run --rm api <command>` (a one-off container, doesn't touch the
running/restarting one) rather than `exec` if you're not certain the main container is up
and idle.

### Verifying it applied

If the `api` container is up and healthy, `exec` works fine:

```bash
docker compose -f docker-compose.release.yml exec api alembic current
```

If it's crash-looping (see below), use a one-off container instead — `exec` requires a
running container, which a crash-looping one isn't:

```bash
docker compose -f docker-compose.release.yml run --rm api alembic current
```

The printed revision id should match the newest file's `revision = '...'` value in
`apps/api/alembic/versions/`, with `(head)` next to it.

### Rolling back one migration

Only if something goes wrong and you need to undo the most recent migration:

```bash
docker compose -f docker-compose.release.yml run --rm api alembic downgrade -1
```

### Recovering from a stuck migration

If `docker compose ... ps` shows no `api` container (or it's stuck restarting) and its logs
show a DDL error like `DuplicateColumn`/`UndefinedColumn` from Alembic, the most likely
cause is exactly the race described above: a migration applied *some* of its statements
(they succeeded and committed) before failing, so the database is left partway between two
revisions while `alembic_version` still points at the older one — every automatic retry via
`CMD` re-attempts the same statements from the top and hits the ones that already
succeeded.

1. Compare what the migration file's `upgrade()` says it does against what's actually in
   the database, using a one-off container (never `exec` here — the real container isn't
   running):

   ```bash
   docker compose -f docker-compose.release.yml run --rm api python -c "
   from sqlalchemy import create_engine, text
   from app.config import settings
   e = create_engine(settings.database_url)
   with e.connect() as c:
       print(c.execute(text(\"select column_name, is_nullable from information_schema.columns where table_name='<table>'\")).fetchall())
       print(c.execute(text(\"select indexname from pg_indexes where tablename='<table>'\")).fetchall())
       print(c.execute(text('select version_num from alembic_version')).fetchall())
   "
   ```
2. Manually run whichever of the migration's statements are missing (copy them straight out
   of the migration file's `upgrade()`), wrapped in one transaction:

   ```bash
   docker compose -f docker-compose.release.yml run --rm api python -c "
   from sqlalchemy import create_engine, text
   from app.config import settings
   e = create_engine(settings.database_url)
   with e.begin() as c:
       c.execute(text('...the missing statement(s) here...'))
   "
   ```
3. Once the database actually matches what `upgrade()` describes, tell Alembic it's done
   *without* re-running it — `stamp` only writes the version row, it executes no DDL:

   ```bash
   docker compose -f docker-compose.release.yml run --rm api alembic stamp head
   ```
4. Start the container normally — `CMD`'s `alembic upgrade head` is now a no-op since
   `alembic_version` already matches head:

   ```bash
   docker compose -f docker-compose.release.yml up -d api
   ```

## Writing a new migration

1. Add a new file under `apps/api/alembic/versions/`, following the existing ones as a
   template (`script.py.mako` has the skeleton). Give it a fresh `revision` id and set
   `down_revision` to whatever the current head is (`alembic heads`, run from
   `apps/api/`).
2. Implement both `upgrade()` and `downgrade()`.
3. Keep `apps/api/app/models.py` in sync — the migration changes the actual DB schema, the
   model changes what SQLAlchemy expects to find there. They can drift silently (SQLite,
   used by the test suite, is more forgiving about missing columns than Postgres — see
   the note below), so double-check both were updated together.
4. Verify with a throwaway Postgres before merging:

   ```bash
   cd apps/api
   docker run --rm -d --name ine-migration-check -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17-alpine
   DATABASE_URL=postgresql+psycopg2://postgres:test@localhost:55432/postgres alembic upgrade head
   DATABASE_URL=postgresql+psycopg2://postgres:test@localhost:55432/postgres alembic downgrade -1
   DATABASE_URL=postgresql+psycopg2://postgres:test@localhost:55432/postgres alembic upgrade head
   docker stop ine-migration-check
   ```

## Why this matters: schema drift with `editor_common`

`apps/api/app/models.py`'s `User` model inherits most of its columns from
`editor_common.users.UserMixin`, a class defined in the separate
[editor-common-module](https://github.com/itanaka66/editor-common-module) package (pulled
in via `git+https://...@main` in `requirements.txt`). When that shared library adds a
column to `UserMixin` (e.g. `email`, added alongside OAuth2 login support), **this repo's
own migration history does not update automatically** — someone has to notice and add a
matching migration here (see `c8f3a2e1b4d7_users_email_and_nullable_password.py` for an
example: it added the `email` column and relaxed `password_hash` to nullable after
`editor_common` changed shape upstream).

Until that follow-up migration is written and applied, any query touching the drifted
table fails against a real Postgres database with an error like:

```
psycopg2.errors.UndefinedColumn: column users.email does not exist
```

...even though the Python-level model and the tests (which use an in-memory SQLite
database created fresh from the current models, not from replaying migrations) look
correct. **The test suite passing is not proof the migrations are up to date** — always
check `alembic heads` reflects a real fix any time `editor_common`'s shared models change,
and add a migration here if it doesn't.
