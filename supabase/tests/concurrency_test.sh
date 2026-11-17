#!/usr/bin/env bash
# שתי השאלות מקבילות לאותו ספר: בדיוק אחת צריכה להצליח. מריצים אחרי scripts/test-db.sh.
set -uo pipefail
DB="${1:-hasifriya_test}"
PSQL="${PSQL:-psql}"
SETUP="select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='admin@test.local'),'role','authenticated')::text, false);"
$PSQL -d "$DB" -qAt -c "insert into public.books (id,title) values ('00000000-0000-0000-0000-0000000000d1','מקביליות') on conflict do nothing"
run() {
  $PSQL -d "$DB" -qAt -v ON_ERROR_STOP=1 -c "$SETUP" -c "begin; set local role authenticated; select (public.create_loan('00000000-0000-0000-0000-0000000000d1','$1')).id; select pg_sleep(1); commit;" >/dev/null 2>"$2"
  echo $? > "$2.code"
}
T=$(mktemp -d)
run 00000000-0000-0000-0000-0000000000c1 "$T/a" &
run 00000000-0000-0000-0000-0000000000c2 "$T/b" &
wait
OKS=$(grep -lx 0 "$T"/a.code "$T"/b.code | wc -l)
ACTIVE=$($PSQL -d "$DB" -qAt -c "select count(*) from public.loans where book_id='00000000-0000-0000-0000-0000000000d1' and returned_at is null")
cat "$T"/a "$T"/b | grep -o 'BOOK_ALREADY_LOANED' | head -1
if [ "$OKS" = "1" ] && [ "$ACTIVE" = "1" ]; then echo "ok - parallel loans: exactly one succeeded, one active loan"; else echo "FAILED: successes=$OKS active=$ACTIVE"; exit 1; fi
