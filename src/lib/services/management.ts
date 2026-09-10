/**
 * Property-management layer (business map §7): a PM organization operates
 * properties it does not own. Owner→property→PM authority lives in
 * `management_assignments`, separate from ownership, so an owner can replace
 * a manager without losing property, lease or payment history.
 */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import type {
  ManagementAssignment,
  Organization,
  OwnerAccount,
  OwnerAccountWithContext,
  PmPortfolioMetrics,
  Property,
  PropertyWithUnits,
  UUID,
} from "@/lib/types";
import { buildProviderProfile } from "@/lib/services/marketplace";

const alive = <T extends { deleted_at: string | null }>(row: T) => row.deleted_at === null;
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** The property-management workspaces this user belongs to. */
export async function getManagementOrganizations(userId: UUID | null): Promise<Organization[]> {
  const db = getDb();
  const memberOrgIds = new Set(
    db.organization_members.filter((m) => m.user_id === userId).map((m) => m.organization_id),
  );
  const rows = db.organizations
    .filter(alive)
    .filter((o) => o.kind === "property_manager")
    .filter((o) => o.is_demo || o.owner_id === userId || memberOrgIds.has(o.id));
  return latency(clone(rows));
}

function assignmentsFor(orgId: UUID): ManagementAssignment[] {
  return getDb().management_assignments.filter(
    (m) => m.organization_id === orgId && m.revoked_at === null,
  );
}

/** Properties a PM organization is authorized to manage, with their units. */
export async function getManagedProperties(orgId: UUID | null): Promise<PropertyWithUnits[]> {
  if (!orgId) return [];
  const db = getDb();
  const propertyIds = new Set(assignmentsFor(orgId).map((m) => m.property_id));
  const rows = db.properties
    .filter(alive)
    .filter((p) => propertyIds.has(p.id))
    .map((p) => ({ ...p, units: db.units.filter(alive).filter((u) => u.property_id === p.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return latency(clone(rows));
}

export async function getOwnerAccounts(orgId: UUID | null): Promise<OwnerAccountWithContext[]> {
  if (!orgId) return [];
  const db = getDb();
  const assignments = assignmentsFor(orgId);

  const rows: OwnerAccountWithContext[] = db.owner_accounts
    .filter((o) => o.organization_id === orgId)
    .map((owner) => {
      const owned = assignments.filter((a) => a.owner_account_id === owner.id);
      const properties: Property[] = owned
        .map((a) => db.properties.find((p) => p.id === a.property_id))
        .filter((p): p is Property => Boolean(p));
      const units = db.units.filter(alive).filter((u) => properties.some((p) => p.id === u.property_id));
      const tenancyIds = new Set(
        db.tenancies.filter((t) => units.some((u) => u.id === t.unit_id)).map((t) => t.id),
      );
      const collected = db.payments
        .filter(
          (p) =>
            tenancyIds.has(p.tenancy_id) &&
            p.status === "paid" &&
            p.due_date.slice(0, 7) === thisMonth(),
        )
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        ...owner,
        properties,
        units_managed: units.length,
        occupied_units: units.filter((u) => u.occupancy_status === "occupied").length,
        collected_this_month: collected,
        authority_status: owned[0]?.authority_status ?? "pending",
      };
    })
    .sort((a, b) => b.units_managed - a.units_managed);

  return latency(clone(rows));
}

export async function createOwnerAccount(input: {
  organizationId: UUID;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  managementFeePct?: number | null;
  actorId?: UUID | null;
}): Promise<OwnerAccount> {
  const now = nowIso();
  const owner: OwnerAccount = {
    id: uuid(),
    organization_id: input.organizationId,
    name: input.name.trim(),
    contact_name: input.contactName?.trim() || null,
    contact_email: input.contactEmail?.trim().toLowerCase() || null,
    contract_start: now.slice(0, 10),
    management_fee_pct: input.managementFeePct ?? null,
    created_at: now,
    updated_at: now,
  };
  getDb().owner_accounts.unshift(owner);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    actor_role: "property_manager",
    action: "owner_account.created",
    entity_type: "owner_account",
    entity_id: owner.id,
    metadata: { name: owner.name },
  });
  commit();
  return latency(clone(owner), 220);
}

/**
 * Record owner-granted authority to manage a property. Authority starts
 * `pending` until the owner confirms — badges and listings stay gated.
 */
export async function assignPropertyToManager(input: {
  organizationId: UUID;
  ownerAccountId: UUID;
  propertyId: UUID;
  actorId?: UUID | null;
}): Promise<ManagementAssignment> {
  const now = nowIso();
  const assignment: ManagementAssignment = {
    id: uuid(),
    organization_id: input.organizationId,
    owner_account_id: input.ownerAccountId,
    property_id: input.propertyId,
    authority_status: "pending",
    authorized_at: null,
    revoked_at: null,
    created_at: now,
  };
  getDb().management_assignments.push(assignment);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    actor_role: "property_manager",
    action: "management_authority.requested",
    entity_type: "management_assignment",
    entity_id: assignment.id,
  });
  commit();
  return latency(clone(assignment), 200);
}

