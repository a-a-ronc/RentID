-- Rent period generator: one period per month, idempotent, no pre-RentID
-- backfill, respects end dates and hand-recorded months, flips overdue to late,
-- and only runs for callers entitled to the ledger. Transactional, rolls back.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e1', 'll@gen.rentid', '{"full_name":"Landlord","role":"landlord"}'),
  ('00000000-0000-4000-8000-0000000000e2', 'tn@gen.rentid', '{"full_name":"Tenant","role":"tenant"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'nosy@gen.rentid', '{"full_name":"Stranger","role":"landlord"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"ll@gen.rentid"}';
select public.create_organization('Gen Org', 'landlord') as org \gset
insert into public.properties (id, organization_id, name, street_address, city, state, zip)
  values ('10000000-0000-4000-8000-0000000000e1', :'org', 'Gen House', '9 Main', 'SLC', 'UT', '84101');
insert into public.units (id, property_id, name, monthly_rent, rent_due_day) values
  ('20000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000e1', 'A', 1500, 3),
  ('20000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000e1', 'B', 1200, 31),
  ('20000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000e1', 'C', 900, 1);

-- A: active, moved in 3 years ago, entered into RentID 4 months ago
-- B: active, entered 3 months ago, lease ended last month
-- C: pending (not yet accepted) — must get nothing
insert into public.tenancies (id, organization_id, property_id, unit_id, tenant_user_id, tenant_name, status, monthly_rent, start_date, end_date) values
  ('50000000-0000-4000-8000-0000000000e1', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e1',
   '00000000-0000-4000-8000-0000000000e2', 'Tenant A', 'active', null, (current_date - interval '3 years')::date, null),
  ('50000000-0000-4000-8000-0000000000e2', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e2',
   null, 'Tenant B', 'active', 1250, (current_date - interval '3 months')::date,
   (date_trunc('month', current_date) - interval '1 day')::date),
  ('50000000-0000-4000-8000-0000000000e3', :'org', '10000000-0000-4000-8000-0000000000e1', '20000000-0000-4000-8000-0000000000e3',
   null, 'Tenant C', 'pending', 900, current_date, null);

-- Backdate when the tenancies entered RentID (not client-settable in practice).
reset role;
update public.tenancies set created_at = now() - interval '4 months' where id = '50000000-0000-4000-8000-0000000000e1';
update public.tenancies set created_at = now() - interval '3 months' where id = '50000000-0000-4000-8000-0000000000e2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"ll@gen.rentid"}';

-- The landlord already recorded A's rent for two months ago, dated the 10th.
insert into public.payments (organization_id, tenancy_id, amount, status, method, due_date, period_label, verification_source)
  values (:'org', '50000000-0000-4000-8000-0000000000e1', 1500, 'paid', 'check',
          (date_trunc('month', current_date) - interval '2 months')::date + 9, 'recorded', 'landlord_reported');

-- ------------------------------------------------------------- generate
select public.ensure_rent_periods(:'org') as first_run \gset
select public.ensure_rent_periods(:'org') as second_run \gset

do $$
declare
  a_count int; b_count int; c_count int; a_dupes int;
  b_last date; a_due_day int; b_due_day int; a_amount numeric; b_amount numeric;
begin
  -- A: months (-4 .. 0) = 5 periods, one of which was hand-recorded
  select count(*) into a_count from public.payments where tenancy_id = '50000000-0000-4000-8000-0000000000e1';
  if a_count <> 5 then raise exception 'FAIL: tenancy A should have 5 periods, has %', a_count; end if;

  select count(*) - count(distinct date_trunc('month', due_date)) into a_dupes
    from public.payments where tenancy_id = '50000000-0000-4000-8000-0000000000e1';
  if a_dupes <> 0 then raise exception 'FAIL: tenancy A has duplicate months'; end if;

  -- B: months (-3 .. -1), stops at the end date
  select count(*), max(due_date) into b_count, b_last from public.payments where tenancy_id = '50000000-0000-4000-8000-0000000000e2';
  if b_count <> 3 then raise exception 'FAIL: tenancy B should have 3 periods, has %', b_count; end if;
  if b_last >= date_trunc('month', current_date)::date then
    raise exception 'FAIL: tenancy B got a period after its end date';
  end if;

  -- C: pending tenancy gets nothing
  select count(*) into c_count from public.payments where tenancy_id = '50000000-0000-4000-8000-0000000000e3';
  if c_count <> 0 then raise exception 'FAIL: a pending tenancy got rent periods'; end if;

  -- due day comes from the unit, clamped to 28; amount prefers the tenancy's rent
  select extract(day from due_date)::int, amount into a_due_day, a_amount from public.payments
   where tenancy_id = '50000000-0000-4000-8000-0000000000e1' and verification_source = 'unverified' limit 1;
  select extract(day from due_date)::int, amount into b_due_day, b_amount from public.payments
   where tenancy_id = '50000000-0000-4000-8000-0000000000e2' limit 1;
  if a_due_day <> 3 then raise exception 'FAIL: due day should be 3, got %', a_due_day; end if;
  if b_due_day <> 28 then raise exception 'FAIL: due day 31 should clamp to 28, got %', b_due_day; end if;
  if a_amount <> 1500 then raise exception 'FAIL: A should fall back to unit rent 1500, got %', a_amount; end if;
  if b_amount <> 1250 then raise exception 'FAIL: B should use tenancy rent 1250, got %', b_amount; end if;

  -- overdue generated periods are late; the hand-recorded paid one is untouched
  if exists (select 1 from public.payments
              where tenancy_id = '50000000-0000-4000-8000-0000000000e2'
                and due_date < current_date - 5 and status <> 'late') then
    raise exception 'FAIL: B''s past months should all be late';
  end if;
  if (select status from public.payments where period_label = 'recorded') <> 'paid' then
    raise exception 'FAIL: a recorded payment was modified';
  end if;
end $$;

select :first_run::int = 7 as first_run_ok, :second_run::int = 0 as idempotent \gset
\if :first_run_ok
\else
  \echo 'FAIL: first run should insert 7 periods'
  select 1/0;
\endif
\if :idempotent
\else
  \echo 'FAIL: second run inserted rows'
  select 1/0;
\endif

-- ------------------------------------------------------------ the tenant
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","email":"tn@gen.rentid"}';
do $$
begin
  if public.ensure_my_rent_periods() <> 0 then
    raise exception 'FAIL: tenant run should find nothing new';
  end if;
  -- a tenant may not run the organization-wide generator
  begin
    perform public.ensure_rent_periods((select organization_id from public.tenancies
                                         where id = '50000000-0000-4000-8000-0000000000e1'));
    raise exception 'FAIL: tenant ran the org generator';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ----------------------------------------------------------- the stranger
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated","email":"nosy@gen.rentid"}';
do $$
begin
  begin
    perform public.ensure_rent_periods('00000000-0000-0000-0000-000000000000'::uuid);
    raise exception 'FAIL: stranger ran the generator for another org';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._generate_rent_periods('50000000-0000-4000-8000-0000000000e1');
    raise exception 'FAIL: the internal generator is callable by clients';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------- anonymous
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform public.ensure_my_rent_periods();
    raise exception 'FAIL: anon can call ensure_my_rent_periods';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
