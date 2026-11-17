#!/usr/bin/env bash
# בדיקות מסד נתונים על Postgres מקומי (לא על Supabase).
# שימוש: PSQL="psql -U postgres" scripts/test-db.sh [שם-מסד]
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${1:-hasifriya_test}"
PSQL="${PSQL:-psql}"

$PSQL -d postgres -qc "drop database if exists $DB" -c "create database $DB"
$PSQL -d "$DB" -q -v ON_ERROR_STOP=1 \
  -f supabase/tests/local_bootstrap.sql \
  -f supabase/migrations/20261117000001_schema.sql \
  -f supabase/migrations/20261117000002_functions.sql
if [ "${SKIP_TESTS:-}" != "1" ]; then
  $PSQL -d "$DB" -f supabase/tests/rules_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
fi
