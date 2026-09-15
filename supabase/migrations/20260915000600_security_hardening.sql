-- =====================================================================
-- Forward migration 6/6 — security hardening
--
--   * least privilege for `anon`: nothing in public except published
--     listings, their channel rows and public verification badges
--   * append-only history tables (audit_logs, verification_status_events)
--   * admin actions that touch money or platform settings require MFA
--     (JWT aal2) — is_admin_mfa()
--   * database-backed rate limiting for abuse-prone entry points
--     (invitation acceptance, applications, leads)
-- See docs/SECURITY.md for the full posture.
-- =====================================================================

-- ------------------------------------------------------ least privilege
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
-- hosted Supabase sets these for the `postgres` role too; make new tables private by default
do $$ begin
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon';
  execute 'alter default privileges for role postgres in schema public revoke all on functions from anon';
exception when others then null; end $$;

grant select on public.listings to anon;
grant select on public.listing_channels to anon;
grant select on public.property_party_relationships to anon;
grant execute on function public.increment_listing_view(uuid) to anon;
grant execute on function public.provider_public_profile(uuid) to anon;
grant execute on function public.public_listing(text) to anon;

-- ------------------------------------------------------- admin + MFA
-- Supabase issues aal2 once the user has completed a TOTP challenge.
-- Admin-only policies on money/settings tables use this instead of has_role().
create or replace function public.is_admin_mfa() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;
revoke execute on function public.is_admin_mfa() from public, anon;
grant execute on function public.is_admin_mfa() to authenticated, service_role;

grant update on public.platform_settings to authenticated; -- live schema had the policy but no grant
drop policy if exists platform_settings_update on public.platform_settings;
create policy platform_settings_update on public.platform_settings for update to authenticated
  using (public.is_admin_mfa()) with check (public.is_admin_mfa());

drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin on public.payment_events for select to authenticated
  using (public.is_admin_mfa());

-- ------------------------------------------------- append-only history
drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.reject_mutation();
revoke update, delete on public.audit_logs from authenticated;

do $$ begin
  if to_regclass('public.verification_status_events') is not null then
    execute 'drop trigger if exists verification_status_events_append_only on public.verification_status_events';
    execute 'create trigger verification_status_events_append_only before update or delete on public.verification_status_events
             for each row execute function public.reject_mutation()';
    execute 'revoke update, delete on public.verification_status_events from authenticated';
  end if;
end $$;

-- ------------------------------------------------------- rate limiting
-- Fixed-window counters keyed by (subject, action). Cheap, index-backed, and
-- good enough until the app fronts with an edge rate limiter. Rows are
-- garbage-collected opportunistically.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.check_rate_limit(_action text, _limit integer, _window interval default interval '1 hour')
returns void language plpgsql security definer set search_path = public as $$
declare
  subject text := coalesce(auth.uid()::text, 'anon');
  bucket timestamptz := date_trunc('minute', now()) - (extract(epoch from now())::int % extract(epoch from _window)::int) * interval '1 second';
  current integer;
begin
  if public.is_platform_actor() then return; end if;
  insert into public.rate_limits as r (key, window_start, count)
  values (subject || ':' || _action, bucket, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into current;
  if current > _limit then
    raise exception 'rate limit exceeded for %', _action using errcode = '54000';
  end if;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
end $$;
revoke execute on function public.check_rate_limit(text, integer, interval) from public, anon;
grant execute on function public.check_rate_limit(text, integer, interval) to authenticated, service_role;

create or replace function public.rate_limit_applications() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.check_rate_limit('rental_application', 20, interval '1 day');
  return new;
end $$;
drop trigger if exists rental_applications_rate_limit on public.rental_applications;
create trigger rental_applications_rate_limit before insert on public.rental_applications
  for each row execute function public.rate_limit_applications();

create or replace function public.rate_limit_leads() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.check_rate_limit('listing_lead', 30, interval '1 hour');
  return new;
end $$;
drop trigger if exists listing_leads_rate_limit on public.listing_leads;
create trigger listing_leads_rate_limit before insert on public.listing_leads
  for each row execute function public.rate_limit_leads();

create or replace function public.rate_limit_invitations() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.check_rate_limit('tenant_invitation', 50, interval '1 day');
  return new;
end $$;
drop trigger if exists tenant_invitations_rate_limit on public.tenant_invitations;
create trigger tenant_invitations_rate_limit before insert on public.tenant_invitations
  for each row execute function public.rate_limit_invitations();

-- accept_invitation v2: throttled (10 attempts / hour / user) and *soft-failing*.
-- Soft failures (not found, expired, wrong email, already used) return
-- {ok:false, error} instead of raising, so the attempt still counts against the
-- rate limit — an exception would roll back the counter increment and make
-- token guessing free. Only hard errors (not authenticated, limit hit) raise.
drop function if exists public.accept_invitation(text);
create or replace function public.accept_invitation(_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv public.tenant_invitations%rowtype;
  uid uuid := auth.uid();
  uemail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  uname text;
  t_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform public.check_rate_limit('accept_invitation', 10, interval '1 hour');

  select * into inv from public.tenant_invitations where token = _token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if inv.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_' || inv.status::text);
  end if;
  if inv.expires_at < now() then
    update public.tenant_invitations set status = 'expired' where id = inv.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if inv.email is not null and lower(inv.email) <> uemail then
    return jsonb_build_object('ok', false, 'error', 'wrong_email');
  end if;

  select full_name into uname from public.profiles where id = uid;

  if inv.tenancy_id is not null then
    update public.tenancies
       set tenant_user_id = uid,
           status = case when status = 'pending' then 'active' else status end,
           tenant_email = coalesce(tenant_email, uemail)
     where id = inv.tenancy_id
     returning id into t_id;
  else
    insert into public.tenancies (organization_id, property_id, unit_id, tenant_user_id, tenant_name,
                                  tenant_email, tenant_phone, status, monthly_rent, start_date, end_date)
    values (inv.organization_id, inv.property_id, inv.unit_id, uid,
            coalesce(inv.full_name, uname, uemail), coalesce(inv.email, uemail), inv.phone,
            'active', inv.monthly_rent, inv.lease_start, inv.lease_end)
    returning id into t_id;
  end if;

  update public.tenant_invitations
     set status = 'accepted', accepted_by = uid, accepted_at = now(), tenancy_id = t_id
   where id = inv.id;

  insert into public.user_roles (user_id, role) values (uid, 'tenant') on conflict (user_id, role) do nothing;

  if inv.unit_id is not null then
    update public.units set occupancy_status = 'occupied' where id = inv.unit_id;
  end if;

  insert into public.audit_logs (actor_id, actor_role, organization_id, action, entity_type, entity_id, metadata)
  values (uid, 'tenant', inv.organization_id, 'invitation.accepted', 'tenancy', t_id,
          jsonb_build_object('invitation_id', inv.id));

  return jsonb_build_object('ok', true, 'tenancy_id', t_id);
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ------------------------------------------- every public table has RLS
-- Fails the migration if a table slipped through without RLS — a cheap
-- guard against the classic "forgot to enable RLS on the new table" breach.
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then
    raise exception 'tables without row level security: %', bad;
  end if;
end $$;
