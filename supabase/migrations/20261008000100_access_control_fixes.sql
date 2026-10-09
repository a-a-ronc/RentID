-- =====================================================================
-- Access-control fixes from the 8 Oct 2026 audit. Every block closes a hole
-- that was reproduced against the previous final state; the matching proofs
-- are in scripts/db/tests/130_access_control_fixes.sql.
--
--   1. Invitations: the invitee can no longer edit the row (un-revoke, change
--      rent); an invitation can only point at its own organization's
--      property / unit / tenancy; accept_invitation re-checks all of it.
--   2. Tenancies and payment schedules: only the housing provider edits them.
--   3. Reviews: direction and subject are derived from who the author really
--      is; landlord-to-tenant reviews are no longer world-readable.
--   4. Rental passport: built only from tenancies the tenant accepted.
--   5. Messages: only `read_at` can change after sending; sender role is
--      derived, not claimed.
--   6. Rent periods: a tenant-reported payment no longer suppresses the
--      scheduled charge for that month.
--   7. Conversations / documents / work orders: the organization always comes
--      from the tenancy; demo-organization "membership" no longer grants writes.
--   8. Documents: storage_path must sit in the row's own folder.
--   9. Audit log: no writing into another organization's trail.
--  10. Organizations: owner-only membership and payout changes; a changed
--      payout reference goes back to unverified; is_demo and the payment
--      provider account id are platform-only.
--  11. Storage bucket: server-side size and file-type limits.
--  12. listings_write_guard no longer depends on pgcrypto being on the
--      function's search_path (hosted Supabase keeps it in `extensions`).
-- Additive and idempotent.
-- =====================================================================

-- ------------------------------------------------------------ helpers
-- A real party to the tenancy: the linked tenant or a member of the owning
-- organization. Unlike is_tenancy_party() this does NOT treat everyone as a
-- party to demo-organization tenancies, so it is the one to use for writes.
create or replace function public.is_tenancy_participant(_tenancy_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenancies t
    where t.id = _tenancy_id
      and (t.tenant_user_id = auth.uid() or public.is_org_member(t.organization_id)));
$$;
revoke execute on function public.is_tenancy_participant(uuid) from public, anon;
grant execute on function public.is_tenancy_participant(uuid) to authenticated, service_role;

create or replace function public.is_org_owner(_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizations o where o.id = _org_id and o.owner_id = auth.uid());
$$;
revoke execute on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;

-- ------------------------------------------------------ 1. invitations
drop policy if exists invitations_update on public.tenant_invitations;
create policy invitations_update on public.tenant_invitations for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create or replace function public.tenant_invitations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prop_org uuid;
  unit_prop uuid;
  ten record;
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'an invitation cannot be moved to another organization' using errcode = '42501';
  end if;
  if new.property_id is not null then
    select organization_id into prop_org from public.properties where id = new.property_id;
    if prop_org is distinct from new.organization_id then
      raise exception 'invitation property does not belong to this organization' using errcode = '42501';
    end if;
  end if;
  if new.unit_id is not null then
    select p.organization_id, u.property_id into prop_org, unit_prop
      from public.units u join public.properties p on p.id = u.property_id
     where u.id = new.unit_id;
    if prop_org is distinct from new.organization_id then
      raise exception 'invitation unit does not belong to this organization' using errcode = '42501';
    end if;
    if new.property_id is not null and unit_prop is distinct from new.property_id then
      raise exception 'invitation unit does not belong to the invitation property' using errcode = '42501';
    end if;
  end if;
  if new.tenancy_id is not null
     and (tg_op = 'INSERT' or new.tenancy_id is distinct from old.tenancy_id) then
    select organization_id, tenant_user_id into ten from public.tenancies where id = new.tenancy_id;
    if ten.organization_id is distinct from new.organization_id then
      raise exception 'invitation tenancy does not belong to this organization' using errcode = '42501';
    end if;
    -- accept_invitation links the freshly accepted tenancy; anything else must be unclaimed
    if not public.is_trusted_write() and ten.tenant_user_id is not null then
      raise exception 'that tenancy already has a tenant account' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tenant_invitations_guard() from public, anon, authenticated;
