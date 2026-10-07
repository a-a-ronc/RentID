/**
 * /forgot-password — ask for a reset link.
 *
 * The confirmation always reads the same whether or not the address has an
 * account. Saying "no account with that email" would let anyone check who
 * uses RentID, so standard practice is not to.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";

import { AuthInput, AuthLayout, FormBanner } from "@/components/rentid/AuthLayout";
import { Button, Field } from "@/components/rentid/kit";
import { authService } from "@/lib/auth";
import { friendlyAuthError, validateEmail } from "@/lib/auth-validation";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { email?: string } =>
    typeof search["email"] === "string" ? { email: search["email"] } : {},
  head: () => ({
    meta: [{ title: "Reset your password — RentID" }, { name: "robots", content: "noindex" }],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const emailError = validateEmail(email);
  const showError = (submitted || touched) && emailError;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (emailError) {
      document.getElementById("email")?.focus();
      return;
    }
    setBusy(true);
    try {
      await authService.requestPasswordReset(email);
      setSentTo(email.trim());
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your email"
        footer={
          <Link to="/auth" className="font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
            <MailCheck className="size-5" />
          </span>
          <p className="mt-3 text-[13.5px] leading-relaxed">
            If an account exists for <strong>{sentTo}</strong>, we've sent a link to reset your
            password. It expires in one hour.
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Nothing after a few minutes? Check your spam folder, or try again.
          </p>
          <Button
            tone="secondary"
            className="mt-4 w-full"
            onClick={() => {
              setSentTo(null);
              setSubmitted(false);
            }}
          >
            Send another link
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you use for RentID and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/auth" className="font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-3">
        {error ? <FormBanner tone="error">{error}</FormBanner> : null}
        <Field label="Email" htmlFor="email" error={showError || null}>
          <AuthInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@email.com"
            value={email}
            invalid={Boolean(showError)}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </Field>
        <Button type="submit" loading={busy} disabled={busy} className="w-full">
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthLayout>
  );
}
