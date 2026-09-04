import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
  SummaryGrid,
} from "@/components/rentid/patterns";
import { EmptyState } from "@/components/rentid/Surface";
import { money, monthLabel, shortDate } from "@/lib/format";
import { useActiveOrg, useInvalidateRentId, usePayments, usePlatformSettings } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

const TONE: Record<string, "success" | "danger" | "warning" | "neutral" | "accent"> = {
  paid: "success",
  late: "danger",
  failed: "danger",
  pending: "warning",
  scheduled: "neutral",
  refunded: "neutral",
  returned: "warning",
};

function PaymentsPage() {
  const active = useActiveOrg();
  const payments = usePayments(active.orgId);
  const settings = usePlatformSettings();
  const invalidate = useInvalidateRentId();
  const [filter, setFilter] = useState<"all" | "due" | "paid">("all");

  const stats = useMemo(() => {
    const now = new Date();
    let collected = 0;
    let outstanding = 0;
    let upcoming = 0;
    for (const p of payments.data ?? []) {
      const amount = Number(p.amount);
      const due = p.due_date ? new Date(`${p.due_date}T00:00:00`) : null;
      if (p.status === "paid") {
        collected += amount;
      } else if (due && due < now) {
        outstanding += amount;
      } else {
        upcoming += amount;
      }
    }
    return { collected, outstanding, upcoming };
  }, [payments.data]);

  const rows = (payments.data ?? [])
    .filter((p) =>
      filter === "all"
        ? true
        : filter === "paid"
          ? p.status === "paid"
          : p.status !== "paid",
    )
    .slice()
    .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));

  async function markPaid(id: string) {
    const { error } = await supabase
      .from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), days_late: 0 })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked as paid.");
    invalidate();
  }

  const feePct = settings.data?.platform_fee_percentage ?? null;

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title="Payments"
        subtitle={active.org ? `${active.org.name} · ${monthLabel(new Date())}` : undefined}
      />

      <SummaryGrid
        className="mt-5"
        items={[
          { label: "Collected", value: money(stats.collected), tone: "success" as const, hint: "All recorded paid rent" },
          { label: "Outstanding", value: money(stats.outstanding), tone: stats.outstanding > 0 ? ("warning" as const) : ("neutral" as const), hint: "Past due" },
          { label: "Upcoming", value: money(stats.upcoming), tone: "neutral" as const, hint: "Scheduled, not yet due" },
          {
            label: "Platform fee",
            value: feePct != null ? `${Number(feePct)}%` : "—",
            tone: "neutral" as const,
            hint: settings.data?.fee_allocation === "tenant" ? "Paid by tenant" : "Planned",
          },
        ]}
      />

      <div className="mt-5 flex gap-2">
        {(["all", "due", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 font-display text-[12px] font-medium capitalize transition-colors ${
              filter === f ? "bg-brand text-brand-foreground" : "glass text-muted-foreground"
            }`}
          >
            {f === "due" ? "Due / late" : f}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {payments.isLoading ? (
          <EmptyState title="Loading…" description="Fetching payments." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description={
              filter === "all"
                ? "No payments recorded yet — rent records appear as tenancies are set up."
                : filter === "paid"
                  ? "No paid rent recorded yet."
                  : "Everything is settled — no outstanding rent."
            }
          />
        ) : (
          <SectionCard title="Rent ledger" aside={`${rows.length} records`}>
            {rows.map((p) => {
              const info = p.tenancies as
                | { tenant_name?: string; units?: { name?: string } }
                | null;
              return (
                <ListRow
                  key={p.id}
                  title={info?.tenant_name ?? "Tenant"}
                  subtitle={
                    [info?.units?.name ?? "", p.due_date ? shortDate(p.due_date) : ""]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  value={money(Number(p.amount))}
                  pill={
                    <div className="flex items-center gap-2">
                      <StatusPill status={p.status} tone={TONE[p.status] ?? "neutral"} />
                      {p.status !== "paid" && (
                        <button
                          onClick={() => markPaid(p.id)}
                          className="rounded-full bg-brand px-2.5 py-1 font-display text-[10.5px] font-semibold text-brand-foreground"
                        >
                          Mark paid
                        </button>
                      )}
                    </div>
                  }
                />
              );
            })}
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}
