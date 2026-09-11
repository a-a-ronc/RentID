/**
 * Listing distribution service.
 *
 * RentID holds the master listing. This module keeps one channel row per
 * marketplace, records every sync attempt, and captures leads with their
 * source. External networks stay "integration pending" until RentID has an
 * approved feed — the adapters never post anywhere on their own.
 */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import { MARKETPLACE_ADAPTERS, getAdapter } from "@/lib/syndication/adapters";
import type {
  ChannelListingStatus,
  LeadSource,
  Listing,
  ListingChannel,
  ListingLead,
  ListingPipeline,
  ListingSyncEvent,
  MarketplaceId,
  SyncAction,
  UUID,
} from "@/lib/types";

/** Ensure a channel row exists for every registered marketplace. */
export function ensureChannels(listing: Listing): ListingChannel[] {
  const db = getDb();
  const now = nowIso();
  for (const adapter of MARKETPLACE_ADAPTERS) {
    const existing = db.listing_channels.find(
      (c) => c.listing_id === listing.id && c.marketplace_id === adapter.id,
    );
    if (existing) {
      existing.connection_status = adapter.connection_status;
      continue;
    }
    db.listing_channels.push({
      id: uuid(),
      listing_id: listing.id,
      organization_id: listing.organization_id,
      marketplace_id: adapter.id,
      enabled: false,
      connection_status: adapter.connection_status,
      listing_status: "not_published",
      external_listing_id: null,
      last_synced_at: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    });
  }
  return db.listing_channels.filter((c) => c.listing_id === listing.id);
}

export function channelsFor(listingId: UUID): ListingChannel[] {
  return getDb()
    .listing_channels.filter((c) => c.listing_id === listingId)
    .sort(
      (a, b) =>
        MARKETPLACE_ADAPTERS.findIndex((m) => m.id === a.marketplace_id) -
        MARKETPLACE_ADAPTERS.findIndex((m) => m.id === b.marketplace_id),
    );
}

function record(
  listing: Listing,
  marketplaceId: MarketplaceId,
  action: SyncAction,
  outcome: { result: ListingSyncEvent["result"]; message: string },
) {
  getDb().listing_sync_events.unshift({
    id: uuid(),
    listing_id: listing.id,
    marketplace_id: marketplaceId,
    action,
    result: outcome.result,
    message: outcome.message,
    created_at: nowIso(),
  });
}

async function runSync(
  listing: Listing,
  channel: ListingChannel,
  action: SyncAction,
): Promise<ListingChannel> {
  const adapter = getAdapter(channel.marketplace_id);
  if (!adapter) {
    channel.listing_status = "error";
    channel.last_error = "No adapter registered for this marketplace.";
    return channel;
  }
  const outcome = await adapter.sync(action, listing);
  const statusMap: Record<string, ChannelListingStatus> = {
    succeeded: action === "remove" ? "removed" : "live",
    pending_integration: action === "remove" ? "removal_queued" : "pending_integration",
    queued: "queued",
    failed: "error",
  };
  channel.listing_status = statusMap[outcome.result] ?? "queued";
  channel.external_listing_id = outcome.external_listing_id ?? channel.external_listing_id;
  channel.last_error = outcome.result === "failed" ? outcome.message : null;
  channel.last_synced_at = outcome.result === "succeeded" ? nowIso() : channel.last_synced_at;
  channel.connection_status = adapter.connection_status;
  channel.updated_at = nowIso();
  record(listing, channel.marketplace_id, action, outcome);
  return channel;
}

/** Turn a channel on or off for a listing, then sync it. */
export async function setChannelEnabled(input: {
  listingId: UUID;
  marketplaceId: MarketplaceId;
  enabled: boolean;
  actorId?: UUID | null;
}): Promise<ListingChannel[]> {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found.");
  ensureChannels(listing);
  const channel = db.listing_channels.find(
    (c) => c.listing_id === listing.id && c.marketplace_id === input.marketplaceId,
  );
  if (!channel) throw new Error("Channel not found.");
  channel.enabled = input.enabled;
  if (input.enabled) {
    await runSync(listing, channel, "create");
  } else {
    await runSync(listing, channel, "remove");
    channel.listing_status = channel.listing_status === "removed" ? "not_published" : channel.listing_status;
  }
  logAudit({
    organization_id: listing.organization_id,
    actor_id: input.actorId ?? null,
    action: input.enabled ? "listing.channel_enabled" : "listing.channel_disabled",
    entity_type: "listing",
    entity_id: listing.id,
    metadata: { marketplace: input.marketplaceId },
  });
  listing.syndicated_to = channelsFor(listing.id)
    .filter((c) => c.enabled)
    .map((c) => getAdapter(c.marketplace_id)?.name ?? c.marketplace_id);
  commit();
  return latency(clone(channelsFor(listing.id)), 200);
}

