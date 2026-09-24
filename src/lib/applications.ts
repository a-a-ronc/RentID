/**
 * Pure helpers for the landlord's applications inbox. Kept out of the route so
 * the bucketing and the income check are unit-tested.
 */
import type { ApplicationStatus } from "@/lib/types";

export type ApplicationBucket = "decide" | "approved" | "closed";

const APPROVED: ReadonlySet<ApplicationStatus> = new Set([
  "approved",
  "lease_sent",
  "lease_signed",
]);
const CLOSED: ReadonlySet<ApplicationStatus> = new Set(["denied", "withdrawn"]);

/** Which inbox tab an application belongs in. Anything not decided needs a decision. */
export function applicationBucket(status: ApplicationStatus): ApplicationBucket {
  if (APPROVED.has(status)) return "approved";
  if (CLOSED.has(status)) return "closed";
  return "decide";
}

/** Can the landlord still approve or deny this one from the inbox? */
export function isUndecided(status: ApplicationStatus): boolean {
  return applicationBucket(status) === "decide";
}

export type IncomeCheck = {
  /** Monthly income divided by monthly rent, one decimal. */
  ratio: number;
  tone: "success" | "warning" | "danger";
  label: string;
};

/**
 * Income-to-rent against the common 3× rule of thumb. This is a display aid
 * for the landlord, not a decision: RentID never auto-denies, and the label
 * says what the number is rather than what to do about it.
 */
export function incomeCheck(
  monthlyIncome: number | null | undefined,
  monthlyRent: number | null | undefined,
): IncomeCheck | null {
  if (!monthlyIncome || !monthlyRent || monthlyIncome <= 0 || monthlyRent <= 0) return null;
  const ratio = Math.round((monthlyIncome / monthlyRent) * 10) / 10;
  if (ratio >= 3) return { ratio, tone: "success", label: `${ratio}× rent` };
  if (ratio >= 2.5) return { ratio, tone: "warning", label: `${ratio}× rent` };
  return { ratio, tone: "danger", label: `${ratio}× rent` };
}

/** Newest first within a bucket, but anything waiting on the landlord floats up. */
export function sortForInbox<T extends { status: ApplicationStatus; created_at: string }>(
  rows: T[],
): T[] {
  const weight = (s: ApplicationStatus) => (s === "more_info_requested" ? 1 : 0);
  return [...rows].sort(
    (a, b) => weight(a.status) - weight(b.status) || b.created_at.localeCompare(a.created_at),
  );
}
