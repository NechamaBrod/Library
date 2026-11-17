-- הספרייה שלי — סכימה, אילוצים והרשאות (RLS)
-- כל הזמנים נשמרים כ-timestamptz (UTC). התצוגה לפי Asia/Jerusalem נעשית בלקוח.

-- ---------------------------------------------------------------------------
-- מנהלות. אין policy לכתיבה: הוספת מנהלת אפשרית רק מ-SQL Editor / service role.
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

create function public.normalize_phone(p text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when d like '972%' then '0' || substr(d, 4)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

-- ---------------------------------------------------------------------------
-- צילומי מדף (התמונה עצמה ב-Storage פרטי)
-- ---------------------------------------------------------------------------
create table public.shelf_scans (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,
  location    text,
  status      text not null default 'uploaded'
              check (status in ('uploaded', 'analyzed', 'failed', 'saved')),
  result      jsonb,
  error       text,
  books_saved integer not null default 0,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ספרים — רשומה אחת לכל ספר. הזמינות אינה נשמרת אלא מחושבת (ראו views).
-- ---------------------------------------------------------------------------
create table public.books (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 1 and 300),
  author         text check (author is null or char_length(author) <= 200),
  summary        text check (summary is null or char_length(summary) <= 5000),
  category       text check (category is null or char_length(category) <= 80),
  audience       text check (audience is null or char_length(audience) <= 80),
  language       text not null default 'עברית' check (char_length(language) <= 40),
  series         text check (series is null or char_length(series) <= 200),
  series_number  integer check (series_number is null or series_number between 0 and 9999),
  tags           text[] not null default '{}',
  cover_url      text,
  location       text check (location is null or char_length(location) <= 200),
  is_sample      boolean not null default false,
  source_scan_id uuid references public.shelf_scans (id) on delete set null,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index books_title_idx on public.books (lower(title));

-- ---------------------------------------------------------------------------
-- קוראות
-- ---------------------------------------------------------------------------
create table public.borrowers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  phone            text not null check (char_length(phone) <= 30),
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  email            text check (email is null or char_length(email) <= 200),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index borrowers_phone_idx on public.borrowers (phone_normalized);

-- ---------------------------------------------------------------------------
-- בקשות שמירה
-- ---------------------------------------------------------------------------
create table public.reservation_requests (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references public.books (id) on delete restrict,
  requester_name   text not null check (char_length(btrim(requester_name)) between 2 and 80),
  requester_phone  text not null check (char_length(requester_phone) <= 30),
  phone_normalized text generated always as (public.normalize_phone(requester_phone)) stored,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'fulfilled')),
  requested_at     timestamptz not null default now(),
  approved_at      timestamptz,
  expires_at       timestamptz,
  resolved_at      timestamptz,
  borrower_id      uuid references public.borrowers (id) on delete set null,
  loan_id          uuid,
  constraint approved_has_times
    check (status <> 'approved' or (approved_at is not null and expires_at is not null))
);
-- לכל היותר שמירה מאושרת אחת לספר (גיבוי ברמת המסד לפעולות האטומיות).
create unique index reservation_one_approved_per_book
  on public.reservation_requests (book_id) where status = 'approved';
-- אותה מבקשת לא יכולה להציף בקשות ממתינות לאותו ספר.
create unique index reservation_one_pending_per_phone
  on public.reservation_requests (book_id, phone_normalized) where status = 'pending';
create index reservation_status_idx on public.reservation_requests (status, requested_at);

-- ---------------------------------------------------------------------------
-- השאלות — ההיסטוריה נשמרת; השאלה פעילה = returned_at is null
-- ---------------------------------------------------------------------------
create table public.loans (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.books (id) on delete restrict,
  borrower_id    uuid not null references public.borrowers (id) on delete restrict,
  loaned_at      timestamptz not null default now(),
  due_date       date,
  returned_at    timestamptz,
  note           text check (note is null or char_length(note) <= 1000),
  reservation_id uuid references public.reservation_requests (id) on delete set null,
  constraint returned_after_loaned check (returned_at is null or returned_at >= loaned_at)
);
-- ספר לא יכול להיות מושאל פעמיים במקביל.
create unique index loans_one_active_per_book
  on public.loans (book_id) where returned_at is null;
