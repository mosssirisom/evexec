#!/usr/bin/env bash
# Called by scripts/db-test.sh. Starts a temporary Postgres in $DB_TEST_WORK,
# loads the baseline, runs the tests, then deletes everything.
set -euo pipefail

W="$DB_TEST_WORK"
PORT="${DB_TEST_PORT:-54329}"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$W/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$W"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$W/data" -U postgres -A trust --locale=C.UTF-8 >/dev/null
"$PG_BIN/pg_ctl" -D "$W/data" -w -l "$W/pg.log" \
  -o "-c listen_addresses='' -c unix_socket_directories='$W' -p $PORT" start >/dev/null

run() { "$PG_BIN/psql" -h "$W" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "Loading stand-ins and baseline..."
run -f "$W/baseline/local_stubs.sql" >/dev/null
run -f "$W/baseline/schema.sql" >/dev/null

if [ "${DB_TEST_FINGERPRINT:-}" = "1" ]; then
  echo "Baseline fingerprint (compare with the same query on live):"
  run -A -F ' ' -t -f "$W/baseline/fingerprint.sql"
fi

status=0
for t in "$W"/tests/*.test.sql; do
  echo "Running $(basename "$t")"
  out="$(run -A -t -f "$t" 2>&1)" || { echo "$out" | tail -20; echo "FAILED: the test file stopped with an error."; status=1; continue; }
  passed=$(printf '%s\n' "$out" | grep -c '^ok ' || true)
  failed=$(printf '%s\n' "$out" | grep -c '^not ok ' || true)
  if [ "$failed" != "0" ] || printf '%s\n' "$out" | grep -q 'Looks like'; then
    printf '%s\n' "$out" | grep -A6 '^not ok ' || true
    printf '%s\n' "$out" | grep 'Looks like' || true
    status=1
  fi
  echo "  passed: $passed  failed: $failed"
  [ "$passed" = "0" ] && { echo "FAILED: no checks ran."; status=1; }
done
exit $status
