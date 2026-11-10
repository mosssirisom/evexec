#!/usr/bin/env bash
# Run the database tests on a throwaway local Postgres. Nothing touches the live
# project. Needs Postgres 17 with pgTAP (Ubuntu: postgresql-17 and
# postgresql-17-pgtap from apt.postgresql.org).
#
#   scripts/db-test.sh
#
# It starts a temporary database, loads supabase/baseline (stand-ins, then the
# structure of the live database), runs every supabase/tests/database/*.test.sql
# file, and removes the database again. Exit code 0 only if every check passes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ]; then
  for d in /usr/lib/postgresql/17/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin; do
    [ -x "$d/initdb" ] && PG_BIN="$d" && break
  done
fi
if [ -z "$PG_BIN" ] || [ ! -x "$PG_BIN/initdb" ]; then
  echo "Postgres 17 not found. Install it, or set PG_BIN to its bin directory." >&2
  exit 2
fi

WORK="$(mktemp -d)"
cp -r "$ROOT/supabase/baseline" "$WORK/baseline"
cp -r "$ROOT/supabase/tests/database" "$WORK/tests"
chmod -R a+rX "$WORK"

# Postgres will not run as root: hand over to the postgres user when we are root.
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"
  exec runuser -u postgres -- env PG_BIN="$PG_BIN" DB_TEST_WORK="$WORK" bash "$WORK/baseline/run-in-temp-db.sh"
fi
exec env PG_BIN="$PG_BIN" DB_TEST_WORK="$WORK" bash "$WORK/baseline/run-in-temp-db.sh"
