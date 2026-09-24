-- Revoking an invitation: the landlord can revoke it and cancel the pending
-- tenancy it created; the link then no longer accepts. Mirrors
-- services/tenancies.revokeInvitation(). Transactional, rolls back.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000d1', 'll@revoke.rentid', '{"full_name":"Landlord","role":"landlord"}'),
  ('00000000-0000-4000-8000-0000000000d2', 'tn@revoke.rentid', '{"full_name":"Tenant","role":"tenant"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated","email":"ll@revoke.rentid"}';
select public.create_organization('Revoke Org', 'landlord') as org \gset
insert into public.properties (id, organization_id, name, street_address, city, state, zip)
  values ('10000000-0000-4000-8000-0000000000d1', :'org', 'Revoke House', '5 Main', 'SLC', 'UT', '84101');
insert into public.units (id, property_id, name, monthly_rent)
  values ('20000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'A', 1500);
insert into public.tenancies (id, organization_id, property_id, unit_id, tenant_name, tenant_email, status, monthly_rent)
  values ('50000000-0000-4000-8000-0000000000d1', :'org', '10000000-0000-4000-8000-0000000000d1',
          '20000000-0000-4000-8000-0000000000d1', 'Tenant', 'tn@revoke.rentid', 'pending', 1500);
insert into public.tenant_invitations (id, organization_id, property_id, unit_id, tenancy_id, email, full_name, token, expires_at)
  values ('70000000-0000-4000-8000-0000000000d1', :'org', '10000000-0000-4000-8000-0000000000d1',
          '20000000-0000-4000-8000-0000000000d1', '50000000-0000-4000-8000-0000000000d1',
          'tn@revoke.rentid', 'Tenant', 'revoke-test-token', now() + interval '7 days');

-- what revokeInvitation() does
update public.tenant_invitations set status = 'revoked'
 where id = '70000000-0000-4000-8000-0000000000d1' and status = 'pending';
update public.tenancies set status = 'cancelled'
 where id = '50000000-0000-4000-8000-0000000000d1' and status = 'pending';

do $$
begin
  if (select status from public.tenant_invitations where id = '70000000-0000-4000-8000-0000000000d1') <> 'revoked' then
    raise exception 'FAIL: landlord could not revoke the invitation';
  end if;
  if (select status from public.tenancies where id = '50000000-0000-4000-8000-0000000000d1') <> 'cancelled' then
    raise exception 'FAIL: landlord could not cancel the pending tenancy';
  end if;
end $$;

-- the invited tenant tries the link anyway
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated","email":"tn@revoke.rentid"}';
do $$
declare result jsonb;
begin
  result := public.accept_invitation('revoke-test-token');
  if coalesce((result ->> 'ok')::boolean, false) then
    raise exception 'FAIL: a revoked invitation was accepted';
  end if;
  if exists (select 1 from public.tenancies
              where id = '50000000-0000-4000-8000-0000000000d1' and tenant_user_id is not null) then
    raise exception 'FAIL: the revoked tenancy was attached to the tenant';
  end if;
end $$;

rollback;