/** Re-send the master listing to one channel. */
export async function resyncChannel(input: {
  listingId: UUID;
  marketplaceId: MarketplaceId;
}): Promise<ListingChannel[]> {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found.");
  const channel = db.listing_channels.find(
    (c) => c.listing_id === listing.id && c.marketplace_id === input.marketplaceId,
  );
  if (!channel) throw new Error("Channel not found.");
  await runSync(listing, channel, "resync");
  commit();
  return latency(clone(channelsFor(listing.id)), 220);
}

/**
 * Called whenever the master listing changes. Every enabled channel is queued
 * for an outbound update so the copies never drift from RentID.
 */
export async function propagateListingChange(listing: Listing, action: SyncAction = "update") {
  ensureChannels(listing);
  for (const channel of channelsFor(listing.id)) {
    if (!channel.enabled) continue;
    await runSync(listing, channel, action);
  }
  commit();
}

/** Marked rented: prepare removal everywhere the listing is distributed. */
export async function withdrawEverywhere(listing: Listing) {
  await propagateListingChange(listing, "remove");
}

export async function getDistribution(listingId: UUID): Promise<{
  channels: ListingChannel[];
  events: ListingSyncEvent[];
}> {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === listingId);
  if (listing) {
    ensureChannels(listing);
    commit();
  }
  const events = db.listing_sync_events
    .filter((e) => e.listing_id === listingId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 25);
  return latency(clone({ channels: channelsFor(listingId), events }));
}

/* --------------------------------- leads ---------------------------------- */

export async function recordLead(input: {
  listingId: UUID;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  source?: LeadSource;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
}): Promise<ListingLead> {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === input.listingId);
  if (!listing) throw new Error("Listing not found.");
  const lead: ListingLead = {
    id: uuid(),
    listing_id: listing.id,
    organization_id: listing.organization_id,
    name: input.name?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    message: input.message?.trim() || null,
    source: input.source ?? "rentid",
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    referrer: input.referrer ?? null,
    application_id: null,
    created_at: nowIso(),
  };
  db.listing_leads.unshift(lead);
  commit();
  return latency(clone(lead), 160);
}

/** A public listing-page view. Views feed the applicant funnel. */
export function recordListingView(listingId: UUID) {
  const listing = getDb().listings.find((l) => l.id === listingId);
  if (!listing) return;
  listing.view_count = (listing.view_count ?? 0) + 1;
  commit();
}

export async function getLeads(orgId: UUID | null): Promise<ListingLead[]> {
  if (!orgId) return [];
  const rows = getDb()
    .listing_leads.filter((l) => l.organization_id === orgId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows));
}

/** Applicant funnel per listing, plus where the traffic came from. */
export function buildPipeline(listingId: UUID): ListingPipeline {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === listingId);
  const apps = db.rental_applications.filter((a) => a.listing_id === listingId);
  const completed = apps.filter((a) => a.status !== "started" && a.status !== "new").length;
  return {
    listing_id: listingId,
    views: listing?.view_count ?? 0,
    leads: db.listing_leads.filter((l) => l.listing_id === listingId).length,
    started: apps.length,
    completed,
    qualified: apps.filter((a) =>
      ["qualified", "approved", "lease_sent", "lease_signed"].includes(a.status),
    ).length,
    approved: apps.filter((a) => ["approved", "lease_sent", "lease_signed"].includes(a.status))
      .length,
  };
}

/** Which channels are producing leads and signed tenants. */
export async function getSourceBreakdown(
  orgId: UUID | null,
  listingIds?: UUID[],
): Promise<{ source: LeadSource; leads: number; applications: number; signed: number }[]> {
  if (!orgId) return [];
  const db = getDb();
  const sources = new Map<LeadSource, { leads: number; applications: number; signed: number }>();
  const bump = (source: LeadSource, key: "leads" | "applications" | "signed") => {
    const row = sources.get(source) ?? { leads: 0, applications: 0, signed: 0 };
    row[key] += 1;
    sources.set(source, row);
  };
  // A property manager's desk covers listings across owner organizations, so an
  // explicit listing set takes precedence over the organization filter.
  const ids = listingIds && listingIds.length > 0 ? new Set(listingIds) : null;
  const inScope = (row: { organization_id: UUID; listing_id?: UUID }) =>
    ids ? Boolean(row.listing_id && ids.has(row.listing_id)) : row.organization_id === orgId;
  db.listing_leads.filter(inScope).forEach((l) => bump(l.source, "leads"));
  db.rental_applications
    .filter(inScope)
    .forEach((a) => {
      bump(a.source ?? "rentid", "applications");
      if (a.status === "lease_signed") bump(a.source ?? "rentid", "signed");
    });
  return latency(
    clone(
      [...sources.entries()]
        .map(([source, counts]) => ({ source, ...counts }))
        .sort((a, b) => b.leads - a.leads),
    ),
  );
}
