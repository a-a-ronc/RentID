import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  Button,
  DemoNotice,
  Eyebrow,
  Field,
  Glass,
  TextInput,
} from "@/components/rentid/patterns";
import { RentIDLogo } from "@/components/rentid/Logo";
import { authService } from "@/lib/auth";
import { DEMO_ACCOUNTS } from "@/lib/services";
import type { AppRole } from "@/lib/types";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — RentID" },
      {
        name: "description",
        content:
          "Sign in to RentID to manage properties, tenancies and verified rental history — or accept a landlord invitation as a tenant.",
      },
      { property: "og:title", content: "Sign in — RentID" },
      {
        property: "og:description",
        content: "Landlords and tenants sign in to RentID to manage tenancies and verified rental history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<AppRole>("landlord");
  const [busy, setBusy] = useState(false);

  async function route(roles: AppRole[]) {
    if (roles.includes("tenant") && !roles.includes("landlord")) {
      await navigate({ to: "/tenant", replace: true });
      return;
    }
    await navigate({ to: "/dashboard", replace: true });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    try {
      if (mode === "signup") {
        const session = await authService.signUp({
          email,
          password,
          fullName: String(form.get("fullName") ?? ""),
          role,
        });
        toast.success("Account created.");
        if (role === "tenant") await navigate({ to: "/tenant", replace: true });
        else await navigate({ to: "/onboarding", replace: true });
        return session;
      }
      const session = await authService.signIn(email, password);
      toast.success("Welcome back.");
      await route(session.roles);
      return session;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function demoSignIn(kind: "landlord" | "tenant") {
    const account = DEMO_ACCOUNTS[kind];
    setBusy(true);
    try {
      const session = await authService.signIn(account.email, account.password);
      await route(session.roles);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Demo sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-16 size-72 rounded-full bg-brand/12 blur-3xl" />
        <div className="absolute -right-16 bottom-0 size-72 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <RentIDLogo markClassName="size-9" wordmarkClassName="text-[24px]" />
          <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight">
            {mode === "signin" ? "Sign in to RentID" : "Create your RentID account"}
          </h1>
          <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
            Verified tenancies, real rent history, and one place for landlords and tenants.
          </p>
        </div>

        <Glass className="mt-6 p-5">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
            {(["signin", "signup"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setMode(option)}
                className={`rounded-full py-2 font-display text-[12.5px] font-semibold transition-colors ${
                  mode === option ? "bg-brand text-brand-foreground" : "text-muted-foreground"
                }`}
              >
                {option === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-4 space-y-3">
            {mode === "signup" ? (
              <>
                <Field label="Full name" htmlFor="fullName">
                  <TextInput id="fullName" name="fullName" required placeholder="Avery Whitfield" />
                </Field>
                <div className="space-y-1.5">
                  <Eyebrow>I am a</Eyebrow>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "landlord", title: "Landlord", copy: "Manage properties and tenancies" },
                        { value: "tenant", title: "Tenant", copy: "Accept an invitation, build history" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRole(option.value)}
                        className={`rounded-2xl border p-3 text-left transition-colors ${
                          role === option.value
                            ? "border-brand bg-brand/6"
                            : "border-border bg-card/60 hover:border-brand/40"
                        }`}
                      >
                        <p className="font-display text-[13px] font-semibold">{option.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{option.copy}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            <Field label="Email" htmlFor="email">
              <TextInput id="email" name="email" type="email" required autoComplete="email" placeholder="you@email.com" />
            </Field>
            <Field label="Password" htmlFor="password" {...(mode === "signup" ? { hint: "At least 8 characters." } : {})}>
              <TextInput
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
              />
            </Field>

            <Button type="submit" loading={busy} className="w-full">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-4 space-y-2">
            <Eyebrow>Explore the demo</Eyebrow>
            <div className="grid grid-cols-2 gap-2">
              <Button tone="secondary" size="sm" onClick={() => void demoSignIn("landlord")} disabled={busy}>
                Landlord demo
              </Button>
              <Button tone="secondary" size="sm" onClick={() => void demoSignIn("tenant")} disabled={busy}>
                Tenant demo
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <DemoNotice>
              Accounts are local to this preview while the backend is offline — nothing is sent anywhere. Real
              authentication is wired in when the database reconnects.
            </DemoNotice>
          </div>
        </Glass>
      </div>
    </main>
  );
}
