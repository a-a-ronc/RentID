import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/rentid/patterns";
import { EmptyState, Glass, Eyebrow } from "@/components/rentid/Surface";
import { money, shortDate } from "@/lib/format";
import { useActiveOrg, useDocuments, useInvalidateRentId, usePayments, useTenancies } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/tenants/$tenancyId")({
  head: () => ({
    meta: [
      { title: "Tenancy — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenancyDetail,
});

function TenancyDetail() {
  const { tenancyId } = Route.useParams();
  const active = useActiveOrg();
  const invalidate = useInvalidateRentId();
  const tenancies = useTenancies(active.orgId);
  const payments = usePayments(active.orgId);
  const documents = useDocuments(active.orgId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [leaseName, setLeaseName] = useState("");
  const [busy, setBusy] = useState(false);

  const tenancy = (tenancies.data ?? []).find((t) => t.id === tenancyId);

  if (tenancies.isLoading) {
    return (
      <AppShell>
        <p className="text-[13px] text-muted-foreground">Loading tenancy…</p>
      </AppShell>
    );
  }
  if (!tenancy) {
    return (
      <AppShell>
        <EmptyState
          title="Tenancy not found"
          description="This tenancy may belong to a different workspace."
          action={
            <Link to="/tenants" className="rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground">
              Back to tenants
            </Link>
          }
        />
      </AppShell>
    );
  }

  const tenancyPayments = (payments.data ?? []).filter((p) => p.tenancy_id === tenancyId);
  const tenancyDocs = (documents.data ?? []).filter((d) => d.tenancy_id === tenancyId);

  async function verify() {
    const { error } = await supabase
      .from("tenancies")
      .update({ verified: true, verified_at: new Date().toISOString(), status: "active" })
      .eq("id", tenancyId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("verification_records").insert({
      tenancy_id: tenancyId,
      subject_user_id: tenancy.tenant_user_id,
      record_type: "tenancy",
      label: "Verified Tenancy — Confirmed by landlord",
    });
    toast.success("Tenancy verified.");
    invalidate();
  }

  async function uploadLease(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    if (!active.orgId) return;
    setBusy(true);
    try {
      const path = `${active.orgId}/${tenancyId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      // Create or update the lease record for this tenancy.
      const { data: existingLease } = await supabase
        .from("leases")
        .select("id")
        .eq("tenancy_id", tenancyId)
        .maybeSingle();

      let leaseId = existingLease?.id;
      if (leaseId) {
        await supabase
          .from("leases")
          .update({ document_path: path })
          .eq("id", leaseId);
      } else {
        const { data: lease, error: leaseErr } = await supabase
          .from("leases")
          .insert({
            organization_id: active.orgId,
            tenancy_id: tenancyId,
            unit_id: tenancy.unit_id,
            start_date: tenancy.start_date,
            end_date: tenancy.end_date,
            monthly_rent: tenancy.monthly_rent,
            document_path: path,
          })
          .select("id")
          .single();
        if (leaseErr) throw leaseErr;
        leaseId = lease.id;
      }

      const { error: docErr } = await supabase.from("documents").insert({
        organization_id: active.orgId,
        tenancy_id: tenancyId,
        property_id: tenancy.property_id,
        unit_id: tenancy.unit_id,
        lease_id: leaseId,
        kind: "lease",
        title: leaseName.trim() || file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        visible_to_tenant: true,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (docErr) throw docErr;

      toast.success("Lease uploaded and attached.");
      setLeaseName("");
      if (fileInput.current) fileInput.current.value = "";
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function viewDoc(path: string) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error("Could not open the document.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title={tenancy.tenant_name ?? "Tenant"}
        subtitle={[tenancy.properties?.name ?? "", tenancy.units?.name ?? ""].filter(Boolean).join(" · ")}
        action={
          tenancy.verified ? (
            <StatusPill status="Verified tenancy" tone="success" />
          ) : (
            <Button
              onClick={verify}
              className="rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground hover:bg-brand/90"
            >
              <BadgeCheck className="size-3.5" /> Verify tenancy
            </Button>
          )
        }
      />

      <SectionCard title="Lease" aside={tenancy.verified ? "Active" : "Pending"} className="mt-5">
        <ListRow
          title="Term"
          subtitle={`${tenancy.start_date ? shortDate(tenancy.start_date) : "—"} → ${tenancy.end_date ? shortDate(tenancy.end_date) : "—"}`}
          value={tenancy.monthly_rent != null ? `${money(Number(tenancy.monthly_rent))}/mo` : undefined}
        />
        <div className="px-4 py-4">
          <form onSubmit={uploadLease} className="space-y-2.5">
            <Eyebrow>Attach lease document</Eyebrow>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={fileInput}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                className="h-9 max-w-xs rounded-xl text-[12px]"
                required
              />
              <Input
                value={leaseName}
                onChange={(e) => setLeaseName(e.target.value)}
                placeholder="Name (optional)"
                className="h-9 max-w-[12rem] rounded-xl text-[12px]"
              />
              <Button
                type="submit"
                disabled={busy}
                className="h-9 rounded-xl bg-brand px-4 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
              >
                <FileUp className="size-3.5" /> {busy ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
        </div>
      </SectionCard>

      <SectionCard title="Rent history" aside={`${tenancyPayments.length} records`} className="mt-4">
        {tenancyPayments.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted-foreground">No payments recorded.</p>
        ) : (
          tenancyPayments.slice(0, 8).map((p) => (
            <ListRow
              key={p.id}
              title={p.due_date ? shortDate(p.due_date) : "—"}
              subtitle={p.status === "paid" && p.days_late ? `${p.days_late} day${p.days_late === 1 ? "" : "s"} late` : "Rent"}
              value={money(Number(p.amount))}
              pill={
                <StatusPill
                  status={p.status}
                  tone={p.status === "paid" ? "success" : p.status === "late" ? "danger" : "neutral"}
                />
              }
            />
          ))
        )}
      </SectionCard>

      <SectionCard title="Documents" aside={`${tenancyDocs.length} on file`} className="mt-4">
        {tenancyDocs.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted-foreground">No documents yet.</p>
        ) : (
          tenancyDocs.map((d) => (
            <ListRow
              key={d.id}
              title={d.title}
              subtitle={d.created_at ? shortDate(d.created_at.slice(0, 10)) : ""}
              pill={<StatusPill status={d.kind.replace(/_/g, " ")} tone="neutral" />}
              value={
                <button
                  onClick={() => viewDoc(d.storage_path)}
                  className="text-[12.5px] font-medium text-brand"
                >
                  Open
                </button>
              }
            />
          ))
        )}
      </SectionCard>

      {tenancy.verified && (
        <Glass className="mt-4 p-4">
          <Eyebrow>Verification</Eyebrow>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {tenancy.verified_at
              ? `Verified on ${shortDate(tenancy.verified_at.slice(0, 10))}. This tenancy counts toward both parties' RentID reputation.`
              : "This tenancy is verified and counts toward both parties' RentID reputation."}
          </p>
        </Glass>
      )}
    </AppShell>
  );
}
