import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BadgeCheck, FileText } from "lucide-react";

import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/rentid/patterns";
import { EmptyState, Glass, Eyebrow } from "@/components/rentid/Surface";
import { useProfile } from "@/lib/auth";
import { daysUntil, money, shortDate } from "@/lib/format";
import {
  useAcceptInvitation,
  useDocuments,
  useInvalidateRentId,
  useMyInvitations,
  useMyTenancies,
} from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/tenant")({
  head: () => ({
    meta: [
      { title: "My home — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantHome,
});

function TenantHome() {
  const profile = useProfile();
  const invitations = useMyInvitations();
  const tenancies = useMyTenancies();
  const accept = useAcceptInvitation();
  const invalidate = useInvalidateRentId();

  const activeTenancy = (tenancies.data ?? []).find((t) => t.status === "active") ?? (tenancies.data ?? [])[0];

  // Documents visible to the tenant across their tenancies.
  const docsByTenancy = useDocuments(activeTenancy?.organization_id ?? null);
  const tenancyDocs = (docsByTenancy.data ?? []).filter(
    (d) => d.tenancy_id === activeTenancy?.id && d.visible_to_tenant,
  );

  async function openDoc(path: string) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error("Could not open the document.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function viewLease(tenancy: NonNullable<ReturnType<typeof useMyTenancies>["data"]>[number]) {
    const lease = (tenancy.leases ?? [])[0];
    if (!lease?.document_path) {
      toast.error("Your landlord hasn't attached a lease yet.");
      return;
    }
    await openDoc(lease.document_path);
  }

  const upcomingRent = activeTenancy
    ? ((activeTenancy.payments ?? []) as { status: string; amount: number; due_date: string }[])
        .filter((p) => p.status !== "paid")
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0]
    : undefined;

  const myMaintenance = activeTenancy
    ? ((activeTenancy.maintenance_requests ?? []) as { id: string; title: string; status: string }[]).filter(
        (m) => m.status === "open" || m.status === "in_progress",
      )
    : [];

  return (
    <AppShell subtitle="Tenant">
      <PageHeader
        title={`Hello${profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : ""}`}
        subtitle="Your rental record"
      />

      {(invitations.data ?? []).length > 0 && (
        <SectionCard title="Pending invitations" aside="Action needed" className="mt-5">
          {(invitations.data ?? []).map((inv) => {
            const u = inv.units as { name?: string } | null;
            const p = inv.properties as { name?: string } | null;
            const o = inv.organizations as { name?: string } | null;
            return (
              <ListRow
                key={inv.id}
                title={o?.name ?? "A landlord"}
                subtitle={`${p?.name ?? ""} ${u?.name ?? ""} · ${inv.monthly_rent != null ? `${money(Number(inv.monthly_rent))}/mo` : ""}`.trim()}
                value={
                  <button
                    onClick={() =>
                      accept.mutate(inv.id, {
                        onSuccess: () => toast.success("Tenancy verified — welcome home."),
                        onError: (err) =>
                          toast.error(err instanceof Error ? err.message : "Could not accept."),
                      })
                    }
                    disabled={accept.isPending}
                    className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 font-display text-[11.5px] font-semibold text-brand-foreground"
                  >
                    {accept.isPending ? "…" : "Accept"}
                  </button>
                }
              />
            );
          })}
        </SectionCard>
      )}

      {tenancies.isLoading ? (
        <EmptyState title="Loading…" description="Fetching your rental record." />
      ) : !activeTenancy ? (
        <div className="mt-5">
          <EmptyState
            title="No tenancy yet"
            description="When your landlord invites you to a unit, your verified tenancy, lease and rent history will appear here."
          />
        </div>
      ) : (
        <>
          <Glass className="mt-5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow>{activeTenancy.organizations?.name ?? "Your landlord"}</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold tracking-tight">
                  {activeTenancy.properties?.name ?? ""} {activeTenancy.units?.name ?? ""}
                </h2>
                <p className="num mt-1 text-[12px] text-muted-foreground">
                  {activeTenancy.properties?.street_address}, {activeTenancy.properties?.city}{" "}
                  {activeTenancy.properties?.state}
                </p>
              </div>
              {activeTenancy.verified ? (
                <StatusPill status="Verified" tone="success" />
              ) : (
                <StatusPill status="Pending" tone="warning" />
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-secondary/70 p-3.5">
                <Eyebrow>Monthly rent</Eyebrow>
                <p className="num mt-1.5 text-[22px] leading-none font-medium">
                  {activeTenancy.monthly_rent != null ? money(Number(activeTenancy.monthly_rent)) : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-secondary/70 p-3.5">
                <Eyebrow>Lease ends</Eyebrow>
                <p className="num mt-1.5 text-[22px] leading-none font-medium">
                  {activeTenancy.end_date ? shortDate(activeTenancy.end_date) : "—"}
                </p>
                {activeTenancy.end_date && daysUntil(activeTenancy.end_date) >= 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {daysUntil(activeTenancy.end_date)} days remaining
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => viewLease(activeTenancy)}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
              >
                <FileText className="size-4" /> View lease
              </button>
              <button
                onClick={async () => {
                  const { data: userData } = await supabase.auth.getUser();
                  const { error } = await supabase.from("maintenance_requests").insert({
                    organization_id: activeTenancy.organization_id,
                    tenancy_id: activeTenancy.id,
                    property_id: activeTenancy.property_id,
                    unit_id: activeTenancy.unit_id,
                    created_by: userData.user?.id,
                    title: "New maintenance request",
                    description: "Submitted from the tenant dashboard.",
                    priority: "normal",
                    status: "open",
                  });
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  toast.success("Request submitted — your landlord has been notified.");
                  invalidate();
                }}
                className="rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium"
              >
                Report an issue
              </button>
            </div>
          </Glass>

          {upcomingRent && (
            <SectionCard title="Rent" aside="Next payment" className="mt-4">
              <ListRow
                title={upcomingRent.due_date ? `Due ${shortDate(upcomingRent.due_date)}` : "Upcoming"}
                subtitle={
                  upcomingRent.status === "late"
                    ? "Past due — please arrange payment with your landlord"
                    : "Online payments coming soon"
                }
                value={money(Number(upcomingRent.amount))}
                pill={
                  <StatusPill
                    status={upcomingRent.status}
                    tone={upcomingRent.status === "late" ? "danger" : "neutral"}
                  />
                }
              />
            </SectionCard>
          )}

          {myMaintenance.length > 0 && (
            <SectionCard title="Open requests" aside="Maintenance" className="mt-4">
              {myMaintenance.map((m) => (
                <ListRow key={m.id} title={m.title} pill={<StatusPill status={m.status.replace("_", " ")} tone="warning" />} />
              ))}
            </SectionCard>
          )}

          <SectionCard title="Documents" aside={`${tenancyDocs.length} shared`} className="mt-4">
            {tenancyDocs.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-muted-foreground">
                Your landlord hasn't shared documents yet.
              </p>
            ) : (
              tenancyDocs.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.title}
                  subtitle={d.created_at ? shortDate(d.created_at.slice(0, 10)) : ""}
                  pill={<StatusPill status={d.kind.replace(/_/g, " ")} tone="neutral" />}
                  value={
                    <button onClick={() => openDoc(d.storage_path)} className="text-[12.5px] font-medium text-brand">
                      Open
                    </button>
                  }
                />
              ))
            )}
          </SectionCard>

          {activeTenancy.verified && (
            <Glass className="mt-4 flex items-start gap-3 p-4">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.75} />
              <p className="text-[13px] text-muted-foreground">
                This tenancy is verified. It builds your RentID record — two-way reviews unlock
                after your lease term.
              </p>
            </Glass>
          )}
        </>
      )}
    </AppShell>
  );
}
