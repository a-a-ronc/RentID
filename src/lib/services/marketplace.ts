/**
 * Marketplace: listings, applications and the public verified profiles that
 * make them trustworthy (business map §8, §16, §17).
 *
 * Mock-backed but Supabase-shaped — the UI never touches the mock db.
 */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import {
  buildPipeline,
  channelsFor,
  ensureChannels,
  propagateListingChange,
  withdrawEverywhere,
} from "@/lib/services/syndication";
import type {
  ApplicationStatus,
  ApplicationWithContext,
  Listing,
  LeadSource,
  ListingStatus,
  ListingWithContext,
  ProviderProfile,
  RentalApplication,
  Review,
  TenantPassport,
  UUID,
} from "@/lib/types";

const alive = <T extends { deleted_at: string | null }>(row: T) => row.deleted_at === null;

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function hoursBetween(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

/* --------------------------- provider profiles ---------------------------- */

/**
 * Public landlord / property-manager profile. Every number derives from a
 * verified relationship or a source event — no invented scores.
 */
export async function getProviderProfile(orgId: UUID | null): Promise<ProviderProfile | null> {
  if (!orgId) return null;
  return latency(clone(buildProviderProfile(orgId)));
}

export function buildProviderProfile(orgId: UUID): ProviderProfile | null {
  const db = getDb();
  const org = db.organizations.find((o) => o.id === orgId);
  if (!org) return null;

  const managedPropertyIds =
    org.kind === "property_manager"
      ? new Set(
          db.management_assignments
            .filter((m) => m.organization_id === orgId && m.revoked_at === null)
            .map((m) => m.property_id),
        )
      : new Set(db.properties.filter(alive).filter((p) => p.organization_id === orgId).map((p) => p.id));

  const units = db.units.filter(alive).filter((u) => managedPropertyIds.has(u.property_id));
  const requests = db.maintenance_requests.filter((m) => managedPropertyIds.has(m.property_id));

  const firstResponses = requests
    .filter((m) => m.status !== "open")
    .map((m) => hoursBetween(m.created_at, m.updated_at));
  const completed = requests.filter((m) => m.completed_at);
  const under72 = completed.filter((m) => hoursBetween(m.created_at, m.completed_at!) <= 72);

  const dueThisMonth = db.payments.filter(
    (p) =>
      p.due_date.slice(0, 7) === new Date().toISOString().slice(0, 7) &&
      db.tenancies.some((t) => t.id === p.tenancy_id && managedPropertyIds.has(t.property_id)),
  );
  const collected = dueThisMonth.filter((p) => p.status === "paid");

  const reviews = db.reviews
    .filter((r) => r.organization_id === orgId && r.status === "published")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const tenantReviews = reviews.filter((r) => r.direction === "tenant_to_landlord");
  const ownerReviews = reviews.filter((r) => r.direction === "landlord_to_tenant");

  const tenantRating = average(tenantReviews.map((r) => r.rating));
  const ownerRating = average(ownerReviews.map((r) => r.rating));

  return {
    organization_id: org.id,
    name: org.name,
    kind: org.kind,
    verification_status: org.verification_status,
    verified_properties: managedPropertyIds.size,
    verified_units: units.length,
    owners_served:
      org.kind === "property_manager"
        ? db.owner_accounts.filter((o) => o.organization_id === orgId).length
        : 1,
    median_first_response_hours: Math.round(median(firstResponses) * 10) / 10,
    resolved_under_72h_pct:
      completed.length === 0 ? 0 : Math.round((under72.length / completed.length) * 100),
    collection_rate_pct:
      dueThisMonth.length === 0 ? 0 : Math.round((collected.length / dueThisMonth.length) * 100),
    tenant_rating: tenantRating === null ? null : Math.round(tenantRating * 10) / 10,
    owner_rating: ownerRating === null ? null : Math.round(ownerRating * 10) / 10,
    reviews,
    open_disputes: db.review_disputes.filter(
      (d) => d.status === "open" && reviews.some((r) => r.id === d.review_id),
    ).length,
  };
}

/* ----------------------------- tenant passport ---------------------------- */

/** Verified rental history for one tenant, keyed by user id or email. */
export async function getTenantPassport(input: {
  userId?: UUID | null;
  email?: string | null;
}): Promise<TenantPassport | null> {
  const passport = buildTenantPassport(input);
  return latency(passport ? clone(passport) : null);
}

export function buildTenantPassport(input: {
  userId?: UUID | null;
  email?: string | null;
}): TenantPassport | null {
  const db = getDb();
  const email = input.email?.toLowerCase() ?? null;
  const tenancies = db.tenancies
    .filter(alive)
    .filter(
      (t) =>
        (input.userId && t.tenant_user_id === input.userId) ||
        (email && t.tenant_email?.toLowerCase() === email),
    );
  if (tenancies.length === 0) return null;

  const tenancyIds = new Set(tenancies.map((t) => t.id));
  const payments = db.payments.filter((p) => tenancyIds.has(p.tenancy_id));
  const settled = payments.filter((p) => p.status === "paid" && p.verified);
  const late = payments.filter((p) => p.status === "late" || p.status === "failed");
  const onTime = settled.filter((p) => !p.paid_at || p.paid_at.slice(0, 10) <= p.due_date);

  const months = tenancies.reduce((sum, t) => {
    if (!t.start_date) return sum;
    const end = t.end_date && t.end_date < new Date().toISOString().slice(0, 10) ? t.end_date : null;
    const endMs = end ? new Date(`${end}T00:00:00`).getTime() : Date.now();
    return sum + Math.max(0, Math.round((endMs - new Date(`${t.start_date}T00:00:00`).getTime()) / 2_628_000_000));
  }, 0);

  const reviews: Review[] = db.reviews
    .filter((r) => tenancyIds.has(r.tenancy_id) && r.direction === "landlord_to_tenant")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    tenant_name: tenancies[0]!.tenant_name,
    verified_payments: settled.length,
    on_time_payments: onTime.length,
    on_time_pct: settled.length + late.length === 0 ? 0 : Math.round((onTime.length / (settled.length + late.length)) * 100),
    late_payments: late.length,
    verified_tenancies: tenancies.filter((t) => t.verified).length,
    months_of_history: months,
    average_rent: average(tenancies.map((t) => t.monthly_rent ?? 0).filter((n) => n > 0)),
    open_disputes: db.review_disputes.filter(
      (d) => d.status === "open" && reviews.some((r) => r.id === d.review_id),
    ).length,
    reviews,
  };
}

