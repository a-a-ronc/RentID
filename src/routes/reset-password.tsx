/**
 * /reset-password — where the emailed reset link lands.
 *
 * Supabase puts a one-time recovery session in the link; the client picks it
 * up from the URL on load. With it, the user chooses a new password (typed
 * twice). Without it, because the link expired or was already used, we say so and offer a fresh link instead
 * of showing a form that can only fail.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AuthLayout,
  FormBanner,
  PasswordInput,
  PasswordRule,
} from "@/components/rentid/AuthLayout";
import { Button, Field } from "@/components/rentid/kit";
import { authService } from "@/lib/auth";
import {
  friendlyAuthError,
  hasErrors,
  MIN_PASSWORD_LENGTH,
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth-validation";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Choose a new password — RentID" }, { name: "robots", content: "noindex" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void authService.getRecoveryState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const errors: { password?: string; confirm?: string } = {};
  const passwordError = validatePassword(values.password, "new");
  const confirmError = validatePasswordConfirmation(values.password, values.confirm);
  if (passwordError) errors.password = passwordError;
  if (confirmError) errors.confirm = confirmError;
  const show = (f: "password" | "confirm") => (submitted || touched[f] ? errors[f] : undefined);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (hasErrors(errors)) {
      document.getElementById(errors.password ? "password" : "confirm")?.focus();
      return;
    }
    setBusy(true);
    try {
      await authService.updatePassword(values.password);
      // End the recovery session so the new password is what proves identity.
      await authService.signOut();
      toast.success("Password updated.");
      await navigate({ to: "/auth", search: { notice: "password-updated" }, replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return (
      <AuthLayout title="Choose a new password">
        <div
          className="h-24 animate-pulse rounded-2xl bg-muted/40"
          aria-label="Checking your link"
        />
      </AuthLayout>
    );
  }

  if (state === "invalid") {
    return (
      <AuthLayout
        title="This link has expired"
        footer={
          <Link to="/auth" className="font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        }
      >
        <FormBanner tone="error">
          Password reset links work once and expire after an hour. Request a new one and use the
          most recent email.
        </FormBanner>
        <Link
          to="/forgot-password"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-brand px-4 py-2.5 font-display text-[13px] font-semibold text-brand-foreground"
        >
          Send a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Pick something you haven't used before. You'll sign in with it next."
    >
      <form onSubmit={submit} noValidate className="space-y-3">
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        <Field label="New password" htmlFor="password" error={show("password") ?? null}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            autoFocus
            value={values.password}
            invalid={Boolean(show("password"))}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            onBlur={() => setTouched({ ...touched, password: true })}
          />
        </Field>
        <PasswordRule met={values.password.length >= MIN_PASSWORD_LENGTH}>
          At least {MIN_PASSWORD_LENGTH} characters
        </PasswordRule>
        <Field label="Confirm new password" htmlFor="confirm" error={show("confirm") ?? null}>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            value={values.confirm}
            invalid={Boolean(show("confirm"))}
            onChange={(e) => setValues({ ...values, confirm: e.target.value })}
            onBlur={() => setTouched({ ...touched, confirm: true })}
          />
        </Field>
        <Button type="submit" loading={busy} disabled={busy} className="w-full">
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
