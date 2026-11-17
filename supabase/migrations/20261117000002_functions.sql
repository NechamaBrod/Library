-- הספרייה שלי — פעולות אטומיות.
-- כל פעולה שמשנה זמינות נועלת תחילה את שורת הספר (FOR UPDATE), כך ששתי פעולות
-- מקבילות על אותו ספר מתבצעות בזו אחר זו ולא במקביל.

create function public._require_admin()
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
end $$;

-- שמירות שפג תוקפן מסומנות "expired". הזמינות אינה תלויה בכך (היא מחושבת לפי expires_at),
-- אבל הסימון משחרר את האינדקס הייחודי לפני אישור שמירה חדשה.
create function public._expire_stale(p_book_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.reservation_requests
     set status = 'expired', resolved_at = now()
   where status = 'approved' and expires_at <= now()
     and (p_book_id is null or book_id = p_book_id);
$$;

create function public._touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger borrowers_touch before update on public.borrowers
  for each row execute function public._touch_updated_at();

-- ארכוב ספר: אסור כשיש השאלה או שמירה פעילה. בקשות ממתינות נדחות.
create function public._books_before_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.archived_at is not null and old.archived_at is null then
    if exists (select 1 from public.loans l where l.book_id = new.id and l.returned_at is null)
       or exists (select 1 from public.reservation_requests r
                  where r.book_id = new.id and r.status = 'approved' and r.expires_at > now()) then
      raise exception 'BOOK_IN_USE';
    end if;
    update public.reservation_requests
       set status = case when status = 'approved' then 'expired' else 'rejected' end,
           resolved_at = now()
     where book_id = new.id and status in ('pending', 'approved');
  end if;
  return new;
end $$;

create trigger books_before_update before update on public.books
  for each row execute function public._books_before_update();

-- ---------------------------------------------------------------------------
-- הגבלת קצב
-- ---------------------------------------------------------------------------
create function public.consume_rate_limit(p_kind text, p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_kind || ':' || p_key));
  select count(*) into v_count
    from public.rate_limit_events
   where kind = p_kind and key = p_key
     and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then
    return false;
  end if;
  insert into public.rate_limit_events (kind, key) values (p_kind, p_key);
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
  return true;
end $$;

create function public._request_ip_hash()
returns text language plpgsql stable set search_path = ''
as $$
declare
  h  jsonb;
  ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  ip := coalesce(nullif(h ->> 'cf-connecting-ip', ''),
                 nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''));
  if ip is null then
    return 'unknown';
  end if;
  return encode(sha256(convert_to(ip, 'utf8')), 'hex');
end $$;