/* --------------------------------- listings -------------------------------- */

function hydrateListing(listing: Listing): ListingWithContext {
  const db = getDb();
  return {
    ...listing,
    property: db.properties.find((p) => p.id === listing.property_id) ?? null,
    unit: db.units.find((u) => u.id === listing.unit_id) ?? null,
    provider: buildProviderProfile(listing.organization_id),
    application_count: db.rental_applications.filter((a) => a.listing_id === listing.id).length,
    channels: channelsFor(listing.id),
    pipeline: buildPipeline(listing.id),
    owner_name:
      db.owner_accounts.find((o) =>
        db.management_assignments.some(
          (m) =>
            m.property_id === listing.property_id &&
            m.owner_account_id === o.id &&
            m.revoked_at === null,
        ),
      )?.name ?? null,
  };
}

/** Public marketplace search. Only published listings from verified providers. */
export async function searchListings(filters?: {
  query?: string;
  minBeds?: number | null;
  maxRent?: number | null;
  city?: string | null;
}): Promise<ListingWithContext[]> {
  const db = getDb();
  const rows = db.listings
    .filter(alive)
    .filter((l) => l.status === "published")
    .map(hydrateListing)
    .filter((l) => l.provider?.verification_status === "verified")
    .filter((l) => {
      const q = filters?.query?.trim().toLowerCase();
      if (q) {
        const haystack = [l.headline, l.property?.name, l.property?.city, l.unit?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters?.city && l.property?.city !== filters.city) return false;
      if (filters?.maxRent && l.monthly_rent > filters.maxRent) return false;
      if (filters?.minBeds && (l.unit?.bedrooms ?? 0) < filters.minBeds) return false;
      return true;
    })
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  return latency(clone(rows));
}

export async function getListing(listingId: UUID): Promise<ListingWithContext | null> {
  const listing = getDb().listings.find((l) => l.id === listingId);
  return latency(listing ? clone(hydrateListing(listing)) : null);
}

/** Every listing in an organization, including drafts (provider view). */
export async function getListings(orgId: UUID | null): Promise<ListingWithContext[]> {
  if (!orgId) return [];
  const rows = getDb()
    .listings.filter(alive)
    .filter((l) => l.organization_id === orgId)
    .map(hydrateListing)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function getManagedListings(pmOrgId: UUID | null): Promise<ListingWithContext[]> {
  if (!pmOrgId) return [];
  const db = getDb();
  // A manager's leasing desk covers every property assigned to them, whichever
  // owner organization the listing itself belongs to.
  const managedPropertyIds = new Set(
    db.management_assignments
      .filter((a) => a.organization_id === pmOrgId && !a.revoked_at)
      .map((a) => a.property_id),
  );
  const rows = db.listings
    .filter(alive)
    .filter((l) => l.organization_id === pmOrgId || managedPropertyIds.has(l.property_id))
    .map(hydrateListing)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function createListing(input: {
  organizationId: UUID;
  propertyId: UUID;
  unitId: UUID;
  headline: string;
  description?: string | null;
  monthlyRent: number;
  securityDeposit?: number | null;
  availableOn: string;
  leaseTermMonths?: number;
  amenities?: string[];
  screeningCriteria?: string | null;
  syndicatedTo?: string[];
  publish?: boolean;
  actorId?: UUID | null;
  detail?: Partial<Listing>;
  channels?: string[];
}): Promise<Listing> {
  const now = nowIso();
  const listing: Listing = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: input.propertyId,
    unit_id: input.unitId,
    status: input.publish ? "published" : "draft",
    headline: input.headline.trim(),
    description: input.description?.trim() || null,
    monthly_rent: input.monthlyRent,
    security_deposit: input.securityDeposit ?? null,
    available_on: input.availableOn,
    lease_term_months: input.leaseTermMonths ?? 12,
    amenities: input.amenities ?? [],
    screening_criteria: input.screeningCriteria?.trim() || null,
    syndicated_to: input.syndicatedTo ?? [],
    published_at: input.publish ? now : null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    public_ref: nextPublicRef(),
    photos: [],
    view_count: 0,
    ...(input.detail ?? {}),
  };
  getDb().listings.unshift(listing);
  ensureChannels(listing);
  for (const marketplaceId of input.channels ?? []) {
    const channel = getDb().listing_channels.find(
      (c) => c.listing_id === listing.id && c.marketplace_id === marketplaceId,
    );
    if (channel) channel.enabled = true;
  }
  if (input.publish) await propagateListingChange(listing, "create");
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: input.publish ? "listing.published" : "listing.created",
    entity_type: "listing",
    entity_id: listing.id,
    metadata: { headline: listing.headline },
  });
  commit();
  return latency(clone(listing), 220);
}

