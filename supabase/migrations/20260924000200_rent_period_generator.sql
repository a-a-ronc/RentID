-- Rent periods: generate every month, not just the first.
--
-- Until now the only rent period a tenancy ever got was the one
-- accept_invitation() seeds for the month the tenant accepts. From the second
-- month on, nothing was due, nothing could be late, and the ledger a future
-- landlord reads went quiet. That is the product's core record, so it gets a
-- generator.
--
-- Design:
--   * Lazy and idempotent. The app calls it when a ledger is opened (landlord
--     payments/dashboard, tenant home/pay). Calling it twice in a row inserts
--     nothing the second time. No cron job to schedule, monitor or forget —
--     and when one is wanted, it can simply call the same function.
--   * One period per calendar month, keyed on the month of due_date, so a
--     payment the landlord already recorded by hand for that month counts and
--     is never duplicated, whatever day it was dated.
--   * Never backfills before the tenancy entered RentID. A landlord onboarding
--     a tenant who moved in three years ago should not open a ledger with
--     thirty-six "late" rows; history before RentID is recorded, not invented.
--   * Stops at the tenancy's end date, and only runs for active tenancies.
--   * A scheduled period more than GRACE_DAYS past due becomes 'late'. Only
--     unverified/reported rows are touched — platform-settled history is
--     immutable (payments_enforce_verification would refuse anyway).

create or replace function public._generate_rent_periods(_tenancy_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

  -- Day 29-31 doesn't exist every month; clamp like accept_invitation does.
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

revoke execute on function public._generate_rent_periods(uuid) from public, anon, authenticated;

-- Landlord / manager side: every active tenancy in an organization the caller
-- belongs to.
create or replace function public.ensure_rent_periods(_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  total integer := 0;
begin
  if auth.uid() is null or not public.is_org_member(_org_id) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  for r in
    select id from public.tenancies
     where organization_id = _org_id and status = 'active' and deleted_at is null
  loop
    total := total + public._generate_rent_periods(r.id);
  end loop;
  return total;
end $$;

revoke execute on function public.ensure_rent_periods(uuid) from public, anon;
grant execute on function public.ensure_rent_periods(uuid) to authenticated;

-- Tenant side: the caller's own active tenancies.
create or replace function public.ensure_my_rent_periods()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  total integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  for r in
    select id from public.tenancies
     where tenant_user_id = auth.uid() and status = 'active' and deleted_at is null
  loop
    total := total + public._generate_rent_periods(r.id);
  end loop;
  return total;
end $$;

revoke execute on function public.ensure_my_rent_periods() from public, anon;
grant execute on function public.ensure_my_rent_periods() to authenticated;
