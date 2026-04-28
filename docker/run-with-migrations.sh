#!/bin/sh
set -eu

case "${RUN_DATABASE_MIGRATIONS:-true}" in
  true | 1 | yes)
    echo "Applying database migrations..."
    bun run --cwd /app/packages/db db:deploy
    ;;
  false | 0 | no)
    echo "Skipping database migrations."
    ;;
  *)
    echo "RUN_DATABASE_MIGRATIONS must be true or false." >&2
    exit 1
    ;;
esac

exec "$@"
