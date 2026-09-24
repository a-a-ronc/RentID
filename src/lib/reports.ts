/**
 * Portfolio reports, computed from data the landlord already loads (payments,
 * tenancies, properties). Pure functions so the arithmetic is unit-tested and
 * the page stays a view.
 */
import type { Payment, PaymentStatus, PropertyWithUnits, TenancyDetail } from "@/lib/types";

/* ---------------------------------------------------------------- months */

export type MonthKey = `${number}-${string}`;

export function monthKey(isoDate: string): MonthKey {
  return isoDate.slice(0, 7) as MonthKey;
}

/** The last `count` calendar months ending with the month containing `today`, oldest first. */
export function lastMonths(today: string, count: number): MonthKey[] {
  const [y, m] = today.split("-").map(Number);
  const out: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7) as MonthKey);
  }
  return out;
}

export function monthName(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ----------------------------------------------------------- collections */

/** Reversed money is not rent collected, and not rent owed a second time either. */
const NOT_OWED: ReadonlySet<PaymentStatus> = new Set(["refunded"]);
/** Still owed and past due — excludes tenant-reported rows awaiting confirmation. */
const UNPAID: ReadonlySet<PaymentStatus> = new Set(["scheduled", "late", "failed", "returned"]);

export type MonthCollections = {
  month: MonthKey;
  label: string;
  expected: number;
  collected: number;
  outstanding: number;
  late: number;
  /** 0–100, or null when nothing was due. */
  rate: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function collectionsByMonth(
  payments: Pick<Payment, "amount" | "status" | "due_date">[],
  today: string,
  months = 6,
): MonthCollections[] {
  const keys = lastMonths(today, months);
  const byMonth = new Map<MonthKey, { expected: number; collected: number; late: number }>(
    keys.map((k) => [k, { expected: 0, collected: 0, late: 0 }]),
  );
  for (const p of payments) {
    if (!p.due_date || NOT_OWED.has(p.status)) continue;
    const bucket = byMonth.get(monthKey(p.due_date));
    if (!bucket) continue;
    const amount = Number(p.amount) || 0;
    bucket.expected += amount;
    if (p.status === "paid") bucket.collected += amount;
    if (p.status === "late") bucket.late += 1;
  }
  return keys.map((k) => {
    const b = byMonth.get(k)!;
    return {
      month: k,
      label: monthName(k),
      expected: round2(b.expected),
      collected: round2(b.collected),
      outstanding: round2(b.expected - b.collected),
      late: b.late,
      rate: b.expected > 0 ? Math.round((b.collected / b.expected) * 100) : null,
    };
  });
}

/* -------------------------------------------------------------- rent roll */

export type RentRollRow = {
  tenancyId: string;
  property: string;
  unit: string;
  tenant: string;
  rent: number;
  startDate: string | null;
  endDate: string | null;
  verified: boolean;
  /** Unpaid rent due before today. */
  pastDue: number;
  lastPaid: string | null;
};

export function rentRoll(tenancies: TenancyDetail[], today: string): RentRollRow[] {
  return tenancies
    .filter((t) => t.status === "active")
    .map((t) => {
      const payments = t.payments ?? [];
      const pastDue = payments
        .filter((p) => UNPAID.has(p.status) && p.due_date < today)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const lastPaid =
        payments
          .filter((p) => p.status === "paid" && p.paid_at)
          .map((p) => p.paid_at as string)
          .sort()
          .at(-1) ?? null;
      return {
        tenancyId: t.id,
        property: t.property?.name ?? "—",
        unit: t.unit?.name ?? "—",
        tenant: t.tenant_name,
        rent: Number(t.monthly_rent ?? t.unit?.monthly_rent ?? 0),
        startDate: t.start_date,
        endDate: t.end_date,
        verified: t.verified,
        pastDue: round2(pastDue),
        lastPaid: lastPaid ? lastPaid.slice(0, 10) : null,
      };
    })
    .sort((a, b) => a.property.localeCompare(b.property) || a.unit.localeCompare(b.unit));
}

/* -------------------------------------------------------------- occupancy */

export function occupancy(properties: PropertyWithUnits[]) {
  const units = properties.flatMap((p) => p.units ?? []);
  const occupied = units.filter((u) => u.occupancy_status === "occupied").length;
  const scheduledRent = units
    .filter((u) => u.occupancy_status === "occupied")
    .reduce((s, u) => s + (Number(u.monthly_rent) || 0), 0);
  const vacantRent = units
    .filter((u) => u.occupancy_status !== "occupied")
    .reduce((s, u) => s + (Number(u.monthly_rent) || 0), 0);
  return {
    units: units.length,
    occupied,
    rate: units.length ? Math.round((occupied / units.length) * 100) : null,
    scheduledRent: round2(scheduledRent),
    vacantRent: round2(vacantRent),
  };
}

/* -------------------------------------------------------------------- CSV */

/**
 * RFC 4180 CSV. Cells that a spreadsheet would execute as a formula
 * (leading = + - @, tab or CR) are prefixed with an apostrophe — tenant names
 * and memos are user-controlled, and a CSV opened in Excel is an injection
 * vector otherwise.
 */
export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[]) {
  const cell = (v: unknown): string => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => cell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}
