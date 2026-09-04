/** Tenancies, tenant invitations and tenancy verification. */
import { clone, commit, getDb, latency, logAudit, nowIso, today, uuid } from "@/lib/mock/db";
import type {
  InvitationWithContext,
  Payment,
  Tenancy,
  TenancyDetail,
  TenantInvitation,
  UUID,
} from "@/lib/types";

const alive = <T extends { deleted_at: string | null }>(row: T) => row.deleted_at === null;

function hydrate(tenancy: Tenancy): TenancyDetail {
  const db = getDb();
  return {
    ...tenancy,
    property: db.properties.find((p) => p.id === tenancy.property_id) ?? null,
    unit: db.units.find((u) => u.id === tenancy.unit_id) ?? null,
    organization: db.organizations.find((o) => o.id === tenancy.organization_id) ?? null,
    lease:
      db.leases
        .filter(alive)
        .filter((l) => l.tenancy_id === tenancy.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    payments: db.payments
      .filter((p) => p.tenancy_id === tenancy.id)
      .sort((a, b) => b.due_date.localeCompare(a.due_date)),
    maintenance: db.maintenance_requests
      .filter((m) => m.tenancy_id === tenancy.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    documents: db.documents
      .filter(alive)
      .filter((d) => d.tenancy_id === tenancy.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

/** All tenancies in an organization (landlord view). */
export async function getTenancies(orgId: UUID | null): Promise<TenancyDetail[]> {
  if (!orgId) return [];
  const rows = getDb()
    .tenancies.filter(alive)
    .filter((t) => t.organization_id === orgId)
    .map(hydrate)
    .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));
  return latency(clone(rows));
}

/** Alias used by tenant-list screens. */
export const getTenants = getTenancies;

export async function getTenant(tenancyId: UUID): Promise<TenancyDetail | null> {
  const tenancy = getDb().tenancies.find((t) => t.id === tenancyId);
  return latency(tenancy ? clone(hydrate(tenancy)) : null);
}

export const getTenancy = getTenant;

/** Tenancies where the signed-in user is the tenant (tenant view). */
export async function getMyTenancies(userId: UUID | null): Promise<TenancyDetail[]> {
  if (!userId) return [];
  const rows = getDb()
    .tenancies.filter(alive)
    .filter((t) => t.tenant_user_id === userId)
    .map(hydrate)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function createTenancy(input: {
  organizationId: UUID;
  propertyId: UUID;
  unitId: UUID;
  actorId?: UUID | null;
  tenantName: string;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  status?: Tenancy["status"];
}): Promise<Tenancy> {
  const db = getDb();
  const now = nowIso();
  const tenancy: Tenancy = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: input.propertyId,
    unit_id: input.unitId,
    tenant_user_id: null,
    tenant_name: input.tenantName.trim(),
    tenant_email: input.tenantEmail?.trim().toLowerCase() || null,
    tenant_phone: input.tenantPhone?.trim() || null,
    status: input.status ?? "pending",
    verified: false,
    verified_at: null,
    start_date: input.startDate ?? today(),
    end_date: input.endDate ?? null,
    monthly_rent: input.monthlyRent ?? null,
    security_deposit: input.securityDeposit ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  db.tenancies.push(tenancy);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "tenancy.created",
    entity_type: "tenancy",
    entity_id: tenancy.id,
    metadata: { tenant: tenancy.tenant_name },
  });
  commit();
  return latency(clone(tenancy), 220);
}

export async function updateTenancy(
  tenancyId: UUID,
  patch: Partial<
    Pick<
      Tenancy,
      | "tenant_name"
      | "tenant_email"
      | "tenant_phone"
      | "status"
      | "start_date"
      | "end_date"
      | "monthly_rent"
      | "security_deposit"
    >
  >,
): Promise<Tenancy> {
  const tenancy = getDb().tenancies.find((t) => t.id === tenancyId);
  if (!tenancy) throw new Error("Tenancy not found.");
  Object.assign(tenancy, patch, { updated_at: nowIso() });
  commit();
  return latency(clone(tenancy), 140);
}

export async function endTenancy(tenancyId: UUID) {
  const db = getDb();
  const tenancy = db.tenancies.find((t) => t.id === tenancyId);
  if (!tenancy) throw new Error("Tenancy not found.");
  tenancy.status = "ended";
  tenancy.updated_at = nowIso();
  const unit = db.units.find((u) => u.id === tenancy.unit_id);
  if (unit) unit.occupancy_status = "vacant";
  commit();
  return latency(true, 160);
}

/**
 * Mark a tenancy verified. A tenancy is "Verified" only when landlord, tenant,
 * property, unit and a lease are all associated — see `tenancyVerification()`.
 */
export async function verifyTenancy(tenancyId: UUID, actorId?: UUID | null) {
  const db = getDb();
  const tenancy = db.tenancies.find((t) => t.id === tenancyId);
  if (!tenancy) throw new Error("Tenancy not found.");
  tenancy.verified = true;
  tenancy.verified_at = nowIso();
  tenancy.status = "active";
  tenancy.updated_at = nowIso();
  const unit = db.units.find((u) => u.id === tenancy.unit_id);
  if (unit) unit.occupancy_status = "occupied";
  if (!db.verification_records.some((v) => v.tenancy_id === tenancyId && v.kind === "tenancy")) {
    db.verification_records.unshift({
      id: uuid(),
      organization_id: tenancy.organization_id,
      tenancy_id: tenancyId,
      payment_id: null,
      kind: "tenancy",
      verified_by: actorId ?? null,
      source: "platform",
      notes: "Landlord and tenant both confirmed the tenancy",
      created_at: nowIso(),
    });
  }
  logAudit({
    organization_id: tenancy.organization_id,
    actor_id: actorId ?? null,
    action: "tenancy.verified",
    entity_type: "tenancy",
    entity_id: tenancyId,
  });
  commit();
  return latency(clone(tenancy), 180);
}

/** Which of the five association requirements a tenancy satisfies. */
export function tenancyVerification(detail: TenancyDetail) {
  const checks = [
    { label: "Landlord", ok: Boolean(detail.organization) },
    { label: "Tenant account", ok: Boolean(detail.tenant_user_id) },
    { label: "Property", ok: Boolean(detail.property) },
    { label: "Unit", ok: Boolean(detail.unit) },
    { label: "Lease", ok: Boolean(detail.lease) },
  ];
  return { checks, complete: checks.every((c) => c.ok) && detail.verified };
}

/* ------------------------------- invitations ------------------------------ */

function hydrateInvite(invite: TenantInvitation): InvitationWithContext {
  const db = getDb();
  return {
    ...invite,
    property: db.properties.find((p) => p.id === invite.property_id) ?? null,
    unit: db.units.find((u) => u.id === invite.unit_id) ?? null,
    organization: db.organizations.find((o) => o.id === invite.organization_id) ?? null,
  };
}

export async function getInvitations(orgId: UUID | null): Promise<InvitationWithContext[]> {
  if (!orgId) return [];
  const rows = getDb()
    .tenant_invitations.filter((i) => i.organization_id === orgId)
    .map(hydrateInvite)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

/** Pending invitations addressed to an email (tenant acceptance flow). */
export async function getMyInvitations(email: string | null): Promise<InvitationWithContext[]> {
  if (!email) return [];
  const normalized = email.toLowerCase();
  const rows = getDb()
    .tenant_invitations.filter(
      (i) => i.status === "pending" && i.email.toLowerCase() === normalized,
    )
    .map(hydrateInvite);
  return latency(clone(rows));
}

export async function getInvitationByToken(token: string): Promise<InvitationWithContext | null> {
  const invite = getDb().tenant_invitations.find((i) => i.token === token);
  return latency(invite ? clone(hydrateInvite(invite)) : null);
}

/** Invite a tenant: creates a pending tenancy plus the invitation record. */
export async function inviteTenant(input: {
  organizationId: UUID;
  propertyId: UUID;
  unitId: UUID;
  actorId?: UUID | null;
  email: string;
  name: string;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<{ invitation: TenantInvitation; tenancy: Tenancy }> {
  const db = getDb();
  const tenancy = await createTenancy({
    organizationId: input.organizationId,
    propertyId: input.propertyId,
    unitId: input.unitId,
    actorId: input.actorId ?? null,
    tenantName: input.name,
    tenantEmail: input.email,
    monthlyRent: input.monthlyRent ?? null,
    securityDeposit: input.securityDeposit ?? null,
    startDate: input.startDate ?? today(),
    endDate: input.endDate ?? null,
    status: "pending",
  });
  const now = nowIso();
  const invitation: TenantInvitation = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: input.propertyId,
    unit_id: input.unitId,
    tenancy_id: tenancy.id,
    email: input.email.trim().toLowerCase(),
    invited_name: input.name.trim(),
    status: "pending",
    token: uuid(),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    accepted_at: null,
    created_by: input.actorId ?? null,
    created_at: now,
    updated_at: now,
  };
  db.tenant_invitations.unshift(invitation);
  db.notifications.unshift({
    id: uuid(),
    user_id: input.actorId ?? null,
    organization_id: input.organizationId,
    kind: "invitation",
    title: `Invitation sent to ${invitation.invited_name}`,
    body: `${invitation.email} has 7 days to accept.`,
    read_at: null,
    created_at: now,
  });
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "invitation.sent",
    entity_type: "tenant_invitation",
    entity_id: invitation.id,
    metadata: { email: invitation.email },
  });
  commit();
  return latency(clone({ invitation, tenancy }), 260);
}

export async function revokeInvitation(invitationId: UUID) {
  const invite = getDb().tenant_invitations.find((i) => i.id === invitationId);
  if (!invite) throw new Error("Invitation not found.");
  invite.status = "revoked";
  invite.updated_at = nowIso();
  commit();
  return latency(true, 140);
}

/**
 * Tenant accepts an invitation: links their account to the tenancy, marks the
 * tenancy active + verified, occupies the unit and seeds the rent ledger.
 */
export async function acceptInvitation(input: {
  invitationId: UUID;
  userId: UUID;
  fullName?: string | null;
}): Promise<{ tenancyId: UUID }> {
  const db = getDb();
  const invite = db.tenant_invitations.find((i) => i.id === input.invitationId);
  if (!invite) throw new Error("Invitation not found.");
  if (invite.status !== "pending") throw new Error("This invitation is no longer pending.");
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    invite.status = "expired";
    commit();
    throw new Error("This invitation has expired.");
  }

  const now = nowIso();
  let tenancy = invite.tenancy_id ? db.tenancies.find((t) => t.id === invite.tenancy_id) : undefined;
  if (!tenancy) {
    const unit = db.units.find((u) => u.id === invite.unit_id);
    const created = await createTenancy({
      organizationId: invite.organization_id,
      propertyId: invite.property_id,
      unitId: invite.unit_id,
      tenantName: invite.invited_name ?? invite.email,
      tenantEmail: invite.email,
      monthlyRent: unit?.monthly_rent ?? null,
      securityDeposit: unit?.security_deposit ?? null,
    });
    tenancy = db.tenancies.find((t) => t.id === created.id)!;
    invite.tenancy_id = tenancy.id;
  }

  tenancy.tenant_user_id = input.userId;
  if (input.fullName) tenancy.tenant_name = input.fullName;
  tenancy.status = "active";
  tenancy.updated_at = now;

  invite.status = "accepted";
  invite.accepted_at = now;
  invite.updated_at = now;

  const unit = db.units.find((u) => u.id === tenancy.unit_id);
  if (unit) unit.occupancy_status = "occupied";

  if (!db.user_roles.some((r) => r.user_id === input.userId && r.role === "tenant")) {
    db.user_roles.push({ id: uuid(), user_id: input.userId, role: "tenant", created_at: now });
  }

  // seed the current month's rent so the tenant sees a live ledger
  if (!db.payments.some((p) => p.tenancy_id === tenancy!.id)) {
    const due = new Date();
    due.setDate(1);
    const payment: Payment = {
      id: uuid(),
      organization_id: tenancy.organization_id,
      tenancy_id: tenancy.id,
      amount: tenancy.monthly_rent ?? unit?.monthly_rent ?? 0,
      status: "scheduled",
      method: "manual",
      due_date: due.toISOString().slice(0, 10),
      paid_at: null,
      period_label: due.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      verified: false,
      memo: null,
      created_at: now,
      updated_at: now,
    };
    db.payments.push(payment);
  }

  logAudit({
    organization_id: invite.organization_id,
    actor_id: input.userId,
    actor_role: "tenant",
    action: "invitation.accepted",
    entity_type: "tenancy",
    entity_id: tenancy.id,
  });
  commit();
  await verifyTenancy(tenancy.id, input.userId);
  return latency({ tenancyId: tenancy.id }, 200);
}

export async function getVerificationRecords(tenancyId: UUID) {
  const rows = getDb()
    .verification_records.filter((v) => v.tenancy_id === tenancyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}
