/**
 * Prospective-user registrations ("Join RentID / Letter of Intent").
 *
 * Public submissions are written server-side with the privileged client because
 * the table intentionally has no anon policy; that path is throttled and never
 * overwrites an existing registration. Admin reads verify the caller's admin
 * role through their own session before touching privileged reads.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const INTEREST_ROLES = ["renter", "landlord", "property_manager", "other"] as const;
export type InterestRole = (typeof INTEREST_ROLES)[number];

export type InterestRegistration = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  roles: string[];
  would_use: boolean;
  acknowledged: boolean;
  current_units: number | null;
  intended_units: number | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * The answer is the same whether or not the address was already registered, so
 * the form cannot be used to test which e-mail addresses are on the list.
 */
export type RegisterResult = { status: "created" };

const baseSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, "Enter your first and last name")
    .max(120)
    .refine((v) => v.split(/\s+/).length >= 2, "Enter your first and last name"),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v.replace(/\D/g, "").length === 10, "Enter a 10-digit U.S. phone number"),
  roles: z.array(z.enum(INTEREST_ROLES)).min(1, "Select at least one role"),
  would_use: z.boolean(),
  acknowledged: z.literal(true),
  current_units: z.number().int().min(1).max(1000000).nullable().optional(),
  intended_units: z.number().int().min(0).max(1000000).nullable().optional(),
  /** Honeypot: hidden from people, filled in by form-spamming bots. */
  website: z.string().max(200).optional(),
});

/** Unit counts only apply to landlords / property managers. */
const registrationSchema = baseSchema.superRefine((data, ctx) => {
  const owns = data.roles.includes("landlord") || data.roles.includes("property_manager");
  if (owns && (data.current_units === null || data.current_units === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["current_units"],
      message: "Enter the number of rental units you own or manage",
    });
  }
});

export type RegistrationInput = z.input<typeof baseSchema>;

/** Registrations accepted per client address per hour, and site-wide per hour. */
const PER_ADDRESS_LIMIT = 5;
const SITE_WIDE_LIMIT = 300;
const GENERIC_FAILURE = "We couldn't record your registration. Please try again later.";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const registerInterest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registrationSchema.parse(data))
  .handler(async ({ data }): Promise<RegisterResult> => {
    // A person never sees this field; answer as if it worked and store nothing.
    if (data.website && data.website.trim() !== "") return { status: "created" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const emailNormalized = data.email.toLowerCase();
    const digits = data.phone.replace(/\D/g, "");
    const phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

    const request = getRequest();
    const headers = request?.headers;
    // cf-connecting-ip is set by Cloudflare and cannot be spoofed by the
    // client; x-forwarded-for is only a fallback for local development.
    const ip =
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const metadata = {
      user_agent: headers?.get("user-agent")?.slice(0, 500) ?? null,
      referer: headers?.get("referer")?.slice(0, 500) ?? null,
      ip_address: ip,
    };

    // The table has no anonymous policy, so this function is the only way in:
    // throttle it per address and overall. Typed loosely because the generated
    // types predate check_rate_limit_key().
    const limiter = supabaseAdmin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
    };
    const addressKey = `interest:ip:${await sha256Hex(ip ?? "unknown")}`;
    for (const [key, limit] of [
      [addressKey, PER_ADDRESS_LIMIT],
      ["interest:all", SITE_WIDE_LIMIT],
    ] as const) {
      const { data: allowed, error } = await limiter.rpc("check_rate_limit_key", {
        _key: key,
        _limit: limit,
        _window: "1 hour",
      });
      if (error) {
        console.error("[interest] rate limit check failed:", error.message);
        throw new Error(GENERIC_FAILURE);
      }
      if (allowed === false) {
        throw new Error("Too many registrations from this connection. Please try again later.");
      }
    }

    const managesUnits = data.roles.includes("landlord") || data.roles.includes("property_manager");
    const units = {
      current_units: managesUnits ? (data.current_units ?? null) : null,
      intended_units: managesUnits ? (data.intended_units ?? null) : null,
    };

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("interest_registrations")
      .select("id, submission_count")
      .eq("email_normalized", emailNormalized)
      .maybeSingle();
    if (lookupError) {
      console.error("[interest] lookup failed:", lookupError.message);
      throw new Error(GENERIC_FAILURE);
    }

    if (existing) {
      // Anyone can type anyone's address, so a repeat submission never
      // overwrites the stored answers. It is only counted.
      const { error } = await supabaseAdmin
        .from("interest_registrations")
        .update({ submission_count: (existing.submission_count ?? 1) + 1 })
        .eq("id", existing.id);
      if (error) console.error("[interest] repeat count failed:", error.message);
      return { status: "created" };
    }

    const { error } = await supabaseAdmin.from("interest_registrations").insert({
      full_name: data.full_name,
      email: data.email.trim(),
      email_normalized: emailNormalized,
      phone,
      roles: data.roles,
      would_use: data.would_use,
      acknowledged: true,
      ...units,
      ...metadata,
    });
    if (error) {
      console.error("[interest] insert failed:", error.message);
      throw new Error(GENERIC_FAILURE);
    }
    return { status: "created" };
  });

