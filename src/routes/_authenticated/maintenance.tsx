import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { shortDate } from "@/lib/format";
import { useActiveOrg, useInvalidateRentId, useMaintenance } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenancePage,
});

const TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  urgent: "danger",
  high: "warning",
  normal: "neutral",
  low: "neutral",
};

const NEXT_STATUS: Record<string, string> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
};

function MaintenancePage() {
  const active = useActiveOrg();
  const maintenance = useMaintenance(active.orgId);
  const invalidate = useInvalidateRentId();
  const [filter, setFilter] = useState<"open" | "all">("open");

  const rows = (maintenance.data ?? []).filter((m) =>
    filter === "all" ? true : m.status === "open" || m.status === "in_progress",
  );

  const openCount = (maintenance.data ?? []).filter(
    (m) => m.status === "open" || m.status === "in_progress",
  ).length;
  const urgentCount = (maintenance.data ?? []).filter(
    (m) => (m.status === "open" || m.status === "in_progress") && (m.priority === "urgent" || m.priority === "high"),
  ).length;

  async function advance(id: string, current: string) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    const patch: {
      status: "open" | "in_progress" | "resolved" | "closed";
      resolved_at?: string | null;
    } = { status: next as "open" | "in_progress" | "resolved" | "closed" };
    if (next === "resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("maintenance_requests").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${next.replace("_", " ")}.`);
    invalidate();
  }

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader title="Maintenance" subtitle={active.org?.name} />

      <SummaryGrid
        className="mt-5"
        items={[
          { label: "Open", value: String(openCount), tone: openCount > 0 ? ("warning" as const) : ("neutral" as const), hint: "Needs attention" },
          { label: "High priority", value: String(urgentCount), tone: urgentCount > 0 ? ("danger" as const) : ("neutral" as const), hint: "Urgent or high" },
        ]}
      />

      <div className="mt-5 flex gap-2">
        {(["open", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 font-display text-[12px] font-medium capitalize transition-colors ${
              filter === f ? "bg-brand text-brand-foreground" : "glass text-muted-foreground"
            }`}
          >
            {f === "open" ? "Open only" : "All requests"}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {maintenance.isLoading ? (
          <EmptyState title="Loading…" description="Fetching maintenance requests." />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filter === "open" ? "Nothing open" : "No requests"}
            description={
              filter === "open"
                ? "All maintenance is resolved — units are quiet."
                : "Maintenance requests will appear here as tenants submit them."
            }
          />
        ) : (
          <SectionCard title="Requests" aside={`${rows.length} shown`}>
            {rows.map((m) => {
              const info = m as {
                units?: { name?: string };
                properties?: { name?: string };
                tenancies?: { tenant_name?: string } | null;
              };
              return (
                <ListRow
                  key={m.id}
                  title={m.title}
                  subtitle={
                    [
                      info.units?.name ?? info.properties?.name ?? "",
                      info.tenancies?.tenant_name ? `Reported by ${info.tenancies.tenant_name}` : "",
                      m.created_at ? shortDate(m.created_at.slice(0, 10)) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  pill={
                    <div className="flex items-center gap-2">
                      <StatusPill status={m.priority} tone={TONE[m.priority] ?? "neutral"} />
                      <StatusPill status={m.status.replace("_", " ")} tone={m.status === "open" ? "warning" : m.status === "resolved" || m.status === "closed" ? "success" : "neutral"} />
                      {NEXT_STATUS[m.status] && (
                        <button
                          onClick={() => advance(m.id, m.status)}
                          className="rounded-full bg-brand px-2.5 py-1 font-display text-[10.5px] font-semibold text-brand-foreground"
                        >
                          {NEXT_STATUS[m.status] === "in_progress"
                            ? "Start"
                            : NEXT_STATUS[m.status] === "resolved"
                              ? "Resolve"
                              : "Close"}
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
