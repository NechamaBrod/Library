-- בדיקות כללי המוצר ברמת המסד. מריצים עם scripts/test-db.sh (Postgres מקומי).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema t;
create or replace function t.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = 'admin@test.local'), 'role', 'authenticated')::text, false);
  set role authenticated;
end $$;
create or replace function t.as_other_user() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = 'other@test.local'), 'role', 'authenticated')::text, false);
  set role authenticated;
end $$;
create or replace function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  set role anon;
end $$;
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;
-- מצפה שהפקודה תיכשל עם הודעה שמכילה את expected
create or replace function t.fails(cmd text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute cmd;
  exception when others then
    if sqlerrm like '%' || expected || '%' then
      raise notice 'ok - % (%)', label, expected;
      return;
    end if;
    raise exception 'FAILED: % — unexpected error: %', label, sqlerrm;
  end;
  raise exception 'FAILED: % — command succeeded', label;
end $$;
grant usage on schema t to anon, authenticated; grant execute on all functions in schema t to anon, authenticated;

reset role;
insert into auth.users (email, password) values ('admin@test.local', 'x'), ('other@test.local', 'x');
insert into public.admins (user_id) select id from auth.users where email = 'admin@test.local';

-- ---------- נתונים ----------
select t.as_admin();
insert into public.books (id, title, author, location) values
  ('00000000-0000-0000-0000-0000000000b1', 'ספר א', 'מחברת א', 'מדף 1'),
  ('00000000-0000-0000-0000-0000000000b2', 'ספר ב', null, null),
  ('00000000-0000-0000-0000-0000000000b3', 'ספר ג', null, null);
insert into public.borrowers (id, name, phone) values
  ('00000000-0000-0000-0000-0000000000c1', 'רחל', '050-1234567'),
  ('00000000-0000-0000-0000-0000000000c2', 'לאה', '+972 52 7654321');
select t.ok((select phone_normalized from public.borrowers where name = 'לאה') = '0527654321', 'phone normalization (+972)');

-- ---------- השאלה והחזרה ----------
select t.ok((select status from public.catalog where title = 'ספר א') = 'available', 'new book is available');
select public.create_loan('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1') \gset loan_
select t.ok((select status from public.catalog where title = 'ספר א') = 'loaned', 'loan makes book loaned');
select t.fails(
  $$select public.create_loan('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2')$$,
  'BOOK_ALREADY_LOANED', 'cannot loan same book twice');
select t.ok((select due_date is null from public.loans where book_id = '00000000-0000-0000-0000-0000000000b1'), 'due date optional');

reset role;
select t.fails(
  $$insert into public.loans (book_id, borrower_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2')$$,
  'loans_one_active_per_book', 'unique index blocks double loan even bypassing functions');
select t.as_admin();
select t.fails(
  $$insert into public.loans (book_id, borrower_id) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c2')$$,
  'permission denied', 'admin cannot insert loans directly');
select t.fails(
  $$update public.books set archived_at = now() where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'BOOK_IN_USE', 'cannot archive a loaned book');

select (public.return_loan(id)).id from public.loans where book_id = '00000000-0000-0000-0000-0000000000b1' \gset
select (public.return_loan(id)).id from public.loans where book_id = '00000000-0000-0000-0000-0000000000b1' \gset
select t.ok((select status from public.catalog where title = 'ספר א') = 'available', 'return frees the book');
select t.ok((select count(*) from public.loans where book_id = '00000000-0000-0000-0000-0000000000b1' and returned_at is not null) = 1, 'history kept, double return is a no-op');

-- ---------- פרטיות: מבקרת אנונימית ----------
select t.as_anon();
select t.ok((select count(*) from public.catalog) = 3, 'anon can read catalog');
select t.ok(not exists (select 1 from information_schema.columns
  where table_name = 'catalog' and column_name in ('location', 'holder_name', 'borrower_id')), 'catalog exposes no location/holder');
select t.fails('select * from public.borrowers', 'permission denied', 'anon cannot read borrowers');
select t.fails('select * from public.loans', 'permission denied', 'anon cannot read loans');
select t.fails('select * from public.reservation_requests', 'permission denied', 'anon cannot read reservation requests');
select t.fails('select * from public.books', 'permission denied', 'anon cannot read books table directly');
select t.fails('select * from public.admin_books', 'permission denied', 'anon cannot read admin view');
select t.fails('select * from public.admins', 'permission denied', 'anon cannot read admins');
select t.fails($$select public.create_loan('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1')$$,
  'permission denied', 'anon cannot create loans');
select t.fails($$select public.consume_rate_limit('x', 'y', 1, 1)$$, 'permission denied', 'anon cannot call rate limiter');

-- ---------- משתמשת מחוברת שאינה מנהלת ----------
select t.as_other_user();
select t.ok((select count(*) from public.borrowers) = 0, 'non-admin sees no borrowers (RLS)');
select t.ok((select count(*) from public.loans) = 0, 'non-admin sees no loans (RLS)');
select t.ok((select count(*) from public.admin_books) = 0, 'non-admin sees nothing in admin view');
select t.fails($$insert into public.admins (user_id) select id from auth.users where email = 'other@test.local'$$,
  'permission denied', 'user cannot grant herself admin');
select t.fails($$select public.create_loan('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1')$$,
  'NOT_ADMIN', 'non-admin cannot create loans');
select t.fails($$insert into public.books (title) values ('חדירה')$$, 'row-level security', 'non-admin cannot add books');
select t.fails($$select public.approve_reservation(gen_random_uuid())$$, 'NOT_ADMIN', 'non-admin cannot approve');

-- ---------- בקשות שמירה ----------
select t.as_anon();
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b2', 'מרים', '054-1112222') = 'ok', 'anon can request reservation');
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b2', 'מרים', '0541112222') = 'ok', 'duplicate request accepted silently');
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b2', 'דבורה', '054-3334444') = 'ok', 'second requester');
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b2', 'x', '054-3334444') = 'invalid', 'short name rejected');
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b2', 'שם תקין', '12') = 'invalid', 'bad phone rejected');
select t.ok((select status from public.catalog where title = 'ספר ב') = 'available', 'pending request does not block book');

select t.as_admin();
select t.ok((select count(*) from public.reservation_requests where status = 'pending') = 2, 'duplicate not stored twice');
select id as r1 from public.reservation_requests where requester_name = 'מרים' \gset
select id as r2 from public.reservation_requests where requester_name = 'דבורה' \gset
select (public.approve_reservation(:'r1')).id \gset
select t.ok((select round(extract(epoch from (expires_at - approved_at)) / 3600) = 48 from public.reservation_requests where id = :'r1'), 'approval reserves for exactly 48h from approval');
select t.ok((select status from public.catalog where title = 'ספר ב') = 'reserved', 'approved reservation => reserved');
select t.fails(format($$select public.approve_reservation(%L)$$, :'r2'), 'BOOK_RESERVED', 'second request cannot be approved in parallel');
select t.fails($$select public.create_loan('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1')$$,
  'BOOK_RESERVED', 'loan to someone else requires explicit handling of reservation');
select t.fails($$update public.books set archived_at = now() where id = '00000000-0000-0000-0000-0000000000b2'$$,
  'BOOK_IN_USE', 'cannot archive a reserved book');

select t.as_anon();
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b2', 'חנה', '054-5556666') = 'unavailable', 'cannot request a reserved book');

-- ---------- תפוגה ללא ניקוי ברקע ----------
reset role;
update public.reservation_requests set expires_at = now() - interval '1 minute' where id = :'r1';
select t.as_anon();
select t.ok((select status from public.catalog where title = 'ספר ב') = 'available', 'expired reservation frees availability without cleanup');
select t.as_admin();
select t.ok((select status from public.reservation_requests where id = :'r1') = 'approved', '(row not yet cleaned up)');
select (public.approve_reservation(:'r2')).id \gset
select t.ok((select status from public.reservation_requests where id = :'r1') = 'expired', 'stale reservation marked expired on next approval');
select t.fails(format($$select public.extend_reservation(%L)$$, :'r1'), 'BOOK_RESERVED', 'cannot revive expired reservation while another is active');

-- ---------- הארכה, מסירה ----------
select expires_at as before_ext from public.reservation_requests where id = :'r2' \gset
select (public.extend_reservation(:'r2', 24)).id \gset
select t.ok((select expires_at = :'before_ext'::timestamptz + interval '24 hours' from public.reservation_requests where id = :'r2'), 'extend adds hours');
select (public.fulfill_reservation(:'r2')).id as floan \gset
select t.ok((select status from public.reservation_requests where id = :'r2') = 'fulfilled', 'handover fulfills reservation');
select t.ok((select status from public.catalog where title = 'ספר ב') = 'loaned', 'handover creates loan');
select t.ok((select b.name from public.loans l join public.borrowers b on b.id = l.borrower_id where l.id = :'floan') = 'דבורה', 'handover created borrower from request details');
select t.fails(format($$select public.fulfill_reservation(%L)$$, :'r2'), 'RESERVATION_NOT_ACTIVE', 'double handover blocked');

-- ---------- ביטול מפורש של שמירה בעת השאלה ----------
select t.as_anon();
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b3', 'יעל', '053-1010101') = 'ok', 'request for book 3');
select t.as_admin();
select id as r3 from public.reservation_requests where requester_name = 'יעל' \gset
select (public.approve_reservation(:'r3')).id \gset
select (public.create_loan('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1', null, null, null, true)).id \gset
select t.ok((select status from public.reservation_requests where id = :'r3') = 'cancelled', 'explicit override cancels reservation');
select t.ok((select status from public.catalog where title = 'ספר ג') = 'loaned', 'override loan created');

-- ---------- ארכוב ----------
update public.books set archived_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
select t.as_anon();
select t.ok(not exists (select 1 from public.catalog where title = 'ספר א'), 'archived book hidden from catalog');
select t.as_admin();
select t.ok((select count(*) from public.loans where book_id = '00000000-0000-0000-0000-0000000000b1') = 1, 'archived book keeps loan history');
select t.fails($$select public.create_loan('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1')$$, 'BOOK_ARCHIVED', 'archived book cannot be loaned');

-- ---------- הגבלת קצב ----------
reset role;
delete from public.rate_limit_events;
select t.as_anon();
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', false) \gset
select count(public.request_reservation('00000000-0000-0000-0000-0000000000b1', 'בדיקה', '050-000000' || g)) from generate_series(1, 5) g;
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b1', 'בדיקה', '050-0000009') = 'rate_limited', '6th request per IP within an hour is rate limited');
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.77"}', false) \gset
select t.ok(public.request_reservation('00000000-0000-0000-0000-0000000000b1', 'בדיקה', '050-0000009') = 'unavailable', 'other IP not limited (book archived => unavailable)');

reset role;
\echo ALL DATABASE TESTS PASSED