drop trigger if exists tenant_invitations_guard on public.tenant_invitations;
create trigger tenant_invitations_guard before insert or update on public.tenant_invitations
  for each row execute function public.tenant_invitations_guard();

-- accept_invitation v3. Same contract as v2 (soft failures so attempts count
-- against the rate limit), plus:
--   * a member of the inviting organization cannot accept its own invitation
--     (the cheapest self-made "verified tenancy");
--   * a linked tenancy must belong to the invitation's organization, be
--     unclaimed, and still be open (not cancelled / ended / deleted).
create or replace function public.accept_invitation(_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv public.tenant_invitations%rowtype;
  ten public.tenancies%rowtype;
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
  if public.is_org_member(inv.organization_id) then
    return jsonb_build_object('ok', false, 'error', 'own_organization');
  end if;

  select full_name into uname from public.profiles where id = uid;

  if inv.tenancy_id is not null then
    select * into ten from public.tenancies where id = inv.tenancy_id for update;
    if not found
       or ten.organization_id <> inv.organization_id
       or ten.deleted_at is not null
       or ten.status not in ('pending', 'active')
       or (ten.tenant_user_id is not null and ten.tenant_user_id <> uid) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    perform set_config('rentid.trusted_write', 'on', true);
    update public.tenancies
       set tenant_user_id = uid,
           status = case when status = 'pending' then 'active' else status end,
           tenant_email = coalesce(tenant_email, uemail)
     where id = inv.tenancy_id
     returning id into t_id;
    perform set_config('rentid.trusted_write', 'off', true);
  else
    insert into public.tenancies (organization_id, property_id, unit_id, tenant_user_id, tenant_name,
                                  tenant_email, tenant_phone, status, monthly_rent, start_date, end_date)
    values (inv.organization_id, inv.property_id, inv.unit_id, uid,
            coalesce(inv.full_name, uname, uemail), coalesce(inv.email, uemail), inv.phone,
            'active', inv.monthly_rent, inv.lease_start, inv.lease_end)
    returning id into t_id;
  end if;

  -- both sides have now confirmed the relationship
  perform set_config('rentid.trusted_write', 'on', true);
  update public.tenant_invitations
     set status = 'accepted', accepted_by = uid, accepted_at = now(), tenancy_id = t_id
   where id = inv.id;
  update public.tenancies set verified = true, verified_at = now() where id = t_id;
  perform set_config('rentid.trusted_write', 'off', true);
  insert into public.verification_records (organization_id, tenancy_id, kind, source, record_type, label, subject_user_id, verified_by, notes)
  values (inv.organization_id, t_id, 'tenancy', 'platform', 'tenancy_confirmed', 'Tenancy confirmed by landlord and tenant', uid, uid,
          'Landlord created the tenancy; tenant accepted the invitation from their own account');

  insert into public.user_roles (user_id, role) values (uid, 'tenant') on conflict (user_id, role) do nothing;

  if inv.unit_id is not null then
    update public.units set occupancy_status = 'occupied' where id = inv.unit_id;
  end if;

  -- seed the current rent period so the tenant sees a live ledger
  if not exists (select 1 from public.payments where tenancy_id = t_id) then
    insert into public.payments (organization_id, tenancy_id, unit_id, amount, status, method, due_date, period_label)
    select t.organization_id, t.id, t.unit_id, coalesce(t.monthly_rent, u.monthly_rent, 0), 'scheduled', 'manual',
           make_date(extract(year from now())::int, extract(month from now())::int, least(coalesce(u.rent_due_day, 1), 28)),
           to_char(now(), 'FMMonth YYYY')
      from public.tenancies t left join public.units u on u.id = t.unit_id
     where t.id = t_id and coalesce(t.monthly_rent, u.monthly_rent, 0) > 0;
  end if;

  insert into public.audit_logs (actor_id, actor_role, organization_id, action, entity_type, entity_id, metadata)
  values (uid, 'tenant', inv.organization_id, 'invitation.accepted', 'tenancy', t_id,
          jsonb_build_object('invitation_id', inv.id));

  return jsonb_build_object('ok', true, 'tenancy_id', t_id);
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- ------------------------------------- 2. tenancies / payment schedules
-- The tenant reads their tenancy; the terms (rent, dates, unit, status) are
-- the housing provider's to edit.
drop policy if exists tenancies_update on public.tenancies;
create policy tenancies_update on public.tenancies for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create or replace function public.tenancies_guard_scope() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_trusted_write() and new.organization_id is distinct from old.organization_id then
    raise exception 'a tenancy cannot be moved to another organization' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tenancies_guard_scope on public.tenancies;
create trigger tenancies_guard_scope before update on public.tenancies
  for each row execute function public.tenancies_guard_scope();

drop policy if exists payment_schedules_update on public.payment_schedules;
create policy payment_schedules_update on public.payment_schedules for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ----------------------------------------------------------- 3. reviews
-- Who reviews whom is a fact about the author, not a field the author fills in.
create or replace function public.reviews_authorize() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ten record;
  uid uuid := auth.uid();
begin
  if public.is_trusted_write() then return new; end if;
  if tg_op = 'UPDATE' then
    if new.direction is distinct from old.direction
       or new.subject_user_id is distinct from old.subject_user_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'a review cannot change who it is about' using errcode = '42501';
    end if;
    return new;
  end if;
  select organization_id, tenant_user_id into ten from public.tenancies where id = new.tenancy_id;
  if not found then
    raise exception 'review references unknown tenancy' using errcode = '23503';
  end if;
  new.organization_id := ten.organization_id;
  if ten.tenant_user_id = uid and not public.is_org_member(ten.organization_id) then
    new.direction := 'tenant_to_landlord';
    new.subject_user_id := null;
  elsif public.is_org_member(ten.organization_id) and ten.tenant_user_id is distinct from uid then
    new.direction := 'landlord_to_tenant';
    new.subject_user_id := ten.tenant_user_id;
  else
    raise exception 'only the tenant or the housing provider on this tenancy can review it' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.reviews_authorize() from public, anon, authenticated;
drop trigger if exists reviews_authorize on public.reviews;
-- fires before reviews_sync_shape (alphabetical), which then sets subject_type
create trigger reviews_authorize before insert or update on public.reviews
  for each row execute function public.reviews_authorize();

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert to authenticated
  with check (author_id = auth.uid()
              and public.is_tenancy_participant(tenancy_id)
              and public.is_verified_tenancy(tenancy_id));

-- A landlord's public record (tenant-to-landlord, published) stays readable by
-- signed-in users. A review ABOUT a tenant is visible to its author, its
-- subject and the organization that wrote it; other landlords only ever see
-- it inside an application's consented passport snapshot.
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select to authenticated
  using (author_id = auth.uid()
         or subject_user_id = auth.uid()
         or public.is_org_member(organization_id)
         or (published and direction = 'tenant_to_landlord'));

-- ---------------------------------------------------- 4. rental passport
-- Only tenancies the tenant accepted from their own account count. A row some
-- organization created with the tenant's e-mail address proves nothing and
-- must not be able to add late payments or reviews to their record.
create or replace function public.tenant_passport_snapshot(_user_id uuid, _email text)
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (
    select * from public.tenancies
     where deleted_at is null
       and _user_id is not null
       and tenant_user_id = _user_id
       and verified
  ),
  p as (
    select pay.*,
           (pay.status = 'paid' and pay.verified) as settled,
           (pay.status = 'paid' and pay.verified
              and (pay.paid_at is null or pay.paid_at::date <= coalesce(pay.due_date, pay.created_at::date))) as on_time,
           (pay.status in ('late', 'failed')
              or (pay.status = 'paid' and pay.paid_at is not null
                  and pay.paid_at::date > coalesce(pay.due_date, pay.created_at::date))) as late
      from public.payments pay
     where pay.tenancy_id in (select id from t)
       and pay.verification_source <> 'tenant_reported'
  ),
  r as (
    select rv.* from public.reviews rv
     where rv.tenancy_id in (select id from t)
       and rv.direction = 'landlord_to_tenant'
       and rv.status = 'published'
       and rv.author_id <> _user_id
       and (exists (select 1 from public.organization_members m
                     where m.organization_id = rv.organization_id and m.user_id = rv.author_id)
            or exists (select 1 from public.organizations o
                        where o.id = rv.organization_id and o.owner_id = rv.author_id))
  )
  select case when not exists (select 1 from t) then null else jsonb_build_object(
    'tenant_name',        (select tenant_name from t order by created_at desc limit 1),
    'verified_payments',  (select count(*) from p where settled),
    'on_time_payments',   (select count(*) from p where on_time),
    'on_time_pct',        coalesce((select round(100.0 * count(*) filter (where on_time)
                                                / nullif(count(*) filter (where settled or late), 0))::integer from p), 0),
    'late_payments',      (select count(*) from p where late),
    'verified_tenancies', (select count(*) from t where verified),
    'months_of_history',  (select coalesce(sum(greatest(0, round(extract(epoch from (
                              case when end_date is not null and end_date < current_date
                                   then end_date::timestamp else localtimestamp end
                              - start_date::timestamp)) / 2628000))), 0)::integer
                             from t where start_date is not null),
    'average_rent',       (select avg(monthly_rent) filter (where monthly_rent > 0) from t),
    'open_disputes',      (select count(*) from public.review_disputes d
                            where d.status = 'open' and d.review_id in (select id from r)),
    'reviews',            coalesce((select jsonb_agg(jsonb_build_object(
                              'id', r.id, 'organization_id', r.organization_id, 'tenancy_id', r.tenancy_id,
                              'direction', r.direction, 'author_id', r.author_id, 'author_name', r.author_name,
                              'rating', r.rating, 'body', coalesce(r.body, ''), 'status', r.status,
                              'created_at', r.created_at, 'updated_at', r.updated_at)
                              order by r.created_at desc) from r), '[]'::jsonb)
  ) end;
$$;
revoke execute on function public.tenant_passport_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.tenant_passport_snapshot(uuid, text) to service_role;

-- ---------------------------------------------------------- 5. messages
create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  conv_org uuid;
begin
  if public.is_platform_actor() then return new; end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
      raise exception 'a sent message cannot be edited' using errcode = '42501';
    end if;
    if old.read_at is not null and new.read_at is distinct from old.read_at then
      new.read_at := old.read_at;
    end if;
    return new;
  end if;
  select organization_id into conv_org from public.conversations where id = new.conversation_id;
  if not public.is_org_member(conv_org) then
    new.sender_role := 'tenant';
  elsif new.sender_role is null or new.sender_role in ('tenant', 'admin') then
    new.sender_role := 'landlord';
  end if;
  return new;
end $$;
revoke execute on function public.messages_guard() from public, anon, authenticated;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert or update on public.messages
  for each row execute function public.messages_guard();

-- ------------------------------------------------------ 6. rent periods
-- A tenant's own "I paid" note is a claim, not the charge. It must not stand
-- in for the scheduled period, or a 1-cent note in a future month would stop
-- that month's rent ever being billed.
create or replace function public._generate_rent_periods(_tenancy_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  grace_days constant integer := 5;
  max_months constant integer := 24;
  t record;
  rent numeric;
  due_day integer;
  first_month date;
  last_month date;
  m date;
  inserted integer := 0;
begin
  select tn.id, tn.organization_id, tn.unit_id, tn.status, tn.start_date, tn.end_date,
         tn.created_at, tn.deleted_at, tn.monthly_rent,
         u.monthly_rent as unit_rent, u.rent_due_day
    into t
    from public.tenancies tn
    left join public.units u on u.id = tn.unit_id
   where tn.id = _tenancy_id;
  if not found or t.status <> 'active' or t.deleted_at is not null then
    return 0;
  end if;
  rent := coalesce(t.monthly_rent, t.unit_rent, 0);
  if rent <= 0 then
    return 0;
  end if;
  due_day := least(greatest(coalesce(t.rent_due_day, 1), 1), 28);
  last_month := date_trunc('month', current_date)::date;
  if t.end_date is not null then
    last_month := least(last_month, date_trunc('month', t.end_date)::date);
  end if;
  first_month := greatest(
    date_trunc('month', coalesce(t.start_date, t.created_at::date))::date,
    date_trunc('month', t.created_at)::date,
    (last_month - make_interval(months => max_months - 1))::date
  );
  m := first_month;
  while m <= last_month loop
    if not exists (
      select 1 from public.payments p
       where p.tenancy_id = t.id
         and p.due_date >= m
         and p.due_date < (m + interval '1 month')::date
         and p.verification_source <> 'tenant_reported'
    ) then
      insert into public.payments
        (organization_id, tenancy_id, unit_id, amount, status, method, due_date, period_label)
      values
        (t.organization_id, t.id, t.unit_id, rent, 'scheduled', 'manual',
         m + (due_day - 1), to_char(m, 'FMMonth YYYY'));
      inserted := inserted + 1;
    end if;
    m := (m + interval '1 month')::date;
  end loop;
  update public.payments
     set status = 'late'
   where tenancy_id = t.id
     and status = 'scheduled'
     and due_date < current_date - grace_days
     and verification_source not in ('platform_settled', 'bank_linked', 'imported');
  return inserted;
end $$;

-- A tenant-reported payment is a note about rent already due, by the tenant
-- on the tenancy, marked as theirs. (The trigger already forces the
-- organization and blocks platform sources.)
drop policy if exists payments_insert_tenant on public.payments;
create policy payments_insert_tenant on public.payments for insert to authenticated
  with check (
    exists (select 1 from public.tenancies t
             where t.id = payments.tenancy_id and t.tenant_user_id = auth.uid())
    and verification_source = 'tenant_reported'
    and amount > 0
    and (due_date is null or due_date <= (date_trunc('month', now()) + interval '1 month - 1 day')::date)
  );

-- ------------------- 7. conversations / documents / work orders scoping
create or replace function public.tenancy_scoped_row_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ten_org uuid;
begin
  if new.tenancy_id is not null then
    select organization_id into ten_org from public.tenancies where id = new.tenancy_id;
    if ten_org is null then
      raise exception 'row references unknown tenancy' using errcode = '23503';
    end if;
    if new.organization_id is distinct from ten_org then
      if public.is_platform_actor() or tg_op = 'UPDATE' then
        raise exception 'tenancy belongs to a different organization' using errcode = '42501';
      end if;
      new.organization_id := ten_org;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tenancy_scoped_row_guard() from public, anon, authenticated;

drop trigger if exists conversations_scope_guard on public.conversations;
create trigger conversations_scope_guard before insert or update on public.conversations
  for each row execute function public.tenancy_scoped_row_guard();
drop trigger if exists documents_scope_guard on public.documents;
create trigger documents_scope_guard before insert or update on public.documents
  for each row execute function public.tenancy_scoped_row_guard();
drop trigger if exists maintenance_scope_guard on public.maintenance_requests;
create trigger maintenance_scope_guard before insert or update on public.maintenance_requests
  for each row execute function public.tenancy_scoped_row_guard();

-- BEFORE triggers run before the WITH CHECK, so the policies below see the
-- organization the trigger derived, never the one the client sent.
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert to authenticated
  with check (public.is_org_member(organization_id)
              or (tenancy_id is not null and public.is_tenancy_participant(tenancy_id)));
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_org_member(organization_id)
              or (tenancy_id is not null and public.is_tenancy_participant(tenancy_id)));
drop policy if exists maintenance_insert on public.maintenance_requests;
create policy maintenance_insert on public.maintenance_requests for insert to authenticated
  with check (public.is_org_member(organization_id)
              or (tenancy_id is not null and public.is_tenancy_participant(tenancy_id)));
drop policy if exists verification_records_insert on public.verification_records;
create policy verification_records_insert on public.verification_records for insert to authenticated
  with check ((tenancy_id is not null and public.is_tenancy_participant(tenancy_id))
              or (organization_id is not null and public.is_org_member(organization_id)));

-- ------------------------------------------- 8. documents.storage_path
-- The storage read policy trusts documents.storage_path, so the row may only
-- point inside its own folder: the organization's (members only), the
-- tenancy's, or the no-file placeholder.
create or replace function public.documents_path_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_actor() then return new; end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path
     and new.tenancy_id is not distinct from old.tenancy_id then
    return new;
  end if;
  if new.storage_path like 'pending-upload/%' then
    return new;
  end if;
  if new.tenancy_id is not null
     and new.storage_path like 'tenancy/' || new.tenancy_id::text || '/%' then
    return new;
  end if;
  if new.storage_path like new.organization_id::text || '/%'
     and public.is_org_member(new.organization_id) then
    return new;
  end if;
  raise exception 'document path is outside this record''s folder' using errcode = '42501';
end $$;
revoke execute on function public.documents_path_guard() from public, anon, authenticated;
drop trigger if exists documents_z_path_guard on public.documents;
-- "z": after documents_scope_guard has settled organization_id
create trigger documents_z_path_guard before insert or update on public.documents
  for each row execute function public.documents_path_guard();

drop policy if exists documents_insert_tenant on storage.objects;
create policy documents_insert_tenant on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and public.storage_tenancy_prefix(name) is not null
              and public.is_tenancy_participant(public.storage_tenancy_prefix(name)));
