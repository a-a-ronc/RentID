import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { useActiveOrg, useProperties, useInvalidateRentId } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/properties/")({
  head: () => ({
    meta: [
      { title: "Properties — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertiesPage,
});

type PropertyType =
  | "single_family"
  | "multi_family"
  | "condo"
  | "townhouse"
  | "apartment"
  | "other";

const PROPERTY_TYPES: readonly [PropertyType, string][] = [
  ["single_family", "Single family"],
  ["multi_family", "Multi family"],
  ["condo", "Condo"],
  ["townhouse", "Townhouse"],
  ["apartment", "Apartment"],
  ["other", "Other"],
];

function AddPropertyDialog() {
  const active = useActiveOrg();
  const invalidate = useInvalidateRentId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    street_address: "",
    city: "",
    state: "",
    zip: "",
    property_type: "multi_family" as PropertyType,
    unit_count: "1",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active.orgId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("properties").insert({
        organization_id: active.orgId,
        name: form.name.trim(),
        street_address: form.street_address.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zip: form.zip.trim(),
        property_type: form.property_type,
        unit_count: Number(form.unit_count) || 1,
      });
      if (error) throw error;
      toast.success("Property added.");
      setOpen(false);
      setForm({ ...form, name: "", street_address: "", city: "", state: "", zip: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the property.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ToolbarButton label="Add property" />
      </DialogTrigger>
      <DialogContent className="rounded-3xl border-border/60 bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add a property</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Mapleton Flats" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Street address</Label>
            <Input value={form.street_address} onChange={(e) => set("street_address", e.target.value)} required placeholder="1200 Mapleton Ave" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 space-y-1.5">
              <Label className="text-[12px]">City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">State</Label>
              <Input value={form.state} onChange={(e) => set("state", e.target.value)} required placeholder="MI" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">ZIP</Label>
              <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Type</Label>
              <select
                value={form.property_type}
                onChange={(e) => set("property_type", e.target.value)}
                className="h-9 w-full rounded-xl border border-input bg-card px-3 text-[13px]"
              >
                {PROPERTY_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Units</Label>
              <Input
                type="number"
                min={1}
                value={form.unit_count}
                onChange={(e) => set("unit_count", e.target.value)}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {busy ? "Saving…" : "Save property"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PropertiesPage() {
  const active = useActiveOrg();
  const properties = useProperties(active.orgId);

  const summary = useMemo(() => {
    const units = (properties.data ?? []).flatMap((p) => p.units ?? []);
    const occupied = units.filter((u) => u.occupancy_status === "occupied").length;
    const rent = units.reduce((sum, u) => sum + Number(u.monthly_rent ?? 0), 0);
    return { total: units.length, occupied, rent };
  }, [properties.data]);

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title="Properties"
        subtitle={
          active.org
            ? `${active.org.name} · ${summary.total} units · ${summary.occupied} occupied · ${money(summary.rent)}/mo`
            : undefined
        }
        action={<AddPropertyDialog />}
      />

      <div className="mt-5 space-y-3">
        {properties.isLoading ? (
          <EmptyState title="Loading…" description="Fetching your properties." />
        ) : (properties.data ?? []).length === 0 ? (
          <EmptyState
            title="No properties yet"
            description="Add your first property to start tracking units, leases and rent."
            action={<AddPropertyDialog />}
          />
        ) : (
          (properties.data ?? []).map((p, i) => {
            const units = p.units ?? [];
            const occupied = units.filter((u) => u.occupancy_status === "occupied").length;
            return (
              <Link
                key={p.id}
                to="/properties/$propertyId"
                params={{ propertyId: p.id }}
                className="block"
              >
                <SectionCard title={p.name} aside={`${p.city}, ${p.state}`} className="transition-opacity hover:opacity-90" >
                  <ListRow
                    title={`${units.length} unit${units.length === 1 ? "" : "s"} · ${occupied} occupied`}
                    subtitle={p.street_address}
                    pill={<StatusPill status={p.property_type.replace("_", " ")} tone="neutral" />}
                    delay={i * 60}
                  />
                </SectionCard>
              </Link>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
