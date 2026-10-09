-- Proofs for 20261008000100_access_control_fixes.sql. Each block replays an
-- attack that worked before that migration and asserts it no longer does,
-- then checks the legitimate path next to it still works. Transactional.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'll@acf.rentid',   '{"full_name":"Landlord","role":"landlord"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'tn@acf.rentid',   '{"full_name":"Tenant","role":"tenant"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'evil@acf.rentid', '{"full_name":"Evil","role":"landlord"}'),
  ('00000000-0000-4000-8000-0000000000e4', 'staff@acf.rentid','{"full_name":"Staff","role":"landlord"}');

-- ---------------------------------------------------------------- setup
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"ll@acf.rentid"}';
select public.create_organization('ACF Org', 'landlord') as org \gset
select set_config('acf.org', :'org', true);
insert into public.properties (id, organization_id, name, street_address, city, state, zip)
  values ('10000000-0000-4000-8000-0000000000e1', :'org', 'ACF House', '5 Main', 'SLC', 'UT', '84101');
insert into public.units (id, property_id, name, monthly_rent) values
  ('20000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000e1', 'A', 1500),
  ('20000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000e1', 'B', 2000),
  ('20000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000e1', 'C', 1800);
insert into public.tenancies (id, organization_id, property_id, unit_id, tenant_name, tenant_email, status, monthly_rent) values
  ('50000000-0000-4000-8000-0000000000e1', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e1', 'Tenant', 'tn@acf.rentid', 'pending', 1500),
  ('50000000-0000-4000-8000-0000000000e2', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e2', 'Other', 'other@acf.rentid', 'pending', 2000),
  ('50000000-0000-4000-8000-0000000000e3', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e3', 'Tenant', 'tn@acf.rentid', 'pending', 1800);
insert into public.tenant_invitations (id, organization_id, property_id, unit_id, tenancy_id, email, full_name, token, expires_at, monthly_rent) values
  ('70000000-0000-4000-8000-0000000000e1', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e1', '50000000-0000-4000-8000-0000000000e1', 'tn@acf.rentid', 'Tenant', 'acf-token-revoked-000000000001', now() + interval '7 days', 1500),
  ('70000000-0000-4000-8000-0000000000e3', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e3', '50000000-0000-4000-8000-0000000000e3', 'tn@acf.rentid', 'Tenant', 'acf-token-good-0000000000000003', now() + interval '7 days', 1800),
  ('70000000-0000-4000-8000-0000000000e4', :'org', null, null, null, 'll@acf.rentid', 'Self', 'acf-token-self-0000000000000004', now() + interval '7 days', 900);
-- the landlord revokes the first invitation
update public.tenant_invitations set status = 'revoked' where id = '70000000-0000-4000-8000-0000000000e1';
update public.tenancies set status = 'cancelled' where id = '50000000-0000-4000-8000-0000000000e1';

-- 1c. a member cannot accept their own organization's invitation
do $$
begin
  if (public.accept_invitation('acf-token-self-0000000000000004') ->> 'error') is distinct from 'own_organization' then
    raise exception 'FAIL: an organization member accepted its own invitation';
  end if;
end $$;

-- ------------------------------------- 1a. invitee cannot edit invitation
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","email":"tn@acf.rentid"}';
update public.tenant_invitations set status = 'pending', monthly_rent = 1
 where id = '70000000-0000-4000-8000-0000000000e1';
do $$
declare r jsonb;
begin
  if (select status from public.tenant_invitations where id = '70000000-0000-4000-8000-0000000000e1') <> 'revoked' then
    raise exception 'FAIL: invitee un-revoked an invitation';
  end if;
  r := public.accept_invitation('acf-token-revoked-000000000001');
  if coalesce((r ->> 'ok')::boolean, false) then
    raise exception 'FAIL: a revoked invitation was accepted';
  end if;
end $$;

-- the legitimate accept still works and verifies the tenancy
do $$
declare r jsonb;
begin
  r := public.accept_invitation('acf-token-good-0000000000000003');
  if not coalesce((r ->> 'ok')::boolean, false) then
    raise exception 'FAIL: legitimate invitation not accepted: %', r;
  end if;
  if not (select verified and status = 'active' and tenant_user_id = '00000000-0000-4000-8000-0000000000e2'
            from public.tenancies where id = '50000000-0000-4000-8000-0000000000e3') then
    raise exception 'FAIL: accepted tenancy is not active + verified';
  end if;
end $$;

-- ------------------------------------ 2. tenant cannot edit the tenancy
update public.tenancies set monthly_rent = 1, start_date = '2020-01-01'
 where id = '50000000-0000-4000-8000-0000000000e3';
do $$
begin
  if (select monthly_rent from public.tenancies where id = '50000000-0000-4000-8000-0000000000e3') <> 1800 then
    raise exception 'FAIL: tenant changed their own rent';
  end if;
end $$;

-- ------------------------------------------------------------ 3. reviews
-- a tenant's review is always tenant-to-landlord, whatever they claim
insert into public.reviews (id, tenancy_id, author_id, organization_id, subject_type, subject_user_id, direction, author_name, rating, body)
values ('a0000000-0000-4000-8000-0000000000e1', '50000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e2',
        current_setting('acf.org')::uuid, 'tenant', '00000000-0000-4000-8000-0000000000e2', 'landlord_to_tenant', 'Landlord', 5, 'Best tenant ever');
do $$
begin
  if (select direction from public.reviews where id = 'a0000000-0000-4000-8000-0000000000e1') <> 'tenant_to_landlord' then
    raise exception 'FAIL: tenant posted a landlord-to-tenant review about themselves';
  end if;
end $$;

-- -------------------------------------------- 6. tenant-reported payments
do $$
begin
  begin
    insert into public.payments (organization_id, tenancy_id, amount, status, due_date, paid_at, verification_source)
    values (current_setting('acf.org')::uuid, '50000000-0000-4000-8000-0000000000e3', 0.01, 'paid',
            (date_trunc('month', now()) + interval '1 month')::date, now(), 'tenant_reported');
    raise exception 'FAIL: tenant reported a payment for a future month';
  exception when insufficient_privilege then null;
  end;
end $$;
-- a note for the current month is allowed, but does not replace the charge
insert into public.payments (organization_id, tenancy_id, amount, status, due_date, paid_at, verification_source)
values (current_setting('acf.org')::uuid, '50000000-0000-4000-8000-0000000000e3', 0.01, 'paid', current_date, now(), 'tenant_reported');

-- ---------------------------------------------------------- 5. messages
reset role;
insert into public.conversations (id, organization_id, tenancy_id, subject)
  values ('90000000-0000-4000-8000-0000000000e1', current_setting('acf.org')::uuid, '50000000-0000-4000-8000-0000000000e3', 'Rent');
insert into public.messages (id, conversation_id, sender_id, sender_role, body)
  values ('91000000-0000-4000-8000-0000000000e1', '90000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e1', 'landlord', 'Rent is due on the 1st');
-- with the charge deleted, only the tenant's 1-cent note is left for this month
delete from public.payments where tenancy_id = '50000000-0000-4000-8000-0000000000e3' and verification_source <> 'tenant_reported';
select public._generate_rent_periods('50000000-0000-4000-8000-0000000000e3');
do $$
begin
  if not exists (select 1 from public.payments
                  where tenancy_id = '50000000-0000-4000-8000-0000000000e3'
                    and status in ('scheduled', 'late') and amount = 1800) then
    raise exception 'FAIL: a tenant-reported note suppressed the scheduled rent charge';
  end if;
end $$;
set local role authenticated;
do $$
begin
  begin
    update public.messages set body = 'You may skip rent this month' where id = '91000000-0000-4000-8000-0000000000e1';
    raise exception 'FAIL: tenant rewrote the landlord''s message';
  exception when insufficient_privilege then null;
  end;
end $$;
-- marking it read is still fine
update public.messages set read_at = now() where id = '91000000-0000-4000-8000-0000000000e1';
-- a tenant cannot pose as staff
insert into public.messages (id, conversation_id, sender_id, sender_role, sender_name, body)
  values ('91000000-0000-4000-8000-0000000000e2', '90000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', 'admin', 'RentID Support', 'hi');
do $$
begin
  if (select read_at from public.messages where id = '91000000-0000-4000-8000-0000000000e1') is null then
    raise exception 'FAIL: recipient could not mark a message read';
  end if;
  if (select sender_role from public.messages where id = '91000000-0000-4000-8000-0000000000e2') <> 'tenant' then
    raise exception 'FAIL: tenant chose their own sender role';
  end if;
end $$;

-- the tenant can still open a work order and a conversation on their tenancy
insert into public.maintenance_requests (organization_id, property_id, unit_id, tenancy_id, title, status, priority, created_by)
values (current_setting('acf.org')::uuid, '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e3',
        '50000000-0000-4000-8000-0000000000e3', 'Leak', 'open', 'normal', '00000000-0000-4000-8000-0000000000e2');
-- ...and a document only inside the tenancy folder
insert into public.documents (organization_id, tenancy_id, title, storage_path)
values (current_setting('acf.org')::uuid, '50000000-0000-4000-8000-0000000000e3', 'Photo',
        'tenancy/50000000-0000-4000-8000-0000000000e3/photo.jpg');
do $$
begin
  begin
    insert into public.documents (organization_id, tenancy_id, title, storage_path)
    values (current_setting('acf.org')::uuid, '50000000-0000-4000-8000-0000000000e3', 'Steal',
            current_setting('acf.org') || '/someone-elses-lease.pdf');
    raise exception 'FAIL: tenant pointed a document row at the organization folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------- outsider (another org)
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated","email":"evil@acf.rentid"}';
select public.create_organization('Evil Org', 'landlord') as eorg \gset
select set_config('acf.eorg', :'eorg', true);

-- 3b. landlord-to-tenant reviews are not world-readable
reset role;
select set_config('rentid.trusted_write', 'on', true);
insert into public.reviews (tenancy_id, author_id, organization_id, subject_type, subject_user_id, direction, author_name, rating, body)
values ('50000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e1', current_setting('acf.org')::uuid,
        'tenant', '00000000-0000-4000-8000-0000000000e2', 'landlord_to_tenant', 'Landlord', 2, 'Private assessment');
select set_config('rentid.trusted_write', 'off', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.reviews where direction = 'landlord_to_tenant') then
    raise exception 'FAIL: a stranger can read a review about a tenant';
  end if;
  if not exists (select 1 from public.reviews where direction = 'tenant_to_landlord') then
    raise exception 'FAIL: the landlord''s public reviews are no longer readable';
  end if;
end $$;

-- 1b. cannot aim an invitation at another organization's tenancy / unit
do $$
begin
  begin
    insert into public.tenant_invitations (organization_id, tenancy_id, email, full_name, token, expires_at)
    values (current_setting('acf.eorg')::uuid, '50000000-0000-4000-8000-0000000000e2', 'evil@acf.rentid', 'Evil',
            'acf-token-evil-0000000000000009', now() + interval '7 days');
    raise exception 'FAIL: invitation created against another organization''s tenancy';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tenant_invitations (organization_id, unit_id, email, full_name, token, expires_at)
    values (current_setting('acf.eorg')::uuid, '20000000-0000-4000-8000-0000000000e2', 'evil@acf.rentid', 'Evil',
            'acf-token-evil-0000000000000010', now() + interval '7 days');
    raise exception 'FAIL: invitation created against another organization''s unit';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 7. cannot open a conversation / work order / document in another org's inbox
do $$
begin
  begin
    insert into public.conversations (organization_id, tenancy_id, subject)
    values (current_setting('acf.org')::uuid, '50000000-0000-4000-8000-0000000000e3', 'RentID Support');
    raise exception 'FAIL: stranger opened a conversation in another organization';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.maintenance_requests (organization_id, tenancy_id, title, status, priority)
    values (current_setting('acf.org')::uuid, null, 'Planted', 'open', 'normal');
    raise exception 'FAIL: stranger opened a work order in another organization';
  exception when insufficient_privilege then null;
  end;
  -- 9. ...or write into its audit trail
  begin
    insert into public.audit_logs (organization_id, actor_id, action, entity_type)
    values (current_setting('acf.org')::uuid, '00000000-0000-4000-8000-0000000000e3', 'forged', 'x');
    raise exception 'FAIL: stranger wrote into another organization''s audit log';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_logs (organization_id, actor_id, actor_role, action, entity_type)
    values (current_setting('acf.eorg')::uuid, '00000000-0000-4000-8000-0000000000e3', 'admin', 'forged', 'x');
    raise exception 'FAIL: non-admin wrote an audit entry as admin';
  exception when insufficient_privilege then null;
  end;
  -- 10. the owner cannot flag their own org as demo
  begin
    update public.organizations set is_demo = true where id = current_setting('acf.eorg')::uuid;
    raise exception 'FAIL: owner set is_demo';
  exception when insufficient_privilege then null;
  end;
end $$;
-- own audit trail still works
insert into public.audit_logs (organization_id, actor_id, actor_role, action, entity_type)
values (current_setting('acf.eorg')::uuid, '00000000-0000-4000-8000-0000000000e3', 'landlord', 'ok', 'x');

-- 4. passport: a tenancy another org invents with the victim's e-mail adds nothing
reset role;
insert into public.properties (id, organization_id, name, street_address, city, state, zip)
  values ('10000000-0000-4000-8000-0000000000e9', current_setting('acf.eorg')::uuid, 'Evil House', '6 Main', 'SLC', 'UT', '84101');
insert into public.units (id, property_id, name, monthly_rent) values ('20000000-0000-4000-8000-0000000000e9', '10000000-0000-4000-8000-0000000000e9', 'Z', 9999);
insert into public.tenancies (id, organization_id, property_id, unit_id, tenant_name, tenant_email, status, monthly_rent)
  values ('50000000-0000-4000-8000-0000000000e9', current_setting('acf.eorg')::uuid, '10000000-0000-4000-8000-0000000000e9', '20000000-0000-4000-8000-0000000000e9', 'Tenant', 'tn@acf.rentid', 'active', 9999);
insert into public.payments (organization_id, tenancy_id, amount, status, due_date, verification_source)
  values (current_setting('acf.eorg')::uuid, '50000000-0000-4000-8000-0000000000e9', 9999, 'late', current_date - 60, 'landlord_reported');
do $$
declare s jsonb := public.tenant_passport_snapshot('00000000-0000-4000-8000-0000000000e2', 'tn@acf.rentid');
begin
  if (s ->> 'verified_tenancies')::int <> 1 then
    raise exception 'FAIL: passport counts % verified tenancies, expected 1', s ->> 'verified_tenancies';
  end if;
  if (s ->> 'late_payments')::int <> (select count(*) from public.payments
                                        where tenancy_id = '50000000-0000-4000-8000-0000000000e3' and status = 'late')
     or (s ->> 'average_rent')::numeric <> 1800 then
    raise exception 'FAIL: an unaccepted tenancy leaked into the passport: %', s;
  end if;
  if jsonb_array_length(s -> 'reviews') <> 1 then
    raise exception 'FAIL: passport should carry exactly the real landlord review, got %', s -> 'reviews';
  end if;
end $$;

-- 10. a non-owner member cannot add members or repoint a payout account
insert into public.organization_members (organization_id, user_id, role)
  values (current_setting('acf.org')::uuid, '00000000-0000-4000-8000-0000000000e4', 'landlord');
insert into public.payout_accounts (id, organization_id, provider, provider_account_ref, status)
  values ('b0000000-0000-4000-8000-0000000000e1', current_setting('acf.org')::uuid, 'column', 'acct_tok_original', 'verified');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e4","role":"authenticated","email":"staff@acf.rentid"}';
update public.payout_accounts set provider_account_ref = 'acct_tok_attacker' where id = 'b0000000-0000-4000-8000-0000000000e1';
do $$
begin
  if (select provider_account_ref from public.payout_accounts where id = 'b0000000-0000-4000-8000-0000000000e1') <> 'acct_tok_original' then
    raise exception 'FAIL: a non-owner member repointed the payout account';
  end if;
  begin
    insert into public.organization_members (organization_id, user_id, role)
    values (current_setting('acf.org')::uuid, '00000000-0000-4000-8000-0000000000e3', 'landlord');
    raise exception 'FAIL: a non-owner member added a member';
  exception when insufficient_privilege then null;
  end;
end $$;
-- the owner can, and the account goes back to unverified
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"ll@acf.rentid"}';
update public.payout_accounts set provider_account_ref = 'acct_tok_new' where id = 'b0000000-0000-4000-8000-0000000000e1';
do $$
begin
  if (select status::text from public.payout_accounts where id = 'b0000000-0000-4000-8000-0000000000e1') <> 'unverified' then
    raise exception 'FAIL: a changed payout reference stayed verified';
  end if;
end $$;

-- 11. the bucket carries server-side limits
reset role;
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'documents'
                  and file_size_limit = 26214400 and array_length(allowed_mime_types, 1) > 0) then
    raise exception 'FAIL: documents bucket has no size / type limit';
  end if;
end $$;

rollback;
