/** Organizations, properties and units. Mock-backed; Supabase-shaped. */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import type {
  Organization,
  OrganizationKind,
  Property,
  PropertyType,
  PropertyWithUnits,
  Unit,
  UUID,
} from "@/lib/types";

const notDeleted = <T extends { deleted_at: string | null }>(row: T) => row.deleted_at === null;

/* ------------------------------ organizations ----------------------------- */

/** Landlord workspaces. Property-management workspaces live in `management.ts`. */
export async function getOrganizations(userId: UUID | null): Promise<Organization[]> {
  const db = getDb();
  const memberOrgIds = new Set(
    db.organization_members.filter((m) => m.user_id === userId).map((m) => m.organization_id),
  );
  const rows = db.organizations
    .filter(notDeleted)
    .filter((o) => o.kind === "landlord")
    .filter((o) => o.is_demo || o.owner_id === userId || memberOrgIds.has(o.id))
    .sort((a, b) => Number(a.is_demo) - Number(b.is_demo));
  return latency(clone(rows));
}

export async function createOrganization(input: {
  name: string;
  legalEntityName?: string | null;
  ownerId: UUID;
  kind?: OrganizationKind;
}): Promise<Organization> {
  const db = getDb();
  const now = nowIso();
  const org: Organization = {
    id: uuid(),
    name: input.name.trim(),
    legal_entity_name: input.legalEntityName?.trim() || null,
    owner_id: input.ownerId,
    kind: input.kind ?? "landlord",
    // Business/ownership verification is a separate gate; new workspaces start unverified.
    verification_status: "unverified",
    is_demo: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  db.organizations.unshift(org);
  db.organization_members.push({
    id: uuid(),
    organization_id: org.id,
    user_id: input.ownerId,
    role: "owner",
    created_at: now,
  });
  logAudit({
    organization_id: org.id,
    actor_id: input.ownerId,
    actor_role: "landlord",
    action: "organization.created",
    entity_type: "organization",
    entity_id: org.id,
  });
  commit();
  return latency(clone(org), 220);
}

export async function updateOrganization(
  orgId: UUID,
  patch: Partial<Pick<Organization, "name" | "legal_entity_name">>,
): Promise<Organization> {
  const org = getDb().organizations.find((o) => o.id === orgId);
  if (!org) throw new Error("Workspace not found.");
  Object.assign(org, patch, { updated_at: nowIso() });
  commit();
  return latency(clone(org), 140);
}

/* -------------------------------- properties ------------------------------ */

export async function getProperties(orgId: UUID | null): Promise<PropertyWithUnits[]> {
  if (!orgId) return [];
  const db = getDb();
  const rows = db.properties
    .filter(notDeleted)
    .filter((p) => p.organization_id === orgId)
    .map((p) => ({
      ...p,
      units: db.units.filter(notDeleted).filter((u) => u.property_id === p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return latency(clone(rows));
}

export async function getProperty(propertyId: UUID): Promise<PropertyWithUnits | null> {
  const db = getDb();
  const property = db.properties.filter(notDeleted).find((p) => p.id === propertyId);
  if (!property) return latency(null);
  return latency(
    clone({
      ...property,
      units: db.units
        .filter(notDeleted)
        .filter((u) => u.property_id === property.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }),
  );
}

export async function createProperty(input: {
  organizationId: UUID;
  actorId?: UUID | null;
  name: string;
  propertyType: PropertyType;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  yearBuilt?: number | null;
  notes?: string | null;
}): Promise<Property> {
  const now = nowIso();
  const property: Property = {
    id: uuid(),
    organization_id: input.organizationId,
    name: input.name.trim(),
    property_type: input.propertyType,
    street_address: input.streetAddress.trim(),
    unit_label: null,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip.trim(),
    year_built: input.yearBuilt ?? null,
    notes: input.notes?.trim() || null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  getDb().properties.push(property);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "property.created",
    entity_type: "property",
    entity_id: property.id,
    metadata: { name: property.name },
  });
  commit();
  return latency(clone(property), 240);
}

export async function updateProperty(
  propertyId: UUID,
  patch: Partial<Pick<Property, "name" | "notes" | "street_address" | "city" | "state" | "zip">>,
): Promise<Property> {
  const property = getDb().properties.find((p) => p.id === propertyId);
  if (!property) throw new Error("Property not found.");
  Object.assign(property, patch, { updated_at: nowIso() });
  commit();
  return latency(clone(property), 140);
}

/** Soft delete — matches the planned `deleted_at` column. */
export async function archiveProperty(propertyId: UUID) {
  const db = getDb();
  const property = db.properties.find((p) => p.id === propertyId);
  if (!property) throw new Error("Property not found.");
  property.deleted_at = nowIso();
  db.units.filter((u) => u.property_id === propertyId).forEach((u) => (u.deleted_at = nowIso()));
  commit();
  return latency(true, 160);
}

/* ---------------------------------- units --------------------------------- */

export async function getUnits(propertyId?: UUID | null, orgId?: UUID | null): Promise<Unit[]> {
  const rows = getDb()
    .units.filter(notDeleted)
    .filter((u) => (propertyId ? u.property_id === propertyId : true))
    .filter((u) => (orgId ? u.organization_id === orgId : true))
    .sort((a, b) => a.name.localeCompare(b.name));
  return latency(clone(rows));
}

export async function getUnit(unitId: UUID): Promise<Unit | null> {
  return latency(clone(getDb().units.find((u) => u.id === unitId) ?? null));
}

export async function createUnit(input: {
  organizationId: UUID;
  propertyId: UUID;
  actorId?: UUID | null;
  name: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  rentDueDay?: number;
}): Promise<Unit> {
  const now = nowIso();
  const unit: Unit = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: input.propertyId,
    name: input.name.trim(),
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    square_feet: input.squareFeet ?? null,
    monthly_rent: input.monthlyRent ?? null,
    security_deposit: input.securityDeposit ?? null,
    rent_due_day: input.rentDueDay ?? 1,
    occupancy_status: "vacant",
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  getDb().units.push(unit);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "unit.created",
    entity_type: "unit",
    entity_id: unit.id,
    metadata: { name: unit.name },
  });
  commit();
  return latency(clone(unit), 220);
}

export async function updateUnit(
  unitId: UUID,
  patch: Partial<
    Pick<
      Unit,
      | "name"
      | "bedrooms"
      | "bathrooms"
      | "square_feet"
      | "monthly_rent"
      | "security_deposit"
      | "rent_due_day"
      | "occupancy_status"
    >
  >,
): Promise<Unit> {
  const unit = getDb().units.find((u) => u.id === unitId);
  if (!unit) throw new Error("Unit not found.");
  Object.assign(unit, patch, { updated_at: nowIso() });
  commit();
  return latency(clone(unit), 140);
}
