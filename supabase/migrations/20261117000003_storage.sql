-- הספרייה שלי — Storage
-- covers: כריכות, קריאה ציבורית. shelf-photos: צילומי מדף מקוריים, פרטי לחלוטין.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('shelf-photos', 'shelf-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy covers_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'covers' and public.is_admin());
create policy covers_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'covers' and public.is_admin())
  with check (bucket_id = 'covers' and public.is_admin());
create policy covers_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and public.is_admin());

create policy shelf_photos_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'shelf-photos' and public.is_admin())
  with check (bucket_id = 'shelf-photos' and public.is_admin());
