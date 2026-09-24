/**
 * /reports — collections, rent roll and occupancy for the active portfolio,
 * with CSV export for the accountant.
 *
 * Everything here is derived client-side from the ledger, tenancies and units
 * the landlord can already read (RLS-scoped), via the pure functions in
 * lib/reports. No new data access.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import {
  AppShell,
  DataTable,
  EmptyState,
  InlineError,
  LoadingCard,
  PageHeader,
  SectionCard,
  StatusPill,
  SummaryGrid,
} from "@/components/rentid/patterns";
import { Button } from "@/components/rentid/kit";
import { fullDate, money, shortDate } from "@/lib/format";
import { collectionsByMonth, occupancy, rentRoll, toCsv, type RentRollRow } from "@/lib/reports";
import { useActiveOrg, usePayments, useProperties, useTenancies } from "@/lib/rentid";
import type { PaymentWithContext } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [{ title: "Reports — RentID" }, { name: "robots", content: "noindex" }],
  }),
  component: ReportsPage,
});

const todayIso = () => new Date().toISOString().slice(0, 10);

function download(filename: string, csv: string) {
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error("Your browser blocked the download.");
  }
}

function ReportsPage() {
  const active = useActiveOrg();
  const payments = usePayments(active.orgId);
  const tenancies = useTenancies(active.orgId);
  const properties = useProperties(active.orgId);
  const today = todayIso();

  const months = useMemo(
    () => collectionsByMonth(payments.data ?? [], today, 6),
    [payments.data, today],
  );
  const roll = useMemo(() => rentRoll(tenancies.data ?? [], today), [tenancies.data, today]);
  const occ = useMemo(() => occupancy(properties.data ?? []), [properties.data]);

  const thisMonth = months.at(-1);
  const totalPastDue = roll.reduce((s, r) => s + r.pastDue, 0);
  const loading = payments.isLoading || tenancies.isLoading || properties.isLoading;
  const failed = payments.isError || tenancies.isError || properties.isError;

  function exportRoll() {
    download(
      `rentid-rent-roll-${today}.csv`,
      toCsv<RentRollRow>(roll, [
        { header: "Property", value: (r) => r.property },
        { header: "Unit", value: (r) => r.unit },
        { header: "Tenant", value: (r) => r.tenant },
        { header: "Monthly rent", value: (r) => r.rent.toFixed(2) },
        { header: "Lease start", value: (r) => r.startDate ?? "" },
        { header: "Lease end", value: (r) => r.endDate ?? "Month-to-month" },
        { header: "Verified tenancy", value: (r) => (r.verified ? "Yes" : "No") },
        { header: "Last paid", value: (r) => r.lastPaid ?? "" },
        { header: "Past due", value: (r) => r.pastDue.toFixed(2) },
      ]),
    );
  }

  function exportLedger() {
    const rows = [...(payments.data ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date));
    download(
      `rentid-rent-ledger-${today}.csv`,
      toCsv<PaymentWithContext>(rows, [
        { header: "Period", value: (p) => p.period_label },
        { header: "Due date", value: (p) => p.due_date },
        { header: "Property", value: (p) => p.property_name },
        { header: "Unit", value: (p) => p.unit_name },
        { header: "Tenant", value: (p) => p.tenant_name },
        { header: "Amount", value: (p) => Number(p.amount).toFixed(2) },
        { header: "Status", value: (p) => p.status },
        { header: "Method", value: (p) => p.method },
        { header: "Paid at", value: (p) => (p.paid_at ? p.paid_at.slice(0, 10) : "") },
        { header: "Recorded as", value: (p) => p.verification_source.replace(/_/g, " ") },
        { header: "Memo", value: (p) => p.memo ?? "" },
      ]),
    );
  }

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title="Reports"
        subtitle={active.org?.name}
        action={
          <div className="flex shrink-0 gap-2">
            <Button
              tone="secondary"
              size="sm"
              disabled={loading || roll.length === 0}
              onClick={exportRoll}
            >
              <Download className="size-3.5" /> Rent roll
            </Button>
            <Button
              tone="secondary"
              size="sm"
              disabled={loading || (payments.data ?? []).length === 0}
              onClick={exportLedger}
            >
              <Download className="size-3.5" /> Ledger
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="mt-5">
          <LoadingCard label="Building your reports…" />
        </div>
      ) : failed ? (
        <div className="mt-5">
          <InlineError
            message="Some report data could not be loaded."
            onRetry={() => {
              void payments.refetch();
              void tenancies.refetch();
              void properties.refetch();
            }}
          />
        </div>
      ) : (
        <>
          <SummaryGrid
            className="mt-5"
            items={[
              {
                label: "Collected this month",
                value: money(thisMonth?.collected ?? 0),
                hint: thisMonth?.expected
                  ? `${thisMonth.rate}% of ${money(thisMonth.expected)} due`
                  : "Nothing due yet",
                tone: thisMonth?.rate === 100 ? "success" : "neutral",
              },
              {
                label: "Past due",
                value: money(totalPastDue),
                tone: totalPastDue > 0 ? "danger" : "success",
                hint: `${roll.filter((r) => r.pastDue > 0).length} of ${roll.length} tenancies`,
              },
              {
                label: "Occupancy",
                value: occ.rate == null ? "—" : `${occ.rate}%`,
                hint: `${occ.occupied} of ${occ.units} units`,
              },
              {
                label: "Vacant rent",
                value: `${money(occ.vacantRent)}/mo`,
                tone: occ.vacantRent > 0 ? "warning" : "neutral",
                hint: "Asking rent on empty units",
              },
            ]}
          />

          <SectionCard title="Collections" aside="Last 6 months" className="mt-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Month</th>
                    <th className="px-4 py-2 text-right font-medium">Due</th>
                    <th className="px-4 py-2 text-right font-medium">Collected</th>
                    <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-4 py-2 font-medium">Collection rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {[...months].reverse().map((m) => (
                    <tr key={m.month}>
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">{m.label}</td>
                      <td className="num px-4 py-2.5 text-right">{money(m.expected)}</td>
                      <td className="num px-4 py-2.5 text-right">{money(m.collected)}</td>
                      <td
                        className={cn(
                          "num px-4 py-2.5 text-right whitespace-nowrap",
                          m.outstanding > 0 && "text-destructive",
                        )}
                      >
                        {money(m.outstanding)}
                        {m.late > 0 ? (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            ({m.late} late)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {m.rate == null ? (
                          <span className="text-[12px] text-muted-foreground">Nothing due</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
                              role="img"
                              aria-label={`${m.rate}% collected`}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  m.rate >= 100
                                    ? "bg-success"
                                    : m.rate >= 80
                                      ? "bg-brand"
                                      : "bg-warning",
                                )}
                                style={{ width: `${Math.min(m.rate, 100)}%` }}
                              />
                            </div>
                            <span className="num text-[12px]">{m.rate}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Rent roll" aside={`${roll.length} active`} className="mt-4">
            <DataTable
              rows={roll}
              empty={
                <div className="p-4">
                  <EmptyState
                    title="No active tenancies"
                    description="Invite a tenant from a property's unit list. Once they accept, they appear here."
                  />
                </div>
              }
              columns={[
                {
                  key: "unit",
                  header: "Unit",
                  cell: (r) => (
                    <span className="font-medium">
                      {r.property} · {r.unit}
                    </span>
                  ),
                },
                {
                  key: "tenant",
                  header: "Tenant",
                  cell: (r) => (
                    <span className="inline-flex items-center gap-1.5">
                      {r.tenant}
                      {r.verified ? <StatusPill status="Verified" tone="success" /> : null}
                    </span>
                  ),
                },
                { key: "rent", header: "Rent", align: "right", cell: (r) => money(r.rent) },
                {
                  key: "end",
                  header: "Lease end",
                  hideOnMobile: true,
                  cell: (r) => (r.endDate ? fullDate(r.endDate) : "Month-to-month"),
                },
                {
                  key: "paid",
                  header: "Last paid",
                  hideOnMobile: true,
                  cell: (r) => (r.lastPaid ? shortDate(r.lastPaid) : "—"),
                },
                {
                  key: "due",
                  header: "Past due",
                  align: "right",
                  cell: (r) => (
                    <span className={cn("num", r.pastDue > 0 && "font-medium text-destructive")}>
                      {money(r.pastDue)}
                    </span>
                  ),
                },
              ]}
            />
          </SectionCard>

          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Figures come from the rent ledger. Anything marked paid counts as collected, whether you
            recorded it or the platform settled it; only platform-settled payments carry the
            verified badge on a tenant's record. Payments a tenant reported and you haven't
            confirmed yet aren't counted as collected or as past due.
          </p>
        </>
      )}
    </AppShell>
  );
}
