/**
 * Sign-in / sign-up / password-reset validation and error wording.
 *
 * Pure functions so the rules and the messages users see are unit-tested, and
 * every auth screen says the same thing for the same problem.
 *
 * Two rules from standard practice:
 *   - A failed sign-in never says WHICH of email or password was wrong, and a
 *     reset request never says whether the address has an account. Either
 *     would let anyone probe who is registered.
 *   - Validate in the form before calling the server, and say exactly what to
 *     fix, next to the field that needs fixing.
 */

export const MIN_PASSWORD_LENGTH = 12;

// Deliberately simple: something@something.tld, no spaces. The server is the
// final judge; this catches typos before a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your email address.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address, like name@example.com.";
  return null;
}

export function validateFullName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your full name.";
  if (v.split(/\s+/).length < 2) return "Enter your first and last name.";
  if (v.length > 120) return "That name is too long.";
  return null;
}

/** For sign-in only presence matters; strength rules apply when choosing one. */
export function validatePassword(value: string, mode: "signin" | "new"): string | null {
  if (!value) return "Enter your password.";
  if (mode === "signin") return null;
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters (you have ${value.length}).`;
  if (value.trim().length === 0) return "Your password can't be only spaces.";
  return null;
}

export function validatePasswordConfirmation(password: string, confirm: string): string | null {
  if (!confirm) return "Re-enter your new password.";
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * Turn whatever Supabase Auth (or the network) threw into a sentence a person
 * can act on. Unknown messages pass through rather than being hidden.
 */
export function friendlyAuthError(raw: unknown): string {
  const message =
    raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "Something went wrong.";
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
    return "Incorrect email or password. Check both and try again.";
  if (m.includes("email not confirmed"))
    return "Confirm your email address first. Check your inbox for the link we sent.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with that email already exists. Sign in instead, or reset your password.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("known to be"))
    return "That password is too easy to guess. Choose a longer, less common one.";
  if (m.includes("should be at least") || (m.includes("password") && m.includes("characters")))
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  if (m.includes("same password") || m.includes("different from the old"))
    return "Choose a password you haven't used before.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "That email address isn't valid.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "New sign-ups are paused right now. Please try again later.";
  if (
    m.includes("auth session missing") ||
    m.includes("expired") ||
    m.includes("invalid token") ||
    m.includes("otp")
  )
    return "This link has expired or was already used. Request a new one.";
  if (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("load failed") ||
    m.includes("fetch failed") ||
    m.includes("503") ||
    m.includes("service unavailable")
  )
    return "We couldn't reach RentID's servers. Check your connection and try again in a moment.";
  return message;
}
