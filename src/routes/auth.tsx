/**
 * /auth — sign in and create an account.
 *
 * Every outcome is visible on the page itself, not only in a toast:
 *   - each field says what's wrong with it, under the field, on submit and
 *     once the user leaves it;
 *   - a failed sign-in shows one banner, "Incorrect email or password", and
 *     never says which (standard practice: don't confirm which emails exist);
 *   - a new account gets an explicit success state before redirecting, or a
 *     "check your email" state if confirmation is switched on;
 *   - "Forgot password?" sits directly under the Sign in button.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AuthInput,
  AuthLayout,
  FormBanner,
  PasswordInput,
  PasswordRule,
} from "@/components/rentid/AuthLayout";
import { Button, Field } from "@/components/rentid/kit";
import { Eyebrow } from "@/components/rentid/Surface";
import { authService } from "@/lib/auth";
import { homePathFor, safeNextPath } from "@/lib/auth-routing";
import {
  friendlyAuthError,
  hasErrors,
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateFullName,
  validatePassword,
  type FieldErrors,
} from "@/lib/auth-validation";
import type { AppRole } from "@/lib/types";

type Mode = "signin" | "signup";
type AuthSearch = { mode?: Mode; next?: string; email?: string; notice?: "password-updated" };

export const Route = createFileRoute("/auth")({
  // Client-rendered: the form is driven entirely by local session state.
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    ...(search["mode"] === "signup" || search["mode"] === "signin"
      ? { mode: search["mode"] as Mode }
      : {}),
    ...(typeof search["next"] === "string" ? { next: search["next"] } : {}),
    ...(typeof search["email"] === "string" ? { email: search["email"] } : {}),
    ...(search["notice"] === "password-updated" ? { notice: "password-updated" as const } : {}),
  }),
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
        content:
          "Landlords and tenants sign in to RentID to manage tenancies and verified rental history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const ROLES = [
  { value: "landlord", title: "Landlord", copy: "Manage properties and tenancies" },
  { value: "tenant", title: "Tenant", copy: "Accept an invitation, build history" },
  { value: "property_manager", title: "Property manager", copy: "Manage on behalf of owners" },
] as const;

type FieldName = "fullName" | "email" | "password";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [role, setRole] = useState<AppRole>("landlord");
  const [values, setValues] = useState({ fullName: "", email: search.email ?? "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<
    { kind: "created"; destination: string } | { kind: "confirm"; email: string } | null
  >(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const errors: FieldErrors<FieldName> = {};
  const nameError = mode === "signup" ? validateFullName(values.fullName) : null;
  const emailError = validateEmail(values.email);
  const passwordError = validatePassword(values.password, mode === "signup" ? "new" : "signin");
  if (nameError) errors.fullName = nameError;
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  const show = (f: FieldName) => (submitted || touched[f] ? errors[f] : undefined);

  // Switching tabs starts the form fresh, but keeps what was typed.
  function switchMode(next: Mode) {
    setMode(next);
    setFormError(null);
    setSubmitted(false);
    setTouched({});
  }

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  function destination(roles: AppRole[]) {
    const origin = typeof window === "undefined" ? undefined : window.location.origin;
    return safeNextPath(search.next, origin) ?? homePathFor(roles);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (hasErrors(errors)) {
      // Focus the first field that needs fixing.
      const first = (["fullName", "email", "password"] as const).find((f) => errors[f]);
      if (first) document.getElementById(first)?.focus();
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await authService.signUp({
          email: values.email,
          password: values.password,
          fullName: values.fullName,
          role,
        });
        if (result.needsEmailConfirmation || !result.session) {
          setDone({ kind: "confirm", email: values.email.trim() });
          return;
        }
        const to = role === "tenant" ? "/tenant" : "/onboarding";
        setDone({ kind: "created", destination: to });
        toast.success("Your RentID account is ready.");
        window.setTimeout(() => void navigate({ to, replace: true }), 1200);
        return;
      }

      const session = await authService.signIn(values.email, values.password);
      toast.success("Welcome back.");
      await navigate({ to: destination(session.roles), replace: true });
    } catch (error) {
      setFormError(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  if (done?.kind === "confirm") {
    return (
      <AuthLayout title="Check your email">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
            <MailCheck className="size-5" />
          </span>
          <p className="mt-3 text-[13.5px] leading-relaxed">
            We sent a confirmation link to <strong>{done.email}</strong>. Open it to activate your
            account, then sign in.
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Nothing after a few minutes? Check your spam folder.
          </p>
          <Button
            tone="secondary"
            className="mt-4 w-full"
            onClick={() => {
              setDone(null);
              switchMode("signin");
            }}
          >
            Back to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done?.kind === "created") {
    return (
      <AuthLayout title="Account created">
        <FormBanner tone="success">
          Welcome to RentID, {values.fullName.trim().split(/\s+/)[0]}. Taking you to your account…
        </FormBanner>
        <Button
          className="mt-4 w-full"
          onClick={() => void navigate({ to: done.destination, replace: true })}
        >
          Continue
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={mode === "signin" ? "Sign in to RentID" : "Create your RentID account"}
      subtitle="Verified tenancies, real rent history, and one place for landlords and tenants."
      footer={
        mode === "signin" ? (
          <>
            New to RentID?{" "}
            <button
              type="button"
              className="font-medium text-brand hover:underline"
              onClick={() => switchMode("signup")}
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-brand hover:underline"
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
          </>
        )
      }
    >
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
        {(["signin", "signup"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => switchMode(option)}
            className={`rounded-full py-2 font-display text-[12.5px] font-semibold transition-colors ${
              mode === option ? "bg-brand text-brand-foreground" : "text-muted-foreground"
            }`}
          >
            {option === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      {search.notice === "password-updated" && mode === "signin" && !formError ? (
        <FormBanner tone="success" className="mt-4">
          Your password was updated. Sign in with your new password.
        </FormBanner>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-4 space-y-3">
        {formError ? (
          <div ref={errorRef} tabIndex={-1} className="outline-none">
            <FormBanner tone="error">
              {formError}
              {mode === "signin" && /incorrect email or password/i.test(formError) ? (
                <>
                  {" "}
                  <Link
                    to="/forgot-password"
                    search={values.email ? { email: values.email.trim() } : {}}
                    className="font-semibold underline underline-offset-2"
                  >
                    Reset your password
                  </Link>
                </>
              ) : null}
              {mode === "signup" && /already exists/i.test(formError) ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-semibold underline underline-offset-2"
                    onClick={() => switchMode("signin")}
                  >
                    Sign in instead
                  </button>
                </>
              ) : null}
            </FormBanner>
          </div>
        ) : null}

        {mode === "signup" ? (
          <>
            <Field label="Full name" htmlFor="fullName" error={show("fullName") ?? null}>
              <AuthInput
                id="fullName"
                name="fullName"
                autoComplete="name"
                placeholder="Avery Whitfield"
                value={values.fullName}
                invalid={Boolean(show("fullName"))}
                onChange={(e) => setValues({ ...values, fullName: e.target.value })}
                onBlur={() => setTouched({ ...touched, fullName: true })}
              />
            </Field>
            <div className="space-y-1.5">
              <Eyebrow>I am a</Eyebrow>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">
                {ROLES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={role === option.value}
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

        <Field label="Email" htmlFor="email" error={show("email") ?? null}>
          <AuthInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={values.email}
            invalid={Boolean(show("email"))}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            onBlur={() => setTouched({ ...touched, email: true })}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={show("password") ?? null}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={values.password}
            invalid={Boolean(show("password"))}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            onBlur={() => setTouched({ ...touched, password: true })}
          />
        </Field>
        {mode === "signup" ? (
          <PasswordRule met={values.password.length >= MIN_PASSWORD_LENGTH}>
            At least {MIN_PASSWORD_LENGTH} characters. A short phrase works well.
          </PasswordRule>
        ) : null}

        <Button type="submit" loading={busy} disabled={busy} className="w-full">
          {mode === "signin"
            ? busy
              ? "Signing in…"
              : "Sign in"
            : busy
              ? "Creating your account…"
              : "Create account"}
        </Button>

        {mode === "signin" ? (
          <div className="text-center">
            <Link
              to="/forgot-password"
              search={values.email.trim() ? { email: values.email.trim() } : {}}
              className="text-[12.5px] font-medium text-brand hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        ) : null}
      </form>

      <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
        Protected by row-level security and encrypted at rest.
      </p>
    </AuthLayout>
  );
}
