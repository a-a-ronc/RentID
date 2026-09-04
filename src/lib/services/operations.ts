/** Leases, documents, maintenance, messaging, notifications and reviews. */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import type {
  Conversation,
  ConversationWithContext,
  Document,
  DocumentKind,
  DocumentWithContext,
  Lease,
  LeaseDetail,
  MaintenanceRequest,
  MaintenanceWithContext,
  Message,
  Notification,
  Review,
  UUID,
} from "@/lib/types";

const alive = <T extends { deleted_at: string | null }>(row: T) => row.deleted_at === null;

/* --------------------------------- leases --------------------------------- */

function hydrateLease(lease: Lease): LeaseDetail {
  const db = getDb();
  const tenancy = db.tenancies.find((t) => t.id === lease.tenancy_id) ?? null;
  return {
    ...lease,
    tenancy,
    unit: db.units.find((u) => u.id === lease.unit_id) ?? null,
    property: db.properties.find((p) => p.id === tenancy?.property_id) ?? null,
    document: db.documents.find((d) => d.id === lease.document_id) ?? null,
  };
}

export async function getLeases(orgId: UUID | null): Promise<LeaseDetail[]> {
  if (!orgId) return [];
  const rows = getDb()
    .leases.filter(alive)
    .filter((l) => l.organization_id === orgId)
    .map(hydrateLease)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
  return latency(clone(rows));
}

export async function getLease(leaseId: UUID): Promise<LeaseDetail | null> {
  const lease = getDb().leases.find((l) => l.id === leaseId);
  return latency(lease ? clone(hydrateLease(lease)) : null);
}

export async function getLeaseForTenancy(tenancyId: UUID): Promise<LeaseDetail | null> {
  const lease = getDb()
    .leases.filter(alive)
    .filter((l) => l.tenancy_id === tenancyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latency(lease ? clone(hydrateLease(lease)) : null);
}

/**
 * Create/replace a lease and attach its document. File bytes are not persisted
 * while Supabase Storage is unavailable — only the metadata and storage path.
 */
export async function uploadLease(input: {
  organizationId: UUID;
  tenancyId: UUID;
  unitId: UUID;
  actorId?: UUID | null;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit?: number | null;
  rentDueDay?: number;
  lateFee?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}): Promise<LeaseDetail> {
  const db = getDb();
  const now = nowIso();
  const tenancy = db.tenancies.find((t) => t.id === input.tenancyId);

  const document: Document = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: tenancy?.property_id ?? null,
    unit_id: input.unitId,
    tenancy_id: input.tenancyId,
    kind: "lease",
    title: input.fileName ?? `${tenancy?.tenant_name ?? "Tenant"} — lease.pdf`,
    storage_path: `${input.organizationId}/${input.tenancyId}/${input.fileName ?? "lease.pdf"}`,
    mime_type: input.mimeType ?? "application/pdf",
    size_bytes: input.fileSize ?? null,
    visible_to_tenant: true,
    uploaded_by: input.actorId ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  db.documents.unshift(document);

  // supersede any existing lease for this tenancy
  db.leases
    .filter((l) => l.tenancy_id === input.tenancyId && l.deleted_at === null)
    .forEach((l) => {
      l.status = "ended";
      l.updated_at = now;
    });

  const lease: Lease = {
    id: uuid(),
    organization_id: input.organizationId,
    tenancy_id: input.tenancyId,
    unit_id: input.unitId,
    status: "active",
    start_date: input.startDate,
    end_date: input.endDate,
    monthly_rent: input.monthlyRent,
    security_deposit: input.securityDeposit ?? null,
    rent_due_day: input.rentDueDay ?? 1,
    late_fee: input.lateFee ?? null,
    document_id: document.id,
    signed_at: now,
    created_at: now,
    updated_at: now,
  } as Lease;
  (lease as Lease).deleted_at = null;
  db.leases.unshift(lease);

  if (tenancy) {
    tenancy.start_date = input.startDate;
    tenancy.end_date = input.endDate;
    tenancy.monthly_rent = input.monthlyRent;
    tenancy.updated_at = now;
  }

  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "lease.uploaded",
    entity_type: "lease",
    entity_id: lease.id,
  });
  commit();
  return latency(clone(hydrateLease(lease)), 300);
}