/** Owner confirms or revokes management authority. */
export async function setManagementAuthority(
  assignmentId: UUID,
  status: "verified" | "disputed" | "revoked",
  actorId?: UUID | null,
): Promise<ManagementAssignment> {
  const assignment = getDb().management_assignments.find((m) => m.id === assignmentId);
  if (!assignment) throw new Error("Management assignment not found.");
  if (status === "revoked") {
    assignment.revoked_at = nowIso();
  } else {
    assignment.authority_status = status;
    assignment.authorized_at = status === "verified" ? nowIso() : null;
  }
  logAudit({
    organization_id: assignment.organization_id,
    actor_id: actorId ?? null,
    action: `management_authority.${status}`,
    entity_type: "management_assignment",
    entity_id: assignment.id,
  });
  commit();
  return latency(clone(assignment), 180);
}

/** Portfolio-level operating KPIs for the PM dashboard. */
export async function getPmPortfolioMetrics(orgId: UUID | null): Promise<PmPortfolioMetrics> {
  const empty: PmPortfolioMetrics = {
    units_managed: 0,
    owners: 0,
    collected_this_month: 0,
    open_work_orders: 0,
    urgent_work_orders: 0,
    median_first_response_hours: 0,
    resolved_under_72h_pct: 0,
    collection_rate_pct: 0,
  };
  if (!orgId) return empty;

  const db = getDb();
  const propertyIds = new Set(assignmentsFor(orgId).map((m) => m.property_id));
  const units = db.units.filter(alive).filter((u) => propertyIds.has(u.property_id));
  const tenancyIds = new Set(
    db.tenancies.filter((t) => propertyIds.has(t.property_id)).map((t) => t.id),
  );
  const monthly = db.payments.filter(
    (p) => tenancyIds.has(p.tenancy_id) && p.due_date.slice(0, 7) === thisMonth(),
  );
  const work = db.maintenance_requests.filter(
    (m) => propertyIds.has(m.property_id) && !["completed", "cancelled"].includes(m.status),
  );
  const profile = buildProviderProfile(orgId);

  const metrics: PmPortfolioMetrics = {
    units_managed: units.length,
    owners: db.owner_accounts.filter((o) => o.organization_id === orgId).length,
    collected_this_month: monthly.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0),
    open_work_orders: work.length,
    urgent_work_orders: work.filter((m) => m.priority === "high" || m.priority === "emergency").length,
    median_first_response_hours: profile?.median_first_response_hours ?? 0,
    resolved_under_72h_pct: profile?.resolved_under_72h_pct ?? 0,
    collection_rate_pct: profile?.collection_rate_pct ?? 0,
  };
  return latency(metrics, 160);
}