drop policy if exists documents_read_tenant_own on storage.objects;
create policy documents_read_tenant_own on storage.objects for select to authenticated
  using (bucket_id = 'documents'
         and public.storage_tenancy_prefix(name) is not null
         and public.is_tenancy_participant(public.storage_tenancy_prefix(name)));

-- ---------------------------------------------------------- 9. audit log
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (organization_id is null
         or public.is_org_member(organization_id)
         or exists (select 1 from public.tenancies t
                     where t.organization_id = audit_logs.organization_id
                       and t.tenant_user_id = auth.uid()))
    and (actor_role is distinct from 'admin' or public.has_role(auth.uid(), 'admin'))
  );

-- ------------------------------------------- 10. organizations and money
drop policy if exists org_members_insert on public.organization_members;
create policy org_members_insert on public.organization_members for insert to authenticated
  with check (public.is_org_owner(organization_id));
drop policy if exists org_members_delete on public.organization_members;
create policy org_members_delete on public.organization_members for delete to authenticated
  using (public.is_org_owner(organization_id) or user_id = auth.uid());

drop policy if exists payout_accounts_insert on public.payout_accounts;
create policy payout_accounts_insert on public.payout_accounts for insert to authenticated
  with check (public.is_org_owner(organization_id));
drop policy if exists payout_accounts_update on public.payout_accounts;
create policy payout_accounts_update on public.payout_accounts for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create or replace function public.payout_accounts_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.provider_account_ref ~ '^[0-9]{8,17}$' then
    raise exception 'provider_account_ref must be a provider token, not a bank account number' using errcode = '22023';
  end if;
  if not public.is_platform_actor() then
    if tg_op = 'INSERT' then
      new.status := 'unverified';
      new.verified_at := null;
    else
      if new.organization_id is distinct from old.organization_id then
        raise exception 'a payout account cannot be moved to another organization' using errcode = '42501';
      end if;
      -- where the money goes changed: it has to be verified again
      if new.provider_account_ref is distinct from old.provider_account_ref then
        new.status := 'unverified';
        new.verified_at := null;
      elsif new.status is distinct from old.status and new.status <> 'disabled' then
        raise exception 'payout account status is set by the platform' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.organizations_guard_verification() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_platform_actor() then return new; end if;
  if tg_op = 'UPDATE' then
    if new.verification_status is distinct from old.verification_status then
      raise exception 'verification_status can only be changed by the platform' using errcode = '42501';
    end if;
    if new.is_demo is distinct from old.is_demo then
      raise exception 'is_demo can only be changed by the platform' using errcode = '42501';
    end if;
    if new.stripe_connect_account_id is distinct from old.stripe_connect_account_id then
      raise exception 'the payment provider account is linked by the platform' using errcode = '42501';
    end if;
  else
    if new.verification_status <> 'unverified' then
      new.verification_status := 'unverified';
    end if;
    new.stripe_connect_account_id := null;
  end if;
  return new;
