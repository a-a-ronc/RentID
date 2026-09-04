import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell, PageHeader, SectionCard } from "@/components/rentid/patterns";
import { Eyebrow } from "@/components/rentid/Surface";
import { useProfile } from "@/lib/auth";
import { useActiveOrg, useInvalidateRentId } from "@/lib/rentid";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const profile = useProfile();
  const active = useActiveOrg();
  const invalidate = useInvalidateRentId();
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile.data?.full_name != null) setName(profile.data.full_name);
  }, [profile.data?.full_name]);

  useEffect(() => {
    if (active.org?.name) setOrgName(active.org.name);
  }, [active.org?.name]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() || null })
        .eq("id", profile.data?.id ?? "");
      if (profileErr) throw profileErr;
      if (active.org && orgName.trim() && orgName.trim() !== active.org.name) {
        const { error: orgErr } = await supabase
          .from("organizations")
          .update({ name: orgName.trim() })
          .eq("id", active.org.id);
        if (orgErr) throw orgErr;
      }
      toast.success("Settings saved.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader title="Settings" subtitle={active.org?.name} />

      <form onSubmit={save} className="mt-5">
        <SectionCard title="Profile & workspace">
          <div className="space-y-3.5 px-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Your name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Workspace name</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              {active.isDemo && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This is the shared demo portfolio — create your own workspace from the dashboard.
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand px-5 text-[13px] font-semibold text-brand-foreground hover:bg-brand/90"
            >
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </SectionCard>
      </form>

      <SectionCard title="Account" className="mt-4">
        <div className="px-4 py-4">
          <Eyebrow>Signed in as</Eyebrow>
          <p className="num mt-1 text-[13px]">{profile.data?.email ?? "—"}</p>
          <Button
            onClick={signOut}
            variant="outline"
            className="mt-4 rounded-xl border-border text-[13px] font-medium"
          >
            Sign out
          </Button>
        </div>
      </SectionCard>
    </AppShell>
  );
}
