/**
 * RentID fee schedule — pure functions, no I/O.
 *
 * Mirrors `public.compute_platform_fee()` in
 * supabase/migrations/20260915000500_payments_foundation.sql so SQL reports and
 * the UI agree by construction. Defaults match the seeded `platform_settings`
 * row; pass the live row when you have it.
 *
 *   ACH  $1,500 rent → $7.50 platform fee (0.5%)
 *   Card $1,500 rent → $7.50 + 2.9% + $0.30 = $51.30 (card cost passed through)
 */
export type PaymentMethodForFees =
  "ach" | "same_day_ach" | "rtp" | "fednow" | "card" | "check" | "manual" | "cash";

export type FeeSettings = {
  /** Percent of rent, e.g. 0.5 for 0.5% */
  platformFeePercentage: number;
  /** Absolute floor on the platform fee, in dollars */
  platformFeeMinimum: number;
  /** Optional cap on the platform fee, in dollars (null = no cap) */
  platformFeeCap: number | null;
  cardFeePercentage: number;
  cardFeeFixed: number;
  cardFeePassthrough: boolean;
  /** Percent of rent on RentID-sourced leases (marketplace fee) */
  marketplaceFeePercentage: number;
};

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  platformFeePercentage: 0.5,
  platformFeeMinimum: 0,
  platformFeeCap: null,
  cardFeePercentage: 2.9,
  cardFeeFixed: 0.3,
  cardFeePassthrough: true,
  marketplaceFeePercentage: 1.0,
};

/** Round half-up to cents, avoiding float drift (1.005 → 1.01). */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type FeeBreakdown = {
  amount: number;
  platformFee: number;
  cardFee: number;
  totalFees: number;
  /** What the payer is charged when fees are allocated to the tenant. */
  tenantPays: number;
  /** What the landlord receives when fees are allocated to the tenant. */
  landlordReceives: number;
};

export function computePlatformFee(
  amount: number,
  method: PaymentMethodForFees = "ach",
  settings: FeeSettings = DEFAULT_FEE_SETTINGS,
): FeeBreakdown {
  if (!Number.isFinite(amount) || amount < 0)
    throw new RangeError("amount must be a non-negative number");
  let platformFee = Math.max(
    (amount * settings.platformFeePercentage) / 100,
    settings.platformFeeMinimum,
  );
  if (settings.platformFeeCap !== null)
    platformFee = Math.min(platformFee, settings.platformFeeCap);
  platformFee = roundCents(platformFee);

  const cardFee =
    method === "card" && settings.cardFeePassthrough
      ? roundCents((amount * settings.cardFeePercentage) / 100 + settings.cardFeeFixed)
      : 0;

  const totalFees = roundCents(platformFee + cardFee);
  return {
    amount: roundCents(amount),
    platformFee,
    cardFee,
    totalFees,
    tenantPays: roundCents(amount + totalFees),
    landlordReceives: roundCents(amount),
  };
}

export function computeMarketplaceFee(
  monthlyRent: number,
  settings: FeeSettings = DEFAULT_FEE_SETTINGS,
): number {
  if (!Number.isFinite(monthlyRent) || monthlyRent < 0)
    throw new RangeError("monthlyRent must be a non-negative number");
  return roundCents((monthlyRent * settings.marketplaceFeePercentage) / 100);
}

/** Map a `platform_settings` row (snake_case, numeric strings allowed) to FeeSettings. */
export function feeSettingsFromRow(row: {
  platform_fee_percentage: number | string;
  platform_fee_cap: number | string | null;
  platform_fee_minimum?: number | string | null;
  card_fee_percentage?: number | string | null;
  card_fee_fixed?: number | string | null;
  card_fee_passthrough?: boolean | null;
  marketplace_fee_percentage?: number | string | null;
}): FeeSettings {
  const n = (v: number | string | null | undefined, fallback: number) =>
    v === null || v === undefined ? fallback : Number(v);
  return {
    platformFeePercentage: n(
      row.platform_fee_percentage,
      DEFAULT_FEE_SETTINGS.platformFeePercentage,
    ),
    platformFeeMinimum: n(row.platform_fee_minimum, DEFAULT_FEE_SETTINGS.platformFeeMinimum),
    platformFeeCap:
      row.platform_fee_cap === null || row.platform_fee_cap === undefined
        ? null
        : Number(row.platform_fee_cap),
    cardFeePercentage: n(row.card_fee_percentage, DEFAULT_FEE_SETTINGS.cardFeePercentage),
    cardFeeFixed: n(row.card_fee_fixed, DEFAULT_FEE_SETTINGS.cardFeeFixed),
    cardFeePassthrough: row.card_fee_passthrough ?? DEFAULT_FEE_SETTINGS.cardFeePassthrough,
    marketplaceFeePercentage: n(
      row.marketplace_fee_percentage,
      DEFAULT_FEE_SETTINGS.marketplaceFeePercentage,
    ),
  };
}
