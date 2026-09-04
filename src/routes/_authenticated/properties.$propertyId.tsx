import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
  ToolbarButton,
} from "@/components/rentid/patterns";
import { EmptyState } from "@/components/rentid/Surface";
import { money } from "@/lib/format";
import { useActiveOrg, useInvalidateRentId, useProperty, useTenancies } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/properties/$propertyId")({
  head: () => ({
    meta: [
      { title: "Property — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertyDetail,
});

function AddUnitDialog({ propertyId }: { propertyId: string }) {
  const invalidate = useInvalidateRentId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    bedrooms: "1",
    bathrooms: "1",
    monthly_rent: "",
    security_deposit: "",
    rent_due_day: "1",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("units").insert({
        property_id: propertyId,
        name: form.name.trim(),
        bedrooms: Number(form.bedrooms) || null,
        bathrooms: Number(form.bathrooms) || null,
        monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
        security_deposit: form.security_deposit ? Number(form.security_deposit) : null,
        rent_due_day: Number(form.rent_due_day) || 1,
        occupancy_status: "vacant",
      });
      if (error) throw error;
      toast.success("Unit added.");
      setOpen(false);
      setForm({ ...form, name: "", monthly_rent: "", security_deposit: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the unit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolbarButton label="Add unit" />
      </DialogTrigger>
      <DialogContent className="rounded-3xl border-border/60 bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add a unit</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Unit name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Unit 1A" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Beds</Label>
              <Input type="number" min={0} step="0.5" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Baths</Label>
              <Input type="number" min={0} step="0.5" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Due day</Label>
              <Input type="number" min={1} max={28} value={form.rent_due_day} onChange={(e) => set("rent_due_day", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Monthly rent</Label>
              <Input type="number" min={0} value={form.monthly_rent} onChange={(e) => set("monthly_rent", e.target.value)} placeholder="1400" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Deposit</Label>
              <Input type="number" min={0} value={form.security_deposit} onChange={(e) => set("security_deposit", e.target.value)} placeholder="1400" />
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {busy ? "Saving…" : "Save unit"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteTenantDialog({
  propertyId,
  unitId,
  unitName,
  monthlyRent,
}: {
  propertyId: string;
  unitId: string;
  unitName: string;
  monthlyRent: number | null;
}) {
  const active = useActiveOrg();
  const invalidate = useInvalidateRentId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    monthly_rent: monthlyRent ? String(monthlyRent) : "",
    lease_start: "",
    lease_end: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active.orgId) return;
    setBusy(true);
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 14);

      // Create the (pending, unverified) tenancy and the invitation together.
      const { data: tenancy, error: tenancyErr } = await supabase
        .from("tenancies")
        .insert({
          organization_id: active.orgId,
          property_id: propertyId,
          unit_id: unitId,
          tenant_name: form.full_name.trim(),
          tenant_email: form.email.trim().toLowerCase(),
          tenant_phone: form.phone.trim() || null,
          status: "pending",
          monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
          start_date: form.lease_start || null,
          end_date: form.lease_end || null,
          verified: false,
        })
        .select("id")
        .single();
      if (tenancyErr) throw tenancyErr;

      const { error: inviteErr } = await supabase.from("tenant_invitations").insert({
        organization_id: active.orgId,
        property_id: propertyId,
        unit_id: unitId,
        tenancy_id: tenancy.id,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        monthly_rent: form.monthly_rent ? Number(form.monthly_rent) : null,
        lease_start: form.lease_start || null,
        lease_end: form.lease_end || null,
        status: "pending",
        expires_at: expires.toISOString(),
      });
      if (inviteErr) throw inviteErr;

      await supabase.from("units").update({ occupancy_status: "occupied" }).eq("id", unitId);

      toast.success(`Invitation ready for ${form.email.trim()}`);
      setOpen(false);
      setForm({ ...form, full_name: "", email: "", phone: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-7 rounded-full border-border px-3 text-[11.5px] font-medium"
        >
          Invite tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl border-border/60 bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Invite a tenant — {unitName}</DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          They'll receive a RentID invitation. When they accept, the tenancy becomes a verified
          tenancy for both sides.
        </p>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Tenant name</Label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required placeholder="Jordan Smith" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="jordan@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Monthly rent</Label>
              <Input type="number" min={0} value={form.monthly_rent} onChange={(e) => set("monthly_rent", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Lease start</Label>
              <Input type="date" value={form.lease_start} onChange={(e) => set("lease_start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Lease end</Label>
              <Input type="date" value={form.lease_end} onChange={(e) => set("lease_end", e.target.value)} />
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PropertyDetail() {
  const { propertyId } = Route.useParams();
  const active = useActiveOrg();
  const property = useProperty(propertyId);
  const tenancies = useTenancies(active.orgId);
  const invalidate = useInvalidateRentId();

  async function toggleOccupancy(unitId: string, current: string) {
    const next = current === "occupied" ? "vacant" : "occupied";
    const { error } = await supabase.from("units").update({ occupancy_status: next }).eq("id", unitId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  }

  const propertyTenancies = (tenancies.data ?? []).filter((t) => t.property_id === propertyId);

  if (property.isLoading) {
    return (
      <AppShell>
        <p className="text-[13px] text-muted-foreground">Loading property…</p>
      </AppShell>
    );
  }
  if (!property.data) {
    return (
      <AppShell>
        <EmptyState
          title="Property not found"
          description="This property may belong to a different workspace."
          action={
            <Link to="/properties" className="rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground">
              Back to properties
            </Link>
          }
        />
      </AppShell>
    );
  }

  const p = property.data;

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title={p.name}
        subtitle={`${p.street_address}, ${p.city}, ${p.state} ${p.zip}`}
        action={<AddUnitDialog propertyId={p.id} />}
      />

      <SectionCard title="Units" aside={`${(p.units ?? []).length} total`} className="mt-5">
        {(p.units ?? []).length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted-foreground">No units yet.</p>
        ) : (
          (p.units ?? []).map((u) => {
            const tenancy = (tenancies.data ?? []).find(
              (t) => t.unit_id === u.id && t.status !== "cancelled" && t.status !== "ended",
            );
            return (
              <ListRow
                key={u.id}
                title={u.name}
                subtitle={
                  [
                    u.bedrooms != null ? `${u.bedrooms} bd` : null,
                    u.bathrooms != null ? `${u.bathrooms} ba` : null,
                    u.monthly_rent != null ? `${money(Number(u.monthly_rent))}/mo` : null,
                    tenancy?.tenant_name ? `Tenant: ${tenancy.tenant_name}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }
                pill={
                  <StatusPill
                    status={u.occupancy_status === "occupied" ? "Occupied" : "Vacant"}
                    tone={u.occupancy_status === "occupied" ? "success" : "neutral"}
                  />
                }
                value={
                  <div className="flex shrink-0 items-center gap-1.5">
                    <InviteTenantDialog
                      propertyId={p.id}
                      unitId={u.id}
                      unitName={u.name}
                      monthlyRent={u.monthly_rent != null ? Number(u.monthly_rent) : null}
                    />
                    <Button
                      variant="ghost"
                      onClick={() => toggleOccupancy(u.id, u.occupancy_status)}
                      className="h-7 rounded-full px-2 text-[11.5px] text-muted-foreground"
                    >
                      {u.occupancy_status === "occupied" ? "Vacate" : "Fill"}
                    </Button>
                  </div>
                }
              />
            );
          })
        )}
      </SectionCard>

      <SectionCard title="Tenancies" aside={`${propertyTenancies.length} total`} className="mt-4">
        {propertyTenancies.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted-foreground">No tenancies for this property.</p>
        ) : (
          propertyTenancies.map((t) => (
            <ListRow
              key={t.id}
              title={t.tenant_name ?? "Tenant"}
              subtitle={t.units?.name ?? ""}
              pill={
                t.verified ? (
                  <StatusPill status="Verified" tone="success" />
                ) : (
                  <StatusPill status={t.status === "pending" ? "Invited" : t.status} tone="warning" />
                )
              }
              value={
                <Link
                  to="/tenants/$tenancyId"
                  params={{ tenancyId: t.id }}
                  className="text-[12.5px] font-medium text-brand"
                >
                  Manage
                </Link>
              }
            />
          ))
        )}
      </SectionCard>
    </AppShell>
  );
}