end $$;

-- ------------------------------------------------------ 11. bucket limits
-- Enforced by the storage service itself, whatever the client sends.
-- Keep in step with src/lib/storage.ts.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array[
         'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
         'image/heic', 'image/heif', 'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'documents';

-- ------------------------------------------------- 12. listing public_ref
create or replace function public.listings_write_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prop_org uuid;
  unit_prop uuid;
  candidate text;
begin
  select organization_id into prop_org from public.properties where id = new.property_id;
  if prop_org is null then
    raise exception 'listing references unknown property %', new.property_id using errcode = '23503';
  end if;
  select property_id into unit_prop from public.units where id = new.unit_id;
  if unit_prop is null or unit_prop <> new.property_id then
    raise exception 'unit % does not belong to property %', new.unit_id, new.property_id using errcode = '23503';
  end if;
  if new.organization_id <> prop_org and not exists (
       select 1 from public.management_assignments a
        where a.property_id = new.property_id and a.organization_id = new.organization_id
          and a.authority_status = 'verified' and a.revoked_at is null) then
    raise exception 'organization % has no confirmed authority to list property %', new.organization_id, new.property_id
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.public_ref is distinct from old.public_ref
     and old.public_ref is not null and not public.is_platform_actor() then
    new.public_ref := old.public_ref;
  end if;
  if new.public_ref is null or btrim(new.public_ref) = '' then
    loop
      -- gen_random_uuid() is core Postgres; gen_random_bytes() is pgcrypto,
      -- which hosted Supabase keeps outside this function's search_path.
      candidate := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit when not exists (select 1 from public.listings l where l.public_ref = candidate);
    end loop;
    new.public_ref := candidate;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  -- a view bump (or a no-op update) is not an edit
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'view_count' - 'updated_at') = (to_jsonb(old) - 'view_count' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

-- ------------------------------------- 13. rate limit for public forms
-- check_rate_limit() keys on auth.uid(), which an anonymous form post does not
-- have. Server functions call this one (service role only) with a key they
-- derive themselves, e.g. a hash of the client address. Returns false once
-- the limit is passed; never raises, so the caller decides what to answer.
create or replace function public.check_rate_limit_key(_key text, _limit integer, _window interval default interval '1 hour')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from _window)) * extract(epoch from _window));
  current integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (left(_key, 200), bucket, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into current;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return current <= _limit;
end $$;
revoke execute on function public.check_rate_limit_key(text, integer, interval) from public, anon, authenticated;
grant execute on function public.check_rate_limit_key(text, integer, interval) to service_role;
