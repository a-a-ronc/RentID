import { createFileRoute, Link } from "@tanstack/react-router";

import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/rentid/patterns";
import { EmptyState } from "@/components/rentid/Surface";
import { daysUntil, money } from "@/lib/format";
import { useActiveOrg, useTenancies } from "@/lib/rentid";

export const Route = createFileRoute("/_authenticated/tenants/")({
  head: () => ({
    meta: [
      { title: "Tenants — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantsPage,
});

function TenantsPage() {
  const active = useActiveOrg();
  const tenancies = useTenancies(active.orgId);

  const rows = (tenancies.data ?? []).slice().sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return (a.tenant_name ?? "").localeCompare(b.tenant_name ?? "");
  });

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title="Tenants"
        subtitle={
          active.org ? `${active.org.name} · ${rows.length} tenanc${rows.length === 1 ? "y" : "ies"}` : undefined
        }
      />

      <div className="mt-5 space-y-3">
        {tenancies.isLoading ? (
          <EmptyState title="Loading…" description="Fetching your tenancies." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No tenants yet"
            description="Invite a tenant from a unit page — they accept, and the tenancy becomes verified."
          />
        ) : (
          <SectionCard title="All tenancies" aside={`${rows.length} total`}>
            {rows.map((t) => {
              const end = t.end_date ? daysUntil(t.end_date) : null;
              return (
                <ListRow
                  key={t.id}
                  title={t.tenant_name ?? "Tenant"}
                  subtitle={
                    [t.properties?.name ?? "", t.units?.name ?? "", t.monthly_rent != null ? `${money(Number(t.monthly_rent))}/mo` : null]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  pill={
                    t.verified ? (
                      <StatusPill status="Verified" tone="success" />
                    ) : (
                      <StatusPill
                        status={t.status === "pending" ? "Invitation sent" : t.status}
                        tone="warning"
                      />
                    )
                  }
                  value={
                    <Link
                      to="/tenants/$tenancyId"
                      params={{ tenancyId: t.id }}
                      className="text-[12.5px] font-medium text-brand"
                    >
                      {end != null && end >= 0 && end <= 60 ? `${end}d left · Manage` : "Manage"}
                    </Link>
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