export async function updateListingStatus(
  listingId: UUID,
  status: ListingStatus,
  actorId?: UUID | null,
): Promise<Listing> {
  const listing = getDb().listings.find((l) => l.id === listingId);
  if (!listing) throw new Error("Listing not found.");
  listing.status = status;
  listing.published_at = status === "published" ? (listing.published_at ?? nowIso()) : listing.published_at;
  listing.updated_at = nowIso();
  if (status === "leased" || status === "paused") {
    await withdrawEverywhere(listing);
  } else if (status === "published") {
    await propagateListingChange(listing, "create");
  }
  logAudit({
    organization_id: listing.organization_id,
    actor_id: actorId ?? null,
    action: `listing.${status}`,
    entity_type: "listing",
    entity_id: listing.id,
  });
  commit();
  return latency(clone(listing), 160);
}

/** Toggle a syndication destination (Zillow / partner feeds). */
export async function toggleSyndication(listingId: UUID, destination: string): Promise<Listing> {
  const listing = getDb().listings.find((l) => l.id === listingId);
  if (!listing) throw new Error("Listing not found.");
  listing.syndicated_to = listing.syndicated_to.includes(destination)
    ? listing.syndicated_to.filter((d) => d !== destination)
    : [...listing.syndicated_to, destination];
  listing.updated_at = nowIso();
  commit();
  return latency(clone(listing), 140);
}

/** Short permanent public reference used in rentid.online/listing/<ref>. */
function nextPublicRef() {
  const used = new Set(getDb().listings.map((l) => l.public_ref));
  let ref = 10_000 + getDb().listings.length + 244;
  while (used.has(String(ref))) ref += 1;
  return String(ref);
}

/** Public listing lookup by short reference (or raw id, for older links). */
export async function getListingByRef(ref: string): Promise<ListingWithContext | null> {
  const listing = getDb().listings.find((l) => l.public_ref === ref || l.id === ref);
  return latency(listing ? clone(hydrateListing(listing)) : null);
}

/**
 * Edit the master listing. Any change to rent, photos, availability,
 * description, amenities or lease terms is queued out to every enabled channel.
 */
export async function updateListing(input: {
  listingId: UUID;
  patch: Partial<Listing>;
  actorId?: UUID | null;
}): Promise<Listing> {
  const listing = getDb().listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found.");
  Object.assign(listing, input.patch, { id: listing.id, updated_at: nowIso() });
  await propagateListingChange(listing, "update");
  logAudit({
    organization_id: listing.organization_id,
    actor_id: input.actorId ?? null,
    action: "listing.updated",
    entity_type: "listing",
    entity_id: listing.id,
    metadata: { fields: Object.keys(input.patch) },
  });
  commit();
  return latency(clone(listing), 200);
}

