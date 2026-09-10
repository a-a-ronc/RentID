-- =====================================================================
-- RentID — proposed schema (NOT YET APPLIED)
--
-- Review target. Apply through the migration tool once the backend is
-- reachable; this file is the source of truth for that migration.
-- Conventions: uuid primary keys, created_at/updated_at on every mutable
-- table, soft deletion (deleted_at) where history matters, constrained
-- status values via enums, indexes on every foreign key used for filtering.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ------------------------------- enums -------------------------------
create type public.app_role as enum ('landlord', 'tenant', 'property_manager', 'admin');
create type public.org_member_role as enum ('owner', 'manager', 'staff');
create type public.property_type as enum ('single_family', 'multi_family', 'condo', 'townhouse', 'apartment');
create type public.occupancy_status as enum ('vacant', 'occupied', 'off_market');
create type public.tenancy_status as enum ('pending', 'active', 'ended', 'cancelled');
create type public.lease_status as enum ('draft', 'active', 'expiring', 'ended', 'terminated');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.document_kind as enum ('lease', 'addendum', 'id_verification', 'inspection', 'receipt', 'notice', 'other');
create type public.payment_status as enum ('scheduled', 'pending', 'paid', 'late', 'failed', 'refunded');
create type public.payment_method as enum ('manual', 'ach', 'card', 'cash', 'check');
create type public.payment_cadence as enum ('monthly', 'weekly', 'biweekly');
create type public.maintenance_status as enum ('open', 'acknowledged', 'in_progress', 'completed', 'cancelled');
create type public.maintenance_priority as enum ('low', 'normal', 'high', 'emergency');
create type public.review_direction as enum ('landlord_to_tenant', 'tenant_to_landlord');
create type public.review_status as enum ('published', 'under_dispute', 'withdrawn');
create type public.dispute_status as enum ('open', 'resolved', 'rejected');
create type public.verification_kind as enum ('tenancy', 'payment', 'identity', 'lease_document', 'landlord_reported', 'tenant_reported');
create type public.verification_source as enum ('platform', 'landlord', 'tenant');
create type public.notification_kind as enum ('payment', 'maintenance', 'lease', 'invitation', 'message', 'system');