/* -------------------------------- admin read ------------------------------- */

export type InterestStats = {
  total: number;
  yes: number;
  no: number;
  yes_percentage: number;
  renters: number;
  landlords: number;
  property_managers: number;
  this_week: number;
  this_month: number;
  /** Registrations that are a landlord and/or property manager (counted once). */
  unit_holders: number;
  /** Current units owned/managed across all registrations. */
  current_units_all: number;
  /** Current units owned/managed by "yes" registrations. */
  current_units_yes: number;
  /** Intended units across all registrations (secondary figure). */
  intended_units_all: number;
  /** Primary metric: intended units from "yes" registrations only. */
  intended_units_yes: number;
  /** Average intended units per "yes" landlord/property manager. */
  average_intended_units: number;
};

/**
 * Registrations are personal data. The read is authorised server-side from the
 * caller's own session: the bearer token is verified, then the admin role is
 * checked in the database as that user. There is no shared access code.
 */
export const listInterestRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: InterestRegistration[]; stats: InterestStats }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Administrator access only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registrations, error } = await supabaseAdmin
      .from("interest_registrations")
      .select(
        "id, full_name, email, phone, roles, would_use, acknowledged, current_units, intended_units, submitted_at, created_at, updated_at",
      )
      .order("submitted_at", { ascending: false });
    if (error) {
      console.error("[interest] list failed:", error.message);
      throw new Error("Registrations could not be loaded.");
    }

    const rows = (registrations ?? []) as InterestRegistration[];
    return { rows, stats: computeInterestStats(rows) };
  });

/**
 * Shared stat maths so the dashboard, filtered views and the CSV summary all
 * agree. A registration that is both landlord and property manager is counted
 * once for unit totals; the primary intended-unit figure only counts "yes".
 */
export function computeInterestStats(rows: InterestRegistration[]): InterestStats {
  const now = Date.now();
  const since = (days: number) => now - days * 24 * 60 * 60 * 1000;
  const has = (r: InterestRegistration, role: InterestRole) => r.roles.includes(role);
  const yes = rows.filter((r) => r.would_use).length;

  const holders = rows.filter((r) => has(r, "landlord") || has(r, "property_manager"));
  const yesHolders = holders.filter((r) => r.would_use);
  const sum = (list: InterestRegistration[], key: "current_units" | "intended_units") =>
    list.reduce((acc, r) => acc + (r[key] ?? 0), 0);
  const intendedYes = sum(yesHolders, "intended_units");

  return {
    total: rows.length,
    yes,
    no: rows.length - yes,
    yes_percentage: rows.length ? Math.round((yes / rows.length) * 100) : 0,
    renters: rows.filter((r) => has(r, "renter")).length,
    landlords: rows.filter((r) => has(r, "landlord")).length,
    property_managers: rows.filter((r) => has(r, "property_manager")).length,
    this_week: rows.filter((r) => new Date(r.submitted_at).getTime() >= since(7)).length,
    this_month: rows.filter((r) => new Date(r.submitted_at).getTime() >= since(30)).length,
    unit_holders: holders.length,
    current_units_all: sum(holders, "current_units"),
    current_units_yes: sum(yesHolders, "current_units"),
    intended_units_all: sum(holders, "intended_units"),
    intended_units_yes: intendedYes,
    average_intended_units: yesHolders.length ? Math.round(intendedYes / yesHolders.length) : 0,
  };
}
