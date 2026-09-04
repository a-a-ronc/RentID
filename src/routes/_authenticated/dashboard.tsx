import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";

import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
  SummaryGrid,
  ToolbarButton,
} from "@/components/rentid/patterns";
import { ComingSoon, Glass, Eyebrow } from "@/components/rentid/Surface";
import { useProfile } from "@/lib/auth";
import { daysUntil, greeting, money, monthLabel, shortDate } from "@/lib/format";
import { useActiveOrg, useLeases, useMaintenance, usePayments, useProperties } from "@/lib/rentid";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const active = useActiveOrg();
  const profile = useProfile();
  const orgId = active.orgId;

  const properties = useProperties(orgId);
  const tenancies = useTenancies(orgId);
  const payments = usePayments(orgId);
  const maintenance = useMaintenance(orgId);
  const leases = useLeases(orgId);

  const loading =
    properties.isLoading || payments.isLoading || maintenance.isLoading || leases.isLoading;

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let collected = 0;
    let outstanding = 0;
    for (const p of payments.data ?? []) {
      const due = p.due_date ? new Date(`${p.due_date}T00:00:00`) : null;
      if (p.status === "paid") {
        if (p.paid_at) {
          const paid = new Date(p.paid_at);
          if (paid >= monthStart && paid < monthEnd) collected += Number(p.amount);
        }
      } else if (due && due < now && (p.status === "late" || p.status === "scheduled" || p.status === "pending")) {
        outstanding += Number(p.amount);
      }
    }

    const units = (properties.data ?? []).flatMap((pr) => pr.units ?? []);
    const occupied = units.filter((u) => u.occupancy_status === "occupied").length;

    const expiring = (leases.data ?? []).filter((l) => {
      if (!l.end_date) return false;
      const d = daysUntil(l.end_date);
      return d >= 0 && d <= 60;
    });

    const openMaintenance = (maintenance.data ?? []).filter(
      (m) => m.status === "open" || m.status === "in_progress",
    );

    return { collected, outstanding, units: units.length, occupied, expiring, openMaintenance };
  }, [payments.data, properties.data, leases.data, maintenance.data]);

  const recentPayments = (payments.data ?? [])
    .slice()
    .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""))
    .slice(0, 5);

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title={`${greeting()}${profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : ""}`}
        subtitle={active.org ? `${active.org.name} · ${monthLabel(new Date())}` : undefined}
        action={
          <ToolbarButton to="/properties" label="Add property" icon={ArrowRight} />
        }
      />

      {active.isDemo && (
        <Glass className="mt-4 flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">You're viewing the RentID demo portfolio.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Finish onboarding to create your own workspace — your properties, tenants and leases
              live there.
            </p>
          </div>
          <Link
            to="/onboarding"
            className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-brand-foreground"
          >
            Set up
          </Link>
        </Glass>
      )}

      <SummaryGrid
        className="mt-5"
        items={[
          {
            label: "Collected this month",
            value: money(stats.collected),
            tone: "success" as const,
            hint: "Rent marked paid",
          },
          {
            label: "Outstanding",
            value: money(stats.outstanding),
            tone: stats.outstanding > 0 ? ("warning" as const) : ("neutral" as const),
            hint: "Past due",
          },
          {
            label: "Occupancy",
            value: `${stats.occupied}/${stats.units}`,
            tone: "neutral" as const,
            hint: "Units occupied",
          },
          {
            label: "Maintenance",
            value: String(stats.openMaintenance.length),
            tone: stats.openMaintenance.length > 0 ? ("warning" as const) : ("neutral" as const),
            hint: "Open requests",
          },
        ]}
      />

      {loading ? (
        <Glass className="mt-6 p-6 text-[13px] text-muted-foreground">Loading your ledger…</Glass>
      ) : (
        <>
          <SectionCard title="Recent rent" aside="Payments" className="mt-6">
            {recentPayments.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-muted-foreground">No payments recorded yet.</p>
            ) : (
              recentPayments.map((p) => {
                const t = p.tenancies as { tenant_name?: string } | null;
                const u = p.tenancies as { units?: { name?: string } } | null;
                return (
                  <ListRow
                    key={p.id}
                    title={t?.tenant_name ?? "Tenant"}
                    subtitle={u?.units?.name ?? ""}
                    value={money(Number(p.amount))}
                    pill={
                      <StatusPill
                        status={p.status as string}
                        tone={
                          p.status === "paid"
                            ? "success"
                            : p.status === "late"
                              ? "danger"
                              : p.status === "scheduled"
                                ? "neutral"
                                : "warning"
                        }
                      />
                    }
                  />
                );
              })
            )}
          </SectionCard>

          <SectionCard title="Open maintenance" aside="Requests" className="mt-4">
            {stats.openMaintenance.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-muted-foreground">
                Nothing open — units are quiet.
              </p>
            ) : (
              stats.openMaintenance.slice(0, 4).map((m) => {
                const u = m as { units?: { name?: string } };
                return (
                  <ListRow
                    key={m.id}
                    title={m.title}
                    subtitle={u.units?.name ?? ""}
                    pill={
                      <StatusPill
                        status={m.status}
                        tone={m.status === "open" ? "warning" : "neutral"}
                      />
                    }
                  />
                );
              })
            )}
          </SectionCard>

          {stats.expiring.length > 0 && (
            <SectionCard title="Leases expiring soon" aside="Next 60 days" className="mt-4">
              {stats.expiring.map((l) => {
                const t = l.tenancies as { tenant_name?: string; units?: { name?: string } } | null;
                return (
                  <ListRow
                    key={l.id}
                    title={t?.tenant_name ?? "Tenant"}
                    subtitle={t?.units?.name ?? ""}
                    pill={<StatusPill status={`${daysUntil(l.end_date!)} days`} tone="warning" />}
                  />
                );
              })}
            </SectionCard>
          )}

          <SectionCard
            title="Properties"
            aside={`${properties.data?.length ?? 0} total`}
            className="mt-4"
            footer={
              <Link
                to="/properties"
                className="flex items-center gap-1.5 text-[13px] font-medium text-brand"
              >
                View all properties <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            {(properties.data ?? []).slice(0, 3).map((pr) => (
              <ListRow
                key={pr.id}
                title={pr.name}
                subtitle={`${pr.city}, ${pr.state} · ${(pr.units ?? []).length} units`}
                value={
                  <Link to="/properties/$propertyId" params={{ propertyId: pr.id }}>
                    <StatusPill status="Open" tone="neutral" />
                  </Link>
                }
              />
            ))}
          </SectionCard>

          <div className="mt-8">
            <Eyebrow>Coming soon</Eyebrow>
            <div className="mt-2">
              <ComingSoon
                title="Rent collection & reporting"
                description="RentID-owned payments with automated rent collection, receipts and portfolio reporting are planned next."
                points={[
                  "Autopay rent schedules per lease",
                  "Late-fee tracking and reminders",
                  "Owner statements and cash-flow reports",
                ]}
              />
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
