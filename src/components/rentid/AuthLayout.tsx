/**
 * Shared chrome for the sign-in, sign-up and password screens, plus the two
 * small pieces every auth form needs: a message banner and a password field
 * with a show/hide toggle.
 */
import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from "lucide-react";
import { useState, type ReactNode } from "react";

import { RentIDLogo } from "@/components/rentid/Logo";
import { Glass } from "@/components/rentid/Surface";
import { cn } from "@/lib/utils";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-16 size-72 rounded-full bg-brand/12 blur-3xl" />
        <div className="absolute -right-16 bottom-0 size-72 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <Link to="/" aria-label="RentID home">
            <RentIDLogo markClassName="size-9" wordmarkClassName="text-[24px]" />
          </Link>
          <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <Glass className="mt-6 p-5">{children}</Glass>
        {footer ? (
          <div className="mt-4 text-center text-[12.5px] text-muted-foreground">{footer}</div>
        ) : null}
      </div>
    </main>
  );
}

const BANNER = {
  error: { icon: AlertCircle, cls: "border-destructive/40 bg-destructive/8 text-destructive" },
  success: { icon: CheckCircle2, cls: "border-success/40 bg-success/10 text-success" },
  info: { icon: Info, cls: "border-border bg-card/70 text-foreground" },
} as const;

/**
 * Form-level message. `role="alert"` makes screen readers announce errors the
 * moment they appear; success and info use the politer `status`.
 */
export function FormBanner({
  tone,
  children,
  className,
}: {
  tone: keyof typeof BANNER;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = BANNER[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12.5px] leading-relaxed",
        cls,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border bg-card/70 px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-brand/60";

export function PasswordInput({
  invalid,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? "text" : "password"}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          "pr-11",
          invalid ? "border-destructive/60" : "border-border",
          className,
        )}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function AuthInput({
  invalid,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, invalid ? "border-destructive/60" : "border-border", className)}
    />
  );
}

/** Live checklist under a new-password field. */
export function PasswordRule({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-[11.5px]",
        met ? "text-success" : "text-muted-foreground",
      )}
    >
      <CheckCircle2 className={cn("size-3.5", met ? "opacity-100" : "opacity-40")} />
      {children}
    </p>
  );
}
