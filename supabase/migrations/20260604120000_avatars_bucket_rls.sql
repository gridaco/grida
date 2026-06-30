-- Avatars bucket + org-scoped storage RLS.
--
-- The `avatars` bucket holds organization avatars (and, by the same
-- public-URL read pattern, user_profile avatars). Organization avatar objects
-- live at the path `{organization_id}/avatar`; the first path segment is the
-- org id, authorized through the existing `public.rls_organization()` helper —
-- mirroring how the `storage` / `www` buckets scope writes via
-- `rls_*( (storage.foldername(name))[1]::... )`.
--
-- Reconciliation notes:
--   * The bucket already exists in production (created via the dashboard), so
--     the insert is idempotent (`on conflict do nothing`) and a no-op there.
--     This statement exists for local-stack parity.
--   * Each policy is `drop ... if exists` first so this migration coexists with
--     any same-named policy that may already be present on the prod bucket and
--     is safe to (re)apply.
--   * These are the ONLY write policies on the `avatars` bucket. The membership
--     check is wrapped in a CASE so a non-numeric first segment yields `false`
--     instead of raising on the `::bigint` cast. Because storage.objects is
--     deny-by-default under RLS and no other write policy exists, a non-numeric
--     (e.g. uuid-keyed) path is simply DENIED for insert/update/delete — it does
--     not "fall through" to anything. Org avatar objects live at
--     `{organization_id}/avatar`; only that numeric-prefixed shape is writable
--     here today. Reads stay public (see the public-read policy below).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- SELECT stays public to match the public-URL read pattern (public bucket).
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

-- INSERT: an org member may create their org's avatar object.
drop policy if exists "avatars org member insert" on storage.objects;
create policy "avatars org member insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then public.rls_organization((storage.foldername(name))[1]::bigint)
        else false
      end
);

-- UPDATE: covers the upsert (replace) path.
drop policy if exists "avatars org member update" on storage.objects;
create policy "avatars org member update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then public.rls_organization((storage.foldername(name))[1]::bigint)
        else false
      end
)
with check (
  bucket_id = 'avatars'
  and case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then public.rls_organization((storage.foldername(name))[1]::bigint)
        else false
      end
);

-- DELETE: covers the remove path.
drop policy if exists "avatars org member delete" on storage.objects;
create policy "avatars org member delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and case
        when (storage.foldername(name))[1] ~ '^[0-9]+$'
        then public.rls_organization((storage.foldername(name))[1]::bigint)
        else false
      end
);