/* ------------------------------ applications ------------------------------ */

function hydrateApplication(application: RentalApplication): ApplicationWithContext {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === application.listing_id) ?? null;
  return {
    ...application,
    listing,
    property_name: db.properties.find((p) => p.id === listing?.property_id)?.name ?? "—",
    unit_name: db.units.find((u) => u.id === listing?.unit_id)?.name ?? "—",
    passport: application.profile_shared
      ? (buildTenantPassport({
          userId: application.applicant_user_id,
          email: application.applicant_email,
        }) ?? syntheticPassport(application))
      : null,
  };
}

/**
 * Applicants who have no RentID history in this workspace still share a
 * consented package; we surface the declared figures with no verified events.
 */
function syntheticPassport(application: RentalApplication): TenantPassport {
  return {
    tenant_name: application.applicant_name,
    verified_payments: 0,
    on_time_payments: 0,
    on_time_pct: 0,
    late_payments: 0,
    verified_tenancies: 0,
    months_of_history: 0,
    average_rent: null,
    open_disputes: 0,
    reviews: [],
  };
}

export async function getApplications(orgId: UUID | null): Promise<ApplicationWithContext[]> {
  if (!orgId) return [];
  const rows = getDb()
    .rental_applications.filter((a) => a.organization_id === orgId)
    .map(hydrateApplication)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function getMyApplications(input: {
  userId?: UUID | null;
  email?: string | null;
}): Promise<ApplicationWithContext[]> {
  const email = input.email?.toLowerCase() ?? null;
  const rows = getDb()
    .rental_applications.filter(
      (a) =>
        (input.userId && a.applicant_user_id === input.userId) ||
        (email && a.applicant_email.toLowerCase() === email),
    )
    .map(hydrateApplication)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function applyToListing(input: {
  listingId: UUID;
  applicantUserId?: UUID | null;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string | null;
  monthlyIncome?: number | null;
  moveInDate?: string | null;
  note?: string | null;
  shareProfile: boolean;
  source?: LeadSource;
  utmSource?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  prefilledFromResume?: boolean;
  employer?: string | null;
  currentAddress?: string | null;
  references?: string | null;
}): Promise<RentalApplication> {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found.");
  const now = nowIso();
  const application: RentalApplication = {
    id: uuid(),
    listing_id: listing.id,
    organization_id: listing.organization_id,
    applicant_user_id: input.applicantUserId ?? null,
    applicant_name: input.applicantName.trim(),
    applicant_email: input.applicantEmail.trim().toLowerCase(),
    applicant_phone: input.applicantPhone?.trim() || null,
    monthly_income: input.monthlyIncome ?? null,
    move_in_date: input.moveInDate ?? null,
    note: input.note?.trim() || null,
    status: "submitted",
    profile_shared: input.shareProfile,
    source: input.source ?? "rentid",
    utm_source: input.utmSource ?? null,
    utm_campaign: input.utmCampaign ?? null,
    referrer: input.referrer ?? null,
    prefilled_from_resume: input.prefilledFromResume ?? false,
    employer: input.employer?.trim() || null,
    current_address: input.currentAddress?.trim() || null,
    references: input.references?.trim() || null,
    decided_at: null,
    created_at: now,
    updated_at: now,
  };
  db.rental_applications.unshift(application);
  logAudit({
    organization_id: listing.organization_id,
    actor_id: input.applicantUserId ?? null,
    actor_role: "tenant",
    action: "application.submitted",
    entity_type: "rental_application",
    entity_id: application.id,
    metadata: { listing: listing.headline, profile_shared: input.shareProfile },
  });
  commit();
  return latency(clone(application), 240);
}

export async function updateApplicationStatus(
  applicationId: UUID,
  status: ApplicationStatus,
  actorId?: UUID | null,
): Promise<RentalApplication> {
  const application = getDb().rental_applications.find((a) => a.id === applicationId);
  if (!application) throw new Error("Application not found.");
  application.status = status;
  application.decided_at = status === "approved" || status === "denied" ? nowIso() : null;
  application.updated_at = nowIso();
  logAudit({
    organization_id: application.organization_id,
    actor_id: actorId ?? null,
    action: `application.${status}`,
    entity_type: "rental_application",
    entity_id: application.id,
  });
  commit();
  return latency(clone(application), 180);
}
