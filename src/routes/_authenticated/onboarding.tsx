import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Glass, Eyebrow } from "@/components/rentid/Surface";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { useInvalidateRentId } from "@/lib/rentid";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your workspace — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useProfile();
  const invalidate = useInvalidateRentId();
  const [orgName, setOrgName] = useState("");
  const [portfolioSize, setPortfolioSize] = useState("1-4 units");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const name = orgName.trim() || `${profile.data?.full_name ?? "My"} Portfolio`;
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name, owner_id: user.id, is_demo: false })
        .select("id")
        .single();
      if (orgErr) throw orgErr;

      const { error: memberErr } = await supabase
        .from("organization_members")
        .insert({ organization_id: org.id, user_id: user.id, role: "landlord" });
      if (memberErr) console.error(memberErr);

      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role: "landlord" });
      if (roleErr) console.error(roleErr);

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true, portfolio_size: portfolioSize })
        .eq("id", user.id);
      if (profileErr) console.error(profileErr);

      invalidate();
      toast.success("Workspace ready — start by adding a property.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create your workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[34rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
      </div>
      <div className="relative mx-auto w-full max-w-md px-5 pt-16">
        <Eyebrow>Landlord onboarding</Eyebrow>
        <h1 className="mt-2 font-display text-[26px] leading-tight font-bold tracking-tight">
          Set up your portfolio workspace.
        </h1>

        <form onSubmit={submit} className="mt-6">
          <Glass className="p-5">
            <div className="space-y-1.5">
              <Label htmlFor="orgName" className="text-[12px]">
                Portfolio name
              </Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Rivera Properties"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave blank to use your name.
              </p>
            </div>

            <div className="mt-4">
              <Label className="text-[12px]">Portfolio size</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {["1-4 units", "5-20 units", "20+ units"].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPortfolioSize(size)}
                    className={`rounded-xl border px-2 py-2.5 text-[12px] font-medium transition-colors ${
                      portfolioSize === size
                        ? "border-brand bg-brand/8 text-brand"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground hover:bg-brand/90"
            >
              {busy ? "Creating…" : "Create workspace"}
            </Button>
          </Glass>
        </form>

        <p className="mt-4 text-center text-[12px] text-muted-foreground">
          You can rename this later in Settings.
        </p>
      </div>
    </div>
  );
}
