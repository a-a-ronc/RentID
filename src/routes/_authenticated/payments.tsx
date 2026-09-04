import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AppShell,
  Button,
  DataTable,
  DemoNotice,
  EmptyState,
  InlineError,
  LoadingCard,
  PageHeader,
  SectionCard,
  StatusPill,
  SummaryGrid,
  TrustBadge,
} from "@/components/rentid/patterns";
import { money, monthLabel, shortDate } from "@/lib/format";
import { useActiveOrg, useMarkPaymentPaid, usePayments } from "@/lib/rentid";
import type { PaymentWithContext } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

const TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  paid: "success",
  late: "danger",
  failed: "danger",
  pending: "warning",
  scheduled: "neutral",
  refunded: "neutral",
};

function PaymentsPage() {
  const active = useActiveOrg();
  const payments = usePayments(active.orgId);
  const markPaid = useMarkPaymentPaid();
  const [filter, setFilter] = useState<"all" | "due" | "paid">("all");

  const stats = useMemo(() => {
    const now = new Date();
    let collected = 0;
    let outstanding = 0;
    let upcoming = 0;
    let late = 0;
    for (const payment of payments.data ?? []) {
      const amount = Number(payment.amount);
      const due = payment.due_date ? new Date(`${payment.due_date}T00:00:00`) : null;
      if (payment.status === "paid") collected += amount;
      else if (due && due < now) {
        outstanding += amount;
        late += 1;
      } else upcoming += amount;
    }
    return { collected, outstanding, upcoming, late };
  }, [payments.data]);

  const rows = (payments.data ?? [])
    .filter((p) => (filter === "all" ? true : filter === "paid" ? p.status === "paid" : p.status !== "paid"))
    .slice()
    .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));

  async function pay(id: string) {
    try {
      await markPaid.mutateAsync(id);
      toast.success("Recorded as paid.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the payment.");
    }
  }

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title="Payments"
        subtitle={active.org ? `${active.org.name} · ${monthLabel(new Date())}` : undefined}
      />

      <SummaryGrid
        className="mt-5"
        items={[
          { label: "Collected", value: money(stats.collected), tone: "success", hint: "Recorded paid rent" },
          {
            label: "Outstanding",
            value: money(stats.outstanding),
            tone: stats.outstanding > 0 ? "warning" : "neutral",
            hint: "Past due",
          },
          { label: "Upcoming", value: money(stats.upcoming), tone: "neutral", hint: "Scheduled" },
          { label: "Late", value: String(stats.late), tone: stats.late > 0 ? "danger" : "neutral", hint: "Overdue records" },
        ]}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {(["all", "due", "paid"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setFilter(option)}
            className={`rounded-full px-4 py-1.5 font-display text-[12px] font-medium capitalize transition-colors ${
              filter === option ? "bg-brand text-brand-foreground" : "glass text-muted-foreground"
            }`}
          >
            {option === "due" ? "Due / late" : option}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-4">
        <DemoNotice>
          Rent is recorded manually in this build. Card and bank collection arrive with the payments milestone — no
          money moves today.
        </DemoNotice>

        {payments.isLoading ? (
          <LoadingCard label="Loading the rent ledger…" />
        ) : payments.isError ? (
          <InlineError message="Payments could not be loaded." onRetry={() => void payments.refetch()} />
        ) : (
          <SectionCard title="Rent ledger" aside={`${rows.length} records`}>
            <DataTable<PaymentWithContext>
              rows={rows}
              empty={
                <EmptyState
                  title="Nothing here"
                  description={
                    filter === "paid"
                      ? "No paid rent recorded yet."
                      : filter === "due"
                        ? "Everything is settled — no outstanding rent."
                        : "Rent records appear as tenancies are set up."
                  }
                />
              }
              columns={[
                {
                  key: "tenant",
                  header: "Tenant",
                  cell: (p) => (
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.tenant_name}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">
                        {[p.property_name, p.unit_name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "due",
                  header: "Due",
                  hideOnMobile: true,
                  cell: (p) => <span className="num">{shortDate(p.due_date)}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (p) =>
                    p.status === "paid" ? (
                      <TrustBadge kind="verified_payment" label="Verified" />
                    ) : (
                      <StatusPill status={p.status} tone={TONE[p.status] ?? "neutral"} />
                    ),
                },
                {
                  key: "amount",
                  header: "Amount",
                  align: "right",
                  cell: (p) => <span className="num font-medium">{money(Number(p.amount))}</span>,
                },
                {
                  key: "actions",
                  header: "",
                  align: "right",
                  cell: (p) =>
                    p.status === "paid" ? null : (
                      <Button size="sm" onClick={() => void pay(p.id)}>
                        Mark paid
                      </Button>
                    ),
                },
              ]}
            />
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}