/* -------------------------------- documents ------------------------------- */

function hydrateDocument(doc: Document): DocumentWithContext {
  const db = getDb();
  return {
    ...doc,
    property_name: db.properties.find((p) => p.id === doc.property_id)?.name ?? null,
    unit_name: db.units.find((u) => u.id === doc.unit_id)?.name ?? null,
    tenant_name: db.tenancies.find((t) => t.id === doc.tenancy_id)?.tenant_name ?? null,
  };
}

export async function getDocuments(orgId: UUID | null): Promise<DocumentWithContext[]> {
  if (!orgId) return [];
  const rows = getDb()
    .documents.filter(alive)
    .filter((d) => d.organization_id === orgId)
    .map(hydrateDocument)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function getDocumentsForTenancy(tenancyId: UUID): Promise<DocumentWithContext[]> {
  const rows = getDb()
    .documents.filter(alive)
    .filter((d) => d.tenancy_id === tenancyId && d.visible_to_tenant)
    .map(hydrateDocument)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function uploadDocument(input: {
  organizationId: UUID;
  propertyId?: UUID | null;
  unitId?: UUID | null;
  tenancyId?: UUID | null;
  kind: DocumentKind;
  title: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  visibleToTenant?: boolean;
  actorId?: UUID | null;
}): Promise<Document> {
  const now = nowIso();
  const doc: Document = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: input.propertyId ?? null,
    unit_id: input.unitId ?? null,
    tenancy_id: input.tenancyId ?? null,
    kind: input.kind,
    title: input.title.trim(),
    storage_path: `${input.organizationId}/${input.tenancyId ?? "general"}/${input.fileName ?? input.title}`,
    mime_type: input.mimeType ?? null,
    size_bytes: input.fileSize ?? null,
    visible_to_tenant: input.visibleToTenant ?? false,
    uploaded_by: input.actorId ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  getDb().documents.unshift(doc);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "document.uploaded",
    entity_type: "document",
    entity_id: doc.id,
  });
  commit();
  return latency(clone(doc), 260);
}

export async function archiveDocument(documentId: UUID) {
  const doc = getDb().documents.find((d) => d.id === documentId);
  if (!doc) throw new Error("Document not found.");
  doc.deleted_at = nowIso();
  commit();
  return latency(true, 140);
}

/* ------------------------------- maintenance ------------------------------ */

function hydrateMaintenance(row: MaintenanceRequest): MaintenanceWithContext {
  const db = getDb();
  return {
    ...row,
    property_name: db.properties.find((p) => p.id === row.property_id)?.name ?? "—",
    unit_name: db.units.find((u) => u.id === row.unit_id)?.name ?? "—",
    tenant_name: db.tenancies.find((t) => t.id === row.tenancy_id)?.tenant_name ?? null,
  };
}