-- --------------------------- shared triggers -------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------ profiles -----------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- --------------------------- roles (separate) ------------------------
-- Roles NEVER live on profiles: that would enable privilege escalation.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- --------------------------- organizations ---------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_entity_name text,
  owner_id uuid references auth.users(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select, insert, update on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;
create index organizations_owner_id_idx on public.organizations(owner_id);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
alter table public.organization_members enable row level security;
create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_members_organization_id_idx on public.organization_members(organization_id);

-- Membership helper (security definer so member policies never recurse).
create or replace function public.is_org_member(_org_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = _org_id and user_id = _user_id
  ) or exists (
    select 1 from public.organizations
    where id = _org_id and owner_id = _user_id
  )
$$;

-- Tenant-side helper: is this user the tenant on this tenancy?
create or replace function public.is_tenancy_tenant(_tenancy_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenancies
    where id = _tenancy_id and tenant_user_id = _user_id
  )
$$;

-- ---------------------------- properties -----------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  property_type public.property_type not null default 'single_family',
  street_address text not null,
  unit_label text,
  city text not null,
  state text not null,
  zip text not null,
  year_built integer check (year_built is null or (year_built between 1700 and 2100)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;
alter table public.properties enable row level security;
create index properties_organization_id_idx on public.properties(organization_id);
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(3,1) check (bathrooms is null or bathrooms >= 0),
  square_feet integer check (square_feet is null or square_feet > 0),
  monthly_rent numeric(12,2) check (monthly_rent is null or monthly_rent >= 0),
  security_deposit numeric(12,2) check (security_deposit is null or security_deposit >= 0),
  rent_due_day smallint not null default 1 check (rent_due_day between 1 and 28),
  occupancy_status public.occupancy_status not null default 'vacant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (property_id, name)
);
grant select, insert, update, delete on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;
create index units_property_id_idx on public.units(property_id);
create index units_organization_id_idx on public.units(organization_id);
create trigger units_updated_at before update on public.units
  for each row execute function public.set_updated_at();

-- ----------------------------- tenancies -----------------------------
create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  tenant_user_id uuid references auth.users(id) on delete set null,
  tenant_name text not null,
  tenant_email text,
  tenant_phone text,
  status public.tenancy_status not null default 'pending',
  verified boolean not null default false,
  verified_at timestamptz,
  start_date date,
  end_date date,
  monthly_rent numeric(12,2) check (monthly_rent is null or monthly_rent >= 0),
  security_deposit numeric(12,2) check (security_deposit is null or security_deposit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select, insert, update, delete on public.tenancies to authenticated;
grant all on public.tenancies to service_role;
alter table public.tenancies enable row level security;
create index tenancies_organization_id_idx on public.tenancies(organization_id);
create index tenancies_unit_id_idx on public.tenancies(unit_id);
create index tenancies_tenant_user_id_idx on public.tenancies(tenant_user_id);
create trigger tenancies_updated_at before update on public.tenancies
  for each row execute function public.set_updated_at();

-- Time-dependent validation belongs in a trigger, not a CHECK constraint.
create or replace function public.validate_tenancy_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.end_date is not null and new.start_date is not null and new.end_date < new.start_date then
    raise exception 'end_date must be on or after start_date';
  end if;
  return new;
end;
$$;
create trigger tenancies_validate_dates before insert or update on public.tenancies
  for each row execute function public.validate_tenancy_dates();

-- ------------------------------- leases ------------------------------
create table public.leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  status public.lease_status not null default 'draft',
  start_date date not null,
  end_date date not null,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  security_deposit numeric(12,2) check (security_deposit is null or security_deposit >= 0),
  rent_due_day smallint not null default 1 check (rent_due_day between 1 and 28),
  late_fee numeric(12,2) check (late_fee is null or late_fee >= 0),
  document_id uuid,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select, insert, update, delete on public.leases to authenticated;
grant all on public.leases to service_role;
alter table public.leases enable row level security;
create index leases_tenancy_id_idx on public.leases(tenancy_id);
create index leases_organization_id_idx on public.leases(organization_id);
create index leases_end_date_idx on public.leases(end_date);
create trigger leases_updated_at before update on public.leases
  for each row execute function public.set_updated_at();

-- ------------------------- tenant invitations ------------------------
create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  tenancy_id uuid references public.tenancies(id) on delete set null,
  email text not null,
  invited_name text,
  status public.invitation_status not null default 'pending',
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);
grant select, insert, update on public.tenant_invitations to authenticated;
grant all on public.tenant_invitations to service_role;
alter table public.tenant_invitations enable row level security;
create index tenant_invitations_email_idx on public.tenant_invitations(lower(email));
create index tenant_invitations_organization_id_idx on public.tenant_invitations(organization_id);
create trigger tenant_invitations_updated_at before update on public.tenant_invitations
  for each row execute function public.set_updated_at();

-- ----------------------------- documents -----------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  tenancy_id uuid references public.tenancies(id) on delete set null,
  kind public.document_kind not null default 'other',
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  visible_to_tenant boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create index documents_tenancy_id_idx on public.documents(tenancy_id);
create index documents_organization_id_idx on public.documents(organization_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.leases
  add constraint leases_document_id_fkey
  foreign key (document_id) references public.documents(id) on delete set null;

-- ------------------------------ payments -----------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status public.payment_status not null default 'scheduled',
  method public.payment_method not null default 'manual',
  due_date date not null,
  paid_at timestamptz,
  period_label text not null,
  verified boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create index payments_tenancy_id_idx on public.payments(tenancy_id);
create index payments_organization_id_idx on public.payments(organization_id);
create index payments_due_date_idx on public.payments(due_date);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payment_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  cadence public.payment_cadence not null default 'monthly',
  due_day smallint not null default 1 check (due_day between 1 and 28),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.payment_schedules to authenticated;
grant all on public.payment_schedules to service_role;
alter table public.payment_schedules enable row level security;
create index payment_schedules_tenancy_id_idx on public.payment_schedules(tenancy_id);
create trigger payment_schedules_updated_at before update on public.payment_schedules
  for each row execute function public.set_updated_at();

-- --------------------------- maintenance -----------------------------
create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  tenancy_id uuid references public.tenancies(id) on delete set null,
  title text not null,
  description text,
  status public.maintenance_status not null default 'open',
  priority public.maintenance_priority not null default 'normal',
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.maintenance_requests to authenticated;
grant all on public.maintenance_requests to service_role;
alter table public.maintenance_requests enable row level security;
create index maintenance_requests_tenancy_id_idx on public.maintenance_requests(tenancy_id);
create index maintenance_requests_organization_id_idx on public.maintenance_requests(organization_id);
create trigger maintenance_requests_updated_at before update on public.maintenance_requests
  for each row execute function public.set_updated_at();

-- ---------------------------- messaging ------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenancy_id uuid references public.tenancies(id) on delete set null,
  subject text not null default 'Conversation',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create index conversations_organization_id_idx on public.conversations(organization_id);
create index conversations_tenancy_id_idx on public.conversations(tenancy_id);
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  sender_role public.app_role not null,
  body text not null check (length(btrim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create index messages_conversation_id_idx on public.messages(conversation_id);

-- --------------------- reviews & disputes (UI only) ------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  direction public.review_direction not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null,
  status public.review_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, direction, author_id)
);
grant select, insert, update on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create index reviews_tenancy_id_idx on public.reviews(tenancy_id);
create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.review_disputes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  raised_by uuid references auth.users(id) on delete set null,
  reason text not null,
  status public.dispute_status not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.review_disputes to authenticated;
grant all on public.review_disputes to service_role;
alter table public.review_disputes enable row level security;
create index review_disputes_review_id_idx on public.review_disputes(review_id);
create trigger review_disputes_updated_at before update on public.review_disputes
  for each row execute function public.set_updated_at();

-- ------------------------ verification records -----------------------
create table public.verification_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenancy_id uuid references public.tenancies(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  kind public.verification_kind not null,
  verified_by uuid references auth.users(id) on delete set null,
  source public.verification_source not null default 'platform',
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert on public.verification_records to authenticated;
grant all on public.verification_records to service_role;
alter table public.verification_records enable row level security;
create index verification_records_tenancy_id_idx on public.verification_records(tenancy_id);

-- --------------------------- notifications ---------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  kind public.notification_kind not null default 'system',
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create index notifications_user_id_idx on public.notifications(user_id);

-- ----------------------------- audit logs ----------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
-- Audit rows are written server-side only and read by admins.
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create index audit_logs_organization_id_idx on public.audit_logs(organization_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- ------------------- profile bootstrap on signup ---------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
-- Trigger creation on auth.users is handled by the platform integration.

-- =====================================================================
-- Marketplace, ownership and management authority (business map §7-§9)
-- Review only — not applied until the backend is reachable.
-- =====================================================================

-- Organizations are either landlord-operated or a property-management company,
-- and each carries its own verification state (badges/listings gate on it).
alter table public.organizations
  add column if not exists kind text not null default 'landlord'
    check (kind in ('landlord', 'property_manager')),
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));

-- ------------------------------ owner_accounts ------------------------
-- The owners a property-management company works for. Ownership is recorded
-- separately from management authority so an owner can change managers
-- without losing property, lease or payment history.
create table if not exists public.owner_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  contract_start date,
  management_fee_pct numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.owner_accounts to authenticated;
grant all on public.owner_accounts to service_role;
alter table public.owner_accounts enable row level security;
create index if not exists owner_accounts_organization_id_idx on public.owner_accounts(organization_id);

-- -------------------------- management_assignments --------------------
-- Owner-granted authority for a PM organization to operate a property.
-- Starts 'pending'; badges, listings and payout changes stay locked until
-- the owner confirms it.
create table if not exists public.management_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  authority_status text not null default 'pending'
    check (authority_status in ('pending', 'verified', 'disputed', 'revoked')),
  authorized_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, property_id)
);
grant select, insert, update on public.management_assignments to authenticated;
grant all on public.management_assignments to service_role;
alter table public.management_assignments enable row level security;
create index if not exists management_assignments_org_idx on public.management_assignments(organization_id);
create index if not exists management_assignments_property_idx on public.management_assignments(property_id);