-- ---------------------------------------------------------------------------
-- בקשת שמירה ציבורית. מחזירה קוד תוצאה בלבד — לעולם לא נתוני בקשות.
-- 'ok' | 'invalid' | 'rate_limited' | 'unavailable'
-- ---------------------------------------------------------------------------
create function public.request_reservation(p_book_id uuid, p_name text, p_phone text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_norm  text := public.normalize_phone(p_phone);
  v_ip    text := public._request_ip_hash();
begin
  if p_book_id is null
     or char_length(v_name) not between 2 and 80
     or v_name ~ '[<>{}\\]'
     or char_length(v_phone) > 30
     or v_phone !~ '^[0-9+() \-]+$'
     or char_length(v_norm) not between 9 and 15 then
    return 'invalid';
  end if;

  -- 5 לשעה לכל כתובת, 60 לשעה בסך הכול, ועד 3 בקשות ממתינות לכל טלפון.
  if not public.consume_rate_limit('reservation_ip', v_ip, 5, 3600)
     or not public.consume_rate_limit('reservation_all', 'all', 60, 3600) then
    return 'rate_limited';
  end if;
  if (select count(*) from public.reservation_requests
       where phone_normalized = v_norm and status = 'pending') >= 3 then
    return 'rate_limited';
  end if;

  if not exists (select 1 from public.catalog c where c.id = p_book_id and c.status = 'available') then
    return 'unavailable';
  end if;

  insert into public.reservation_requests (book_id, requester_name, requester_phone)
  values (p_book_id, v_name, v_phone)
  on conflict (book_id, phone_normalized) where status = 'pending' do nothing;
  return 'ok';
end $$;

-- ---------------------------------------------------------------------------
-- שמירות — פעולות מנהלת
-- ---------------------------------------------------------------------------
create function public.approve_reservation(p_reservation_id uuid)
returns public.reservation_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_res  public.reservation_requests;
  v_book public.books;
begin
  perform public._require_admin();
  select * into v_res from public.reservation_requests where id = p_reservation_id;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;

  select * into v_book from public.books where id = v_res.book_id for update;
  perform public._expire_stale(v_res.book_id);
  -- קריאה חוזרת אחרי הנעילה: ייתכן שהבקשה טופלה בינתיים.
  select * into v_res from public.reservation_requests where id = p_reservation_id;

  if v_res.status <> 'pending' then raise exception 'RESERVATION_NOT_PENDING'; end if;
  if v_book.archived_at is not null then raise exception 'BOOK_ARCHIVED'; end if;
  if exists (select 1 from public.loans where book_id = v_res.book_id and returned_at is null) then
    raise exception 'BOOK_ALREADY_LOANED';
  end if;
  if exists (select 1 from public.reservation_requests
              where book_id = v_res.book_id and status = 'approved') then
    raise exception 'BOOK_RESERVED';
  end if;

  update public.reservation_requests
     set status = 'approved', approved_at = now(),
         expires_at = now() + interval '48 hours', resolved_at = null
   where id = p_reservation_id
   returning * into v_res;
  return v_res;
end $$;

create function public.reject_reservation(p_reservation_id uuid)
returns public.reservation_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_res public.reservation_requests;
begin
  perform public._require_admin();
  update public.reservation_requests
     set status = 'rejected', resolved_at = now()
   where id = p_reservation_id and status = 'pending'
   returning * into v_res;
  if not found then raise exception 'RESERVATION_NOT_PENDING'; end if;
  return v_res;
end $$;

create function public.cancel_reservation(p_reservation_id uuid)
returns public.reservation_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_res public.reservation_requests;
begin
  perform public._require_admin();
  update public.reservation_requests
     set status = 'cancelled', resolved_at = now()
   where id = p_reservation_id and status in ('pending', 'approved')
   returning * into v_res;
  if not found then raise exception 'RESERVATION_NOT_ACTIVE'; end if;
  return v_res;
end $$;

-- הארכה: שמירה בתוקף מתארכת ב-p_hours; שמירה שפגה מתחדשת ל-p_hours מעכשיו,
-- בתנאי שהספר עדיין פנוי.
create function public.extend_reservation(p_reservation_id uuid, p_hours integer default 48)
returns public.reservation_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_res public.reservation_requests;
begin
  perform public._require_admin();
  if p_hours is null or p_hours not between 1 and 336 then
    raise exception 'INVALID_INPUT';
  end if;
  select * into v_res from public.reservation_requests where id = p_reservation_id;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  perform 1 from public.books where id = v_res.book_id for update;
  select * into v_res from public.reservation_requests where id = p_reservation_id;

  if v_res.status not in ('approved', 'expired') then
    raise exception 'RESERVATION_NOT_ACTIVE';
  end if;
  if exists (select 1 from public.loans where book_id = v_res.book_id and returned_at is null) then
    raise exception 'BOOK_ALREADY_LOANED';
  end if;
  if exists (select 1 from public.reservation_requests
              where book_id = v_res.book_id and status = 'approved'
                and id <> v_res.id and expires_at > now()) then
    raise exception 'BOOK_RESERVED';
  end if;
  update public.reservation_requests
     set status = 'expired', resolved_at = now()
   where book_id = v_res.book_id and status = 'approved' and id <> v_res.id;

  update public.reservation_requests
     set status = 'approved', resolved_at = null,
         expires_at = greatest(expires_at, now()) + make_interval(hours => p_hours)
   where id = p_reservation_id
   returning * into v_res;
  return v_res;
end $$;

create function public.expire_stale_reservations()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  perform public._expire_stale(null);
end $$;

-- ---------------------------------------------------------------------------
-- השאלה חדשה
-- p_reservation_id: השמירה הפעילה שמומשת בהשאלה זו (אם ההשאלה היא למבקשת עצמה).
-- p_cancel_reservation: ביטול מפורש של שמירה פעילה של מישהי אחרת.
-- ---------------------------------------------------------------------------
create function public.create_loan(
  p_book_id uuid,
  p_borrower_id uuid,
  p_due_date date default null,
  p_note text default null,
  p_reservation_id uuid default null,
  p_cancel_reservation boolean default false
)
returns public.loans
language plpgsql security definer set search_path = ''
as $$
declare
  v_book public.books;
  v_res  public.reservation_requests;
  v_loan public.loans;
begin
  perform public._require_admin();
  select * into v_book from public.books where id = p_book_id for update;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  if v_book.archived_at is not null then raise exception 'BOOK_ARCHIVED'; end if;
  if not exists (select 1 from public.borrowers where id = p_borrower_id) then
    raise exception 'BORROWER_NOT_FOUND';
  end if;

  perform public._expire_stale(p_book_id);
  if exists (select 1 from public.loans where book_id = p_book_id and returned_at is null) then
    raise exception 'BOOK_ALREADY_LOANED';
  end if;

  select * into v_res from public.reservation_requests
   where book_id = p_book_id and status = 'approved';
  if found then
    if p_reservation_id is not distinct from v_res.id then
      update public.reservation_requests
         set status = 'fulfilled', resolved_at = now(), borrower_id = p_borrower_id
       where id = v_res.id;
    elsif p_cancel_reservation then
      update public.reservation_requests
         set status = 'cancelled', resolved_at = now()
       where id = v_res.id;
      v_res.id := null;
    else
      raise exception 'BOOK_RESERVED';
    end if;
  end if;

  insert into public.loans (book_id, borrower_id, due_date, note, reservation_id)
  values (p_book_id, p_borrower_id, p_due_date, nullif(btrim(coalesce(p_note, '')), ''), v_res.id)
  returning * into v_loan;

  if v_res.id is not null then
    update public.reservation_requests set loan_id = v_loan.id where id = v_res.id;
  end if;
  return v_loan;
end $$;

-- "נמסר לקוראת": המרת שמירה מאושרת להשאלה בפעולה אחת.
-- p_borrower_id ריק => נוצרת קוראת חדשה מפרטי הבקשה.
create function public.fulfill_reservation(
  p_reservation_id uuid,
  p_borrower_id uuid default null,
  p_due_date date default null,
  p_note text default null
)
returns public.loans
language plpgsql security definer set search_path = ''
as $$
declare
  v_res      public.reservation_requests;
  v_borrower uuid;
begin
  perform public._require_admin();
  select * into v_res from public.reservation_requests where id = p_reservation_id;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  perform 1 from public.books where id = v_res.book_id for update;
  select * into v_res from public.reservation_requests where id = p_reservation_id;
  if v_res.status <> 'approved' then raise exception 'RESERVATION_NOT_ACTIVE'; end if;

  v_borrower := coalesce(p_borrower_id, v_res.borrower_id);
  if v_borrower is null then
    insert into public.borrowers (name, phone)
    values (v_res.requester_name, v_res.requester_phone)
    returning id into v_borrower;
  end if;

  -- שמירה שפג תוקפה אך טרם סומנה: מאריכים רגע כדי ש-create_loan יזהה אותה
  -- (הספר נעול, ו-create_loan יוודא שאין השאלה פעילה).
  update public.reservation_requests
     set expires_at = greatest(expires_at, now() + interval '1 minute')
   where id = v_res.id;

  return public.create_loan(v_res.book_id, v_borrower, p_due_date, p_note, v_res.id, false);
end $$;

-- החזרה. קריאה חוזרת (לחיצה כפולה) אינה משנה דבר ומחזירה את אותה רשומה.
create function public.return_loan(p_loan_id uuid)
returns public.loans
language plpgsql security definer set search_path = ''
as $$
declare
  v_loan public.loans;
begin
  perform public._require_admin();
  update public.loans set returned_at = now()
   where id = p_loan_id and returned_at is null
   returning * into v_loan;
  if not found then
    select * into v_loan from public.loans where id = p_loan_id;
    if not found then raise exception 'LOAN_NOT_FOUND'; end if;
  end if;
  return v_loan;
end $$;

create function public.update_loan(p_loan_id uuid, p_due_date date, p_note text)
returns public.loans
language plpgsql security definer set search_path = ''
as $$
declare
  v_loan public.loans;
begin
  perform public._require_admin();
  update public.loans
     set due_date = p_due_date, note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_loan_id
   returning * into v_loan;
  if not found then raise exception 'LOAN_NOT_FOUND'; end if;
  return v_loan;
end $$;

-- ---------------------------------------------------------------------------
-- הרשאות הרצה
-- ---------------------------------------------------------------------------
revoke execute on function
  public._require_admin(), public._expire_stale(uuid), public._touch_updated_at(),
  public._books_before_update(), public._request_ip_hash(),
  public.consume_rate_limit(text, text, integer, integer),
  public.request_reservation(uuid, text, text),
  public.approve_reservation(uuid), public.reject_reservation(uuid),
  public.cancel_reservation(uuid), public.extend_reservation(uuid, integer),
  public.expire_stale_reservations(),
  public.create_loan(uuid, uuid, date, text, uuid, boolean),
  public.fulfill_reservation(uuid, uuid, date, text),
  public.return_loan(uuid), public.update_loan(uuid, date, text)
from public, anon, authenticated;

grant execute on function public.request_reservation(uuid, text, text) to anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
grant execute on function
  public.approve_reservation(uuid), public.reject_reservation(uuid),
  public.cancel_reservation(uuid), public.extend_reservation(uuid, integer),
  public.expire_stale_reservations(),
  public.create_loan(uuid, uuid, date, text, uuid, boolean),
  public.fulfill_reservation(uuid, uuid, date, text),
  public.return_loan(uuid), public.update_loan(uuid, date, text)
to authenticated;
