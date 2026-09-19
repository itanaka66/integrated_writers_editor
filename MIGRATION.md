# Integrated writers Editor (INE) — DB Migrations

This app's database schema is owned by [Alembic](https://alembic.sqlalchemy.org/).
Migration scripts live in [`apps/api/alembic/versions/`](apps/api/alembic/versions/).

Applying the schema is **not automatic** on container startup — `apps/api/app/main.py`'s
startup hook only seeds demo data / bootstrap accounts, it never runs migrations. You must
run `alembic upgrade head` yourself after every deploy that includes a new migration file.

## Running a migration

Run this after pulling a new `main` that includes new files under
`apps/api/alembic/versions/`, and after rebuilding/restarting the `api` container so it's
running the new code (a migration only adds *columns/tables* — it doesn't change what code
is loaded).

Using the prebuilt-image compose file:

```bash
cd ~/integrated_writers_editor
git pull origin main
docker compose -f docker-compose.release.yml up -d --build --no-deps api
docker compose -f docker-compose.release.yml exec api alembic upgrade head
```

Using the build-from-source compose file, swap `docker-compose.release.yml` for
`docker-compose.yml` in the commands above.

### Verifying it applied

```bash
docker compose -f docker-compose.release.yml exec api alembic current
```

The printed revision id should match the newest file's `revision = '...'` value in
`apps/api/alembic/versions/`, with `(head)` next to it.

### Rolling back one migration

Only if something goes wrong and you need to undo the most recent migration:

```bash
docker compose -f docker-compose.release.yml exec api alembic downgrade -1
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
