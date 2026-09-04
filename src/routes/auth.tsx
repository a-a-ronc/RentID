import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RentIDLogo } from "@/components/rentid/Logo";
import { Eyebrow } from "@/components/rentid/Surface";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — RentID" },
      { name: "description", content: "Sign in or create your RentID account." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

async function resolveHome(userId: string, email: string | undefined): Promise<string> {
  // Landlord-ish role -> dashboard (onboarding first if they have no workspace yet).
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  if (roleSet.has("landlord") || roleSet.has("property_manager")) {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_id", userId)
      .limit(1);
    return orgs && orgs.length > 0 ? "/dashboard" : "/onboarding";
  }
  if (roleSet.has("tenant")) return "/tenant";

  // Pending invitation for this email -> tenant flow.
  if (email) {
    const { data: invites } = await supabase
      .from("tenant_invitations")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("status", "pending")
      .limit(1);
    if (invites && invites.length > 0) return "/tenant";
  }
  return "/dashboard";
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"landlord" | "tenant">("landlord");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);


  async function finishSignup(userId: string) {
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ full_name: fullName || null })
      .eq("id", userId);
    if (profileErr) console.error(profileErr);
    const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (roleErr) console.error(roleErr);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.user) await finishSignup(data.user.id);
        toast.success("Account created — you're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data: sess } = await supabase.auth.getSession();
      const dest = await resolveHome(sess.session!.user.id, sess.session!.user.email);
      navigate({ to: dest, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setOauthBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return; // browser navigates to Google
      setOauthBusy(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed.");
      setOauthBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-8 pb-10">
        <RentIDLogo markClassName="size-8" wordmarkClassName="text-[19px]" />

        <div className="mt-10">
          <Eyebrow>{mode === "signup" ? "Create account" : "Welcome back"}</Eyebrow>
          <h1 className="mt-2 font-display text-[28px] leading-tight font-bold tracking-tight">
            {mode === "signup" ? "Your rental record starts here." : "Sign in to your ledger."}
          </h1>
        </div>

        <form onSubmit={submit} className="glass mt-6 rounded-2xl p-5">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-[12px]">
                Full name
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Rivera"
                autoComplete="name"
                required
              />
            </div>
          )}

          {mode === "signup" && (
            <div className="mt-4">
              <Label className="text-[12px]">I am a…</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {(["landlord", "tenant"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-xl border px-3 py-2.5 text-[13px] font-medium capitalize transition-colors ${
                      role === r
                        ? "border-brand bg-brand/8 text-brand"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="email" className="text-[12px]">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="password" className="text-[12px]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-brand text-[14px] font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="label-eyebrow">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={googleSignIn}
            disabled={oauthBusy}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
              />
            </svg>
            {oauthBusy ? "Connecting…" : "Continue with Google"}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New to RentID?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="font-medium text-brand"
          >
            {mode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}
