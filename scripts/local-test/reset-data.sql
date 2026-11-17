-- איפוס נתוני מסד הבדיקה המקומי בין הרצות
truncate public.loans, public.reservation_requests, public.borrowers, public.books,
         public.shelf_scans, public.rate_limit_events cascade;
\i supabase/seed_sample.sql
