import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { shortDate } from "@/lib/format";
import { useActiveOrg, useDocuments, useInvalidateRentId, useTenancies } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentsPage,
});

const DOC_KINDS = [
  "lease",
  "move_in_inspection",
  "notice",
  "receipt",
  "photo",
  "other",
] as const;

type DocKind = (typeof DOC_KINDS)[number];

function UploadDialog() {
  const active = useActiveOrg();
  const tenancies = useTenancies(active.orgId);
  const invalidate = useInvalidateRentId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tenancyId, setTenancyId] = useState("");
  const [kind, setKind] = useState<DocKind>("other");
  const [title, setTitle] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    if (!active.orgId) return;
    setBusy(true);
    try {
      const tenancy = (tenancies.data ?? []).find((t) => t.id === tenancyId);
      const path = `${active.orgId}/${tenancyId || "general"}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error } = await supabase.from("documents").insert({
        organization_id: active.orgId,
        tenancy_id: tenancyId || null,
        property_id: tenancy?.property_id ?? null,
        unit_id: tenancy?.unit_id ?? null,
        kind,
        title: title.trim() || file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        visible_to_tenant: true,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (error) throw error;

      toast.success("Document uploaded.");
      setOpen(false);
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Upload document">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <ToolbarButton label="Upload" />
        </DialogTrigger>
        <DialogContent className="rounded-3xl border-border/60 bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Upload a document</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Attach to tenancy</Label>
              <select
                value={tenancyId}
                onChange={(e) => setTenancyId(e.target.value)}
                className="h-9 w-full rounded-xl border border-input bg-card px-3 text-[13px]"
                required
              >
                <option value="">Choose…</option>
                {(tenancies.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tenant_name ?? "Tenant"} — {t.units?.name ?? ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Kind</Label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="h-9 w-full rounded-xl border border-input bg-card px-3 text-[13px]"
                >
                  {["lease", "move_in_inspection", "notice", "receipt", "photo", "other"].map((k) => (
                    <option key={k} value={k}>
                      {k.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">File</Label>
              <Input ref={fileInput} type="file" className="h-9 rounded-xl text-[12px]" required />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground hover:bg-brand/90"
            >
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DocumentsPage() {
  const active = useActiveOrg();
  const documents = useDocuments(active.orgId);

  async function open(path: string) {
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
        title="Documents"
        subtitle={active.org?.name}
        action={<UploadDialog />}
      />

      <div className="mt-5">
        {documents.isLoading ? (
          <EmptyState title="Loading…" description="Fetching documents." />
        ) : (documents.data ?? []).length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Leases, inspections and notices you upload appear here and can be shared with tenants."
          />
        ) : (
          <SectionCard title="All documents" aside={`${(documents.data ?? []).length} on file`}>
            {(documents.data ?? []).map((d) => {
              const info = d as { tenancies?: { tenant_name?: string } | null };
              return (
                <ListRow
                  key={d.id}
                  title={d.title}
                  subtitle={
                    [info.tenancies?.tenant_name ?? "", d.created_at ? shortDate(d.created_at.slice(0, 10)) : ""]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  pill={<StatusPill status={d.kind.replace(/_/g, " ")} tone="neutral" />}
                  value={
                    <button onClick={() => open(d.storage_path)} className="text-[12.5px] font-medium text-brand">
                      Open
                    </button>
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
