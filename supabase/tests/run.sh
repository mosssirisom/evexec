#!/usr/bin/env bash
# Database regression tests for the security fixes, run against a throwaway
# LOCAL PostgreSQL (never production). Each run creates a fresh database,
# loads baseline.sql (a copy of the relevant live schema, 15/10/2026),
# applies the migrations listed below, then runs every *.test.sql file. Each
# test file runs in one transaction that is rolled back.
#
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres supabase/tests/run.sh
#   supabase/tests/run.sh --baseline-only   # without the fixes: tests should FAIL
set -uo pipefail
cd "$(dirname "$0")"
MIGRATIONS_DIR=../migrations
MIGRATIONS=(
  20261015030000_office_push_staff_only.sql
  20261015031000_driver_alert_webhook_secret.sql
  20261015032000_driver_write_guard.sql
  20261015033000_driver_payment_guard.sql
)
DB="evx_test_$$"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}" PGUSER="${PGUSER:-postgres}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

createdb "$DB" || exit 2
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT
"${PSQL[@]}" -f baseline.sql >/dev/null || { echo "baseline failed"; exit 2; }
if [[ "${1:-}" != "--baseline-only" ]]; then
  for m in "${MIGRATIONS[@]}"; do
    [[ -f "$MIGRATIONS_DIR/$m" ]] || { echo "skip (not written yet): $m"; continue; }
    "${PSQL[@]}" -f "$MIGRATIONS_DIR/$m" >/dev/null || { echo "migration failed: $m"; exit 2; }
    echo "applied $m"
  done
fi
"${PSQL[@]}" -f helpers.sql >/dev/null || { echo "helpers failed"; exit 2; }

pass=0; fail=0
for t in *.test.sql; do
  if out=$("${PSQL[@]}" -c 'begin' -f "$t" -c 'rollback' 2>&1); then
    echo "PASS $t ($(grep -c 'ok - ' <<<"$out") checks)"; pass=$((pass+1))
  else
    echo "FAIL $t"; grep -E 'FAIL|ERROR' <<<"$out" | head -3 | sed 's/^/     /'; fail=$((fail+1))
  fi
done
echo "files passed: $pass, failed: $fail"
[[ $fail -eq 0 ]]
