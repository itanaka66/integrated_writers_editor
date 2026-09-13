#!/bin/sh
# Next.js inlines NEXT_PUBLIC_* env vars into the client bundle at `next
# build` time — the `environment:` block in docker-compose.yml setting
# NEXT_PUBLIC_API_URL at container *start* time has no effect on an
# already-built image, silently. That's invisible for local dev (the
# baked-in fallback happens to be the same http://localhost:8000/api/v1
# every docker-compose default uses), but breaks completely for anyone
# accessing the app from another machine (a LAN IP, a cloud VM's public
# address) — "localhost" in the browser always means the *visitor's own*
# computer, not the server.
#
# Fix: the Dockerfile bakes in a placeholder instead of a real URL, and
# this entrypoint substitutes it for the actual runtime value in the built
# output before starting the server — so one image works at any address
# without a rebuild. Only takes effect on a fresh container (or one
# recreated by `docker compose up` after an env change); restarting the
# same container with a new value won't re-substitute, since the
# placeholder is already gone after the first run.
set -e

: "${NEXT_PUBLIC_API_URL:=http://localhost:8000/api/v1}"

grep -rl '__RUNTIME_NEXT_PUBLIC_API_URL__' .next/ 2>/dev/null | while IFS= read -r f; do
  sed -i "s|__RUNTIME_NEXT_PUBLIC_API_URL__|$NEXT_PUBLIC_API_URL|g" "$f"
done

exec "$@"
