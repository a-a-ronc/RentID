/** Rent ledger + portfolio metrics. No live payments — recording is manual. */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import type { DashboardMetrics, Payment, PaymentWithContext, UUID } from "@/lib/types";

function context(payment: Payment): PaymentWithContext {
  const db = getDb();
  const tenancy = db.tenancies.find((t) => t.id === payment.tenancy_id);
  return {
    ...payment,
    tenant_name: tenancy?.tenant_name ?? "Tenant",
    property_name: db.properties.find((p) => p.id === tenancy?.property_id)?.name ?? "—",
    unit_name: db.units.find((u) => u.id === tenancy?.unit_id)?.name ?? "—",
  };
}

function isCurrentMonth(dateOnly: string) {
  const now = new Date();
  return dateOnly.slice(0, 7) === now.toISOString().slice(0, 7);
}

export async function getPayments(orgId: UUID | null): Promise<PaymentWithContext[]> {
  if (!orgId) return [];
  const rows = getDb()
    .payments.filter((p) => p.organization_id === orgId)
    .map(context)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  return latency(clone(rows));
}

export async function getPaymentsForTenancy(tenancyId: UUID): Promise<Payment[]> {
  const rows = getDb()
    .payments.filter((p) => p.tenancy_id === tenancyId)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));
  return latency(clone(rows));
}

export async function recordPayment(input: {
  organizationId: UUID;
  tenancyId: UUID;
  amount: number;
  dueDate: string;
  method?: Payment["method"];
  memo?: string | null;
  actorId?: UUID | null;
}): Promise<Payment> {
  const now = nowIso();
  const payment: Payment = {
    id: uuid(),
    organization_id: input.organizationId,
    tenancy_id: input.tenancyId,
    amount: input.amount,
    status: "paid",
    method: input.method ?? "manual",
    due_date: input.dueDate,
    paid_at: now,
    period_label: new Date(`${input.dueDate}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    verified: true,
    verification_source: "landlord_reported",
    memo: input.memo?.trim() || null,
    created_at: now,
    updated_at: now,
  };
  getDb().payments.push(payment);
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: "payment.recorded",
    entity_type: "payment",
    entity_id: payment.id,
    metadata: { amount: payment.amount },
  });
  commit();
  return latency(clone(payment), 200);
}

export async function markPaymentPaid(paymentId: UUID, actorId?: UUID | null): Promise<Payment> {
  const payment = getDb().payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Payment not found.");
  payment.status = "paid";
  payment.paid_at = nowIso();
  payment.verified = true;
  payment.updated_at = nowIso();
  logAudit({
    organization_id: payment.organization_id,
    actor_id: actorId ?? null,
    action: "payment.marked_paid",
    entity_type: "payment",
    entity_id: payment.id,
  });
  commit();
  return latency(clone(payment), 160);
}

export async function getDashboardMetrics(orgId: UUID | null): Promise<DashboardMetrics> {
  const empty: DashboardMetrics = {
    rent_collected: 0,
    outstanding_rent: 0,
    occupied_units: 0,
    total_units: 0,
    late_payments: 0,
    open_maintenance: 0,
    leases_expiring: 0,
  };
  if (!orgId) return empty;
  const db = getDb();
  const payments = db.payments.filter((p) => p.organization_id === orgId && isCurrentMonth(p.due_date));
  const units = db.units.filter((u) => u.organization_id === orgId && u.deleted_at === null);
  const late = payments.filter((p) => p.status === "late" || p.status === "failed");

  const metrics: DashboardMetrics = {
    rent_collected: payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0),
    outstanding_rent: late.reduce((s, p) => s + p.amount, 0),
    occupied_units: units.filter((u) => u.occupancy_status === "occupied").length,
    total_units: units.length,
    late_payments: late.length,
    open_maintenance: db.maintenance_requests.filter(
      (m) => m.organization_id === orgId && !["completed", "cancelled"].includes(m.status),
    ).length,
    leases_expiring: db.leases.filter((l) => {
      if (l.organization_id !== orgId || l.deleted_at) return false;
      const days = (new Date(`${l.end_date}T00:00:00`).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 60;
    }).length,
  };
  return latency(metrics, 140);
}