-- --------------------------------- listings ---------------------------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  headline text not null,
  description text,
  monthly_rent numeric(12,2) not null,
  security_deposit numeric(12,2),
  available_on date not null,
  lease_term_months integer not null default 12,
  amenities text[] not null default '{}',
  photo_urls text[] not null default '{}',
  requires_rentid_profile boolean not null default true,
  syndicated_to text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'paused', 'leased', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select on public.listings to anon;            -- published listings are public
grant select, insert, update, delete on public.listings to authenticated;
grant all on public.listings to service_role;
alter table public.listings enable row level security;
create index if not exists listings_status_idx on public.listings(status);
create index if not exists listings_organization_id_idx on public.listings(organization_id);

-- ---------------------------- rental_applications ---------------------
create table if not exists public.rental_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  applicant_user_id uuid references auth.users(id) on delete set null,
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  monthly_income numeric(12,2),
  move_in_date date,
  note text,
  shares_rentid_profile boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'in_review', 'approved', 'denied', 'withdrawn')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.rental_applications to authenticated;
grant all on public.rental_applications to service_role;
alter table public.rental_applications enable row level security;
create index if not exists rental_applications_listing_idx on public.rental_applications(listing_id);
create index if not exists rental_applications_applicant_idx on public.rental_applications(applicant_user_id);

create trigger owner_accounts_touch before update on public.owner_accounts
  for each row execute function public.touch_updated_at();
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();
create trigger rental_applications_touch before update on public.rental_applications
  for each row execute function public.touch_updated_at();