export async function getMaintenanceRequests(orgId: UUID | null): Promise<MaintenanceWithContext[]> {
  if (!orgId) return [];
  const rows = getDb()
    .maintenance_requests.filter((m) => m.organization_id === orgId)
    .map(hydrateMaintenance)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function getMaintenanceForTenancy(tenancyId: UUID): Promise<MaintenanceRequest[]> {
  const rows = getDb()
    .maintenance_requests.filter((m) => m.tenancy_id === tenancyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function createMaintenanceRequest(input: {
  organizationId: UUID;
  propertyId: UUID;
  unitId: UUID;
  tenancyId?: UUID | null;
  title: string;
  description?: string | null;
  priority?: MaintenanceRequest["priority"];
  actorId?: UUID | null;
}): Promise<MaintenanceRequest> {
  const now = nowIso();
  const row: MaintenanceRequest = {
    id: uuid(),
    organization_id: input.organizationId,
    property_id: input.propertyId,
    unit_id: input.unitId,
    tenancy_id: input.tenancyId ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    status: "open",
    priority: input.priority ?? "normal",
    created_by: input.actorId ?? null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  getDb().maintenance_requests.unshift(row);
  commit();
  return latency(clone(row), 220);
}

export async function updateMaintenanceStatus(
  id: UUID,
  status: MaintenanceRequest["status"],
): Promise<MaintenanceRequest> {
  const row = getDb().maintenance_requests.find((m) => m.id === id);
  if (!row) throw new Error("Request not found.");
  row.status = status;
  row.completed_at = status === "completed" ? nowIso() : null;
  row.updated_at = nowIso();
  commit();
  return latency(clone(row), 150);
}

/* -------------------------------- messaging ------------------------------- */

function hydrateConversation(c: Conversation, viewerRole: "landlord" | "tenant"): ConversationWithContext {
  const db = getDb();
  const messages = db.messages
    .filter((m) => m.conversation_id === c.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tenancy = db.tenancies.find((t) => t.id === c.tenancy_id);
  const org = db.organizations.find((o) => o.id === c.organization_id);
  return {
    ...c,
    messages,
    counterpart_name:
      viewerRole === "landlord" ? (tenancy?.tenant_name ?? "Tenant") : (org?.name ?? "Landlord"),
    unread: messages.filter(
      (m) => !m.read_at && (viewerRole === "landlord" ? m.sender_role === "tenant" : m.sender_role !== "tenant"),
    ).length,
  };
}

export async function getConversations(input: {
  orgId?: UUID | null;
  tenancyIds?: UUID[];
  viewerRole: "landlord" | "tenant";
}): Promise<ConversationWithContext[]> {
  const db = getDb();
  const rows = db.conversations
    .filter((c) =>
      input.viewerRole === "landlord"
        ? c.organization_id === input.orgId
        : Boolean(c.tenancy_id && input.tenancyIds?.includes(c.tenancy_id)),
    )
    .map((c) => hydrateConversation(c, input.viewerRole))
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  return latency(clone(rows));
}

export async function sendMessage(input: {
  conversationId?: UUID | null;
  organizationId: UUID;
  tenancyId?: UUID | null;
  subject?: string;
  senderId: UUID | null;
  senderName: string;
  senderRole: Message["sender_role"];
  body: string;
}): Promise<Message> {
  const db = getDb();
  const now = nowIso();
  let conversationId = input.conversationId ?? null;
  if (!conversationId) {
    conversationId = uuid();
    db.conversations.unshift({
      id: conversationId,
      organization_id: input.organizationId,
      tenancy_id: input.tenancyId ?? null,
      subject: input.subject ?? "New conversation",
      last_message_at: now,
      created_at: now,
      updated_at: now,
    });
  }
  const conversation = db.conversations.find((c) => c.id === conversationId);
  if (conversation) {
    conversation.last_message_at = now;
    conversation.updated_at = now;
  }
  const message: Message = {
    id: uuid(),
    conversation_id: conversationId,
    sender_id: input.senderId,
    sender_name: input.senderName,
    sender_role: input.senderRole,
    body: input.body.trim(),
    read_at: null,
    created_at: now,
  };
  db.messages.push(message);
  commit();
  return latency(clone(message), 160);
}

export async function markConversationRead(conversationId: UUID) {
  getDb()
    .messages.filter((m) => m.conversation_id === conversationId && !m.read_at)
    .forEach((m) => (m.read_at = nowIso()));
  commit();
  return latency(true, 80);
}

/* ------------------------- notifications & reviews ------------------------ */

export async function getNotifications(userId: UUID | null): Promise<Notification[]> {
  if (!userId) return [];
  const rows = getDb()
    .notifications.filter((n) => n.user_id === userId || n.user_id === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function markNotificationRead(id: UUID) {
  const row = getDb().notifications.find((n) => n.id === id);
  if (row) row.read_at = nowIso();
  commit();
  return latency(true, 80);
}

export async function getReviews(tenancyIds: UUID[]): Promise<Review[]> {
  const rows = getDb()
    .reviews.filter((r) => tenancyIds.includes(r.tenancy_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

export async function getAuditLogs(orgId: UUID | null) {
  const rows = getDb()
    .audit_logs.filter((a) => !orgId || a.organization_id === orgId)
    .slice(0, 50);
  return latency(clone(rows));
}
