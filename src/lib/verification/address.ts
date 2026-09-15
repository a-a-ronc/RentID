/**
 * Address & name normalization for property resolution.
 *
 * "629 Alger Avenue" and "629 Alger Ave" must resolve to the SAME existing
 * RentID property — ownership verification never creates a duplicate property
 * because a records source formats an address differently.
 */
import type { Property } from "@/lib/types";

const STREET_TYPES: Record<string, string> = {
  avenue: "ave",
  av: "ave",
  street: "st",
  str: "st",
  road: "rd",
  drive: "dr",
  boulevard: "blvd",
  lane: "ln",
  court: "ct",
  circle: "cir",
  place: "pl",
  terrace: "ter",
  parkway: "pkwy",
  highway: "hwy",
  trail: "trl",
  square: "sq",
  suite: "ste",
  apartment: "apt",
  unit: "unit",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
};

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const ENTITY_TOKENS: Record<string, string> = {
  incorporated: "inc",
  corporation: "corp",
  company: "co",
  limited: "ltd",
  "l.l.c": "llc",
  llc: "llc",
};

function squash(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical street line: lowercase, punctuation-free, abbreviated types. */
export function normalizeStreet(street: string): string {
  return squash(street)
    .split(" ")
    .map((token) => STREET_TYPES[token] ?? token)
    .join(" ");
}

/** Canonical full address key used for duplicate detection. */
export function normalizeAddress(input: {
  street_address: string;
  unit_label?: string | null;
  city: string;
  state: string;
  zip: string;
}): string {
  const parts = [
    normalizeStreet(input.street_address),
    input.unit_label ? normalizeStreet(input.unit_label) : "",
    squash(input.city),
    squash(input.state),
    squash(input.zip).slice(0, 5),
  ].filter(Boolean);
  return parts.join(" ");
}

export function normalizePropertyAddress(property: Property): string {
  return normalizeAddress({
    street_address: property.street_address,
    unit_label: property.unit_label,
    city: property.city,
    state: property.state,
    zip: property.zip,
  });
}

/**
 * Existing property matching the given address, if any. Callers use this
 * before creating a property so records lookups reuse the canonical record.
 */
type AddressLike = Pick<Property, "street_address" | "city" | "state" | "zip"> & {
  unit_label?: string | null;
  normalized_address?: string | null;
};

export function findDuplicateProperty<T extends AddressLike>(
  properties: T[],
  input: { street_address: string; unit_label?: string | null; city: string; state: string; zip: string },
): T | null {
  const key = normalizeAddress(input);
  return properties.find((p) => (p.normalized_address ?? normalizeAddress(p)) === key) ?? null;
}

/**
 * Canonical person/entity name. Middle names, initials, punctuation and
 * suffix formatting are normalized away; materially different names are not.
 */
export function normalizeOwnerName(name: string): string {
  const cleaned = squash(name)
    .replace(/\b(l\s?l\s?c)\b/g, "llc")
    .split(" ")
    .map((token) => ENTITY_TOKENS[token] ?? token)
    .filter((token) => token.length > 0 && !NAME_SUFFIXES.has(token))
    .join(" ");
  // "Smith, John A" and "John A. Smith" both reduce to a sorted token key.
  return cleaned;
}

export type NameMatch = { match: "exact" | "strong" | "candidate" | "none"; reason: string };

/**
 * Name comparison used to CORROBORATE a claim. A fuzzy hit is a candidate for
 * review — it never by itself manufactures ownership proof.
 */
export function compareOwnerName(claimed: string, recorded: string): NameMatch {
  const a = normalizeOwnerName(claimed);
  const b = normalizeOwnerName(recorded);
  if (!a || !b) return { match: "none", reason: "A name was missing." };
  if (a === b) return { match: "exact", reason: "Names match exactly after normalization." };

  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  const setB = new Set(bt);
  const shared = at.filter((t) => setB.has(t));

  // First + last present on both sides, differing only by middle name/initial.
  const firstLastA = [at[0], at[at.length - 1]].join(" ");
  const firstLastB = [bt[0], bt[bt.length - 1]].join(" ");
  if (firstLastA === firstLastB && shared.length >= 2) {
    return { match: "strong", reason: "First and last name agree; middle name formatting differs." };
  }
  if (shared.length >= 2) {
    return { match: "candidate", reason: "Some name parts agree — needs review." };
  }
  return { match: "none", reason: "Recorded owner name is materially different." };
}