create index loans_borrower_idx on public.loans (borrower_id, loaned_at desc);

alter table public.reservation_requests
  add constraint reservation_loan_fk foreign key (loan_id) references public.loans (id) on delete set null;

-- ---------------------------------------------------------------------------
-- הגבלת קצב (בקשות שמירה ציבוריות וקריאות AI)
-- ---------------------------------------------------------------------------
create table public.rate_limit_events (
  id         bigint generated always as identity primary key,
  kind       text not null,
  key        text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_lookup_idx on public.rate_limit_events (kind, key, created_at);

-- ---------------------------------------------------------------------------
-- Views: זמינות מחושבת
-- ---------------------------------------------------------------------------
-- קטלוג ציבורי: רץ בהרשאות בעל ה-view ולכן חושף רק את העמודות שכאן —
-- ללא מיקום, ללא זהות שואלת/מבקשת.
create view public.catalog
with (security_invoker = false) as
select
  b.id, b.title, b.author, b.summary, b.category, b.audience, b.language,
  b.series, b.series_number, b.tags, b.cover_url, b.is_sample, b.created_at,
  case
    when exists (select 1 from public.loans l
                 where l.book_id = b.id and l.returned_at is null) then 'loaned'
    when exists (select 1 from public.reservation_requests r
                 where r.book_id = b.id and r.status = 'approved' and r.expires_at > now()) then 'reserved'
    else 'available'
  end as status
from public.books b
where b.archived_at is null;

-- תצוגת ניהול: כפופה ל-RLS של המשתמשת הקוראת (security_invoker).
create view public.admin_books
with (security_invoker = true) as
select
  b.*,
  case
    when al.id is not null then 'loaned'
    when ar.id is not null then 'reserved'
    else 'available'
  end as status,
  coalesce(lb.name, ar.requester_name) as holder_name
from public.books b
left join public.loans al on al.book_id = b.id and al.returned_at is null
left join public.borrowers lb on lb.id = al.borrower_id
left join public.reservation_requests ar
  on ar.book_id = b.id and ar.status = 'approved' and ar.expires_at > now();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.admins               enable row level security;
alter table public.books                enable row level security;
alter table public.borrowers            enable row level security;
alter table public.loans                enable row level security;
alter table public.reservation_requests enable row level security;
alter table public.shelf_scans          enable row level security;
alter table public.rate_limit_events    enable row level security;

create policy admins_read_own on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy books_admin_all on public.books
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy borrowers_admin_all on public.borrowers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy shelf_scans_admin_all on public.shelf_scans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- השאלות ובקשות: קריאה בלבד למנהלת; כתיבה רק דרך הפונקציות האטומיות.
create policy loans_admin_read on public.loans
  for select to authenticated using (public.is_admin());
create policy reservations_admin_read on public.reservation_requests
  for select to authenticated using (public.is_admin());
-- rate_limit_events: ללא policies — נגיש רק לפונקציות security definer ול-service role.

-- הרשאות טבלה מפורשות (Supabase מעניק ברירת מחדל רחבה ל-anon/authenticated).
revoke all on public.admins, public.books, public.borrowers, public.loans,
              public.reservation_requests, public.shelf_scans, public.rate_limit_events,
              public.catalog, public.admin_books
  from anon, authenticated;

grant select on public.catalog to anon, authenticated;
grant select on public.admins, public.admin_books, public.loans, public.reservation_requests
  to authenticated;
grant select, insert, update, delete on public.books to authenticated;
grant select, insert, update on public.borrowers to authenticated;
grant select, insert, update on public.shelf_scans to authenticated;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
