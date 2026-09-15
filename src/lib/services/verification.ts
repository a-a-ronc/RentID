/**
 * Property ownership & authorized-representative verification.
 *
 * Separate from tenancy verification: this answers *who owns this exact
 * property* and *who may act for that owner*, property by property. Three
 * independent propositions (property, identity, authority) are tracked with
 * their own confidence dimensions and must each hold before a badge is issued.
 *
 * Providers are not configured yet, so automated checks always land the case in
 * evidence collection or manual review. A badge is only ever issued by an
 * explicit reviewer decision or production-grade official evidence.
 */
import { clone, commit, getDb, latency, logAudit, nowIso, uuid } from "@/lib/mock/db";
import { compareOwnerName, normalizeOwnerName } from "@/lib/verification/address";
import {
  AssessorDataProvider,
  IdentityVerificationProvider,
  PropertyDataProvider,
  RecordedDocumentProvider,
  evidenceCanIssueBadge,
  providerStatuses,
} from "@/lib/verification/providers";
import { DISCLOSURE_VERSION, VERIFICATION_RULES_VERSION } from "@/lib/verification-types";
import type {
  AuthorizationStatus,
  ConfidenceLevel,
  DisclosureContext,
  EvidenceSourceType,
  EvidenceStrength,
  Property,
  PropertyBadge,
  PropertyClaimRelationship,
  PropertyOwnershipRecord,
  PropertyPartyRelationship,
  PropertyPermission,
  PropertyRelationshipKind,
  PropertyVerification,
  RelationshipVerificationStatus,
  RepresentativeAuthorization,
  RiskEventKind,
  UUID,
  VerificationCase,
  VerificationCaseStatus,
  VerificationEvidence,
  VerificationProposition,
  VerificationQueueItem,
  VerificationRiskEvent,
  VerificationStatusEvent,
} from "@/lib/types";

export const DEFAULT_REPRESENTATIVE_PERMISSIONS: PropertyPermission[] = [
  "manage_listing",
  "view_applications",
  "manage_applications",
  "manage_leases",
  "manage_tenants",
  "manage_maintenance",
  "message_tenants",
  "manage_documents",
];

export const PERMISSION_LABELS: Record<PropertyPermission, string> = {
  manage_listing: "Manage the listing",
  view_applications: "View applications",
  manage_applications: "Decide applications",
  manage_leases: "Manage leases",
  approve_lease_changes: "Approve lease changes",
  manage_tenants: "Manage tenants",
  view_ledger: "View the rental ledger",
  view_payments: "View payments",
  manage_payment_settings: "Manage payment settings",
  manage_maintenance: "Manage maintenance",
  message_tenants: "Message tenants",
  manage_documents: "Manage documents",
  manage_property_records: "Manage property records",
};

const RELATIONSHIP_FOR_CLAIM: Record<PropertyClaimRelationship, PropertyRelationshipKind> = {
  individual_owner: "owner",
  entity_owner_representative: "entity_representative",
  authorized_representative: "authorized_representative",
  trust_or_estate: "trustee",
  other: "other",
};

export const CLAIM_LABELS: Record<PropertyClaimRelationship, string> = {
  individual_owner: "I personally own this property",
  entity_owner_representative: "A business or entity I represent owns this property",
  authorized_representative: "I am the property manager or authorized representative",
  trust_or_estate: "The property is owned by a trust or estate",
  other: "Other",
};

/* -------------------------------- internals ------------------------------- */

function logStatus(entry: {
  property_id: UUID;
  case_id: UUID | null;
  actor_id: UUID | null;
  action: string;
  from_status?: VerificationCaseStatus | null;
  to_status?: VerificationCaseStatus | null;
  reason?: string | null;
}) {
  const event: VerificationStatusEvent = {
    id: uuid(),
    property_id: entry.property_id,
    case_id: entry.case_id,
    actor_id: entry.actor_id,
    action: entry.action,
    from_status: entry.from_status ?? null,
    to_status: entry.to_status ?? null,
    reason: entry.reason ?? null,
    created_at: nowIso(),
  };
  getDb().verification_status_events.unshift(event);
}

/** Complex vesting always needs a human. */
function needsManualReview(relationship: PropertyClaimRelationship) {
  return relationship === "trust_or_estate" || relationship === "other";
}

function currentOwnershipRecord(propertyId: UUID): PropertyOwnershipRecord | null {
  const rows = getDb()
    .property_ownership_records.filter((r) => r.property_id === propertyId && r.is_current)
    // A newer recorded deed outranks a stale assessor owner field.
    .sort((a, b) => {
      const strength = (r: PropertyOwnershipRecord) =>
        r.source_type === "recorded_document" ? 1 : 0;
      if (strength(b) !== strength(a)) return strength(b) - strength(a);
      return (b.recorded_at ?? "").localeCompare(a.recorded_at ?? "");
    });
  return rows[0] ?? null;
}

function badgeFor(relationships: PropertyPartyRelationship[]): PropertyBadge {
  const live = relationships.filter((r) => r.revoked_at === null);
  if (live.some((r) => r.status === "ownership_verified")) return "ownership_verified";
  if (live.some((r) => r.status === "authorized_representative_verified")) {
    return "authorized_representative";
  }
  return null;
}

/**
 * Version string for the property's trust state. A tenant re-sees the
 * disclosure only when this — or the payee, or the wording — changes.
 */
function verificationVersion(propertyId: UUID): string {
  const db = getDb();
  const relationships = db.property_party_relationships.filter((r) => r.property_id === propertyId);
  const badge = badgeFor(relationships) ?? "none";
  const owner = currentOwnershipRecord(propertyId)?.normalized_owner_name ?? "unknown";
  const reps = db.representative_authorizations
    .filter((a) => a.property_id === propertyId && a.status === "active")
    .map((a) => a.representative_name)
    .sort()
    .join("|");
  return `${badge}:${owner}:${reps}`;
}

/* ------------------------------- claims ---------------------------------- */

/**
 * Opens a property-specific claim. Synchronous because `createProperty` calls
 * it inside its own transaction; it never grants any verification by itself.
 */
export function openPropertyClaim(input: {
  property: Property;
  claimantUserId: UUID | null;
  claimantName: string | null;
  relationship: PropertyClaimRelationship;
  organizationId: UUID | null;
}): VerificationCase {
  const db = getDb();
  const now = nowIso();
  const verificationCase: VerificationCase = {
    id: uuid(),
    property_id: input.property.id,
    organization_id: input.organizationId,
    claimant_user_id: input.claimantUserId,
    claimant_name: input.claimantName ?? "RentID account holder",
    claim_relationship: input.relationship,
    status: needsManualReview(input.relationship) ? "manual_review" : "collecting_evidence",
    property_confidence: "none",
    identity_confidence: "none",
    authority_confidence: "none",
    hard_contradiction: false,
    contradictions: [],
    entity_id: null,
    rules_version: VERIFICATION_RULES_VERSION,
    reviewer_id: null,
    decision_reason: null,
    created_at: now,
    updated_at: now,
    decided_at: null,
    last_verified_at: null,
    next_review_at: null,
    reverification_required: false,
  };
  db.verification_cases.unshift(verificationCase);

  const relationship: PropertyPartyRelationship = {
    id: uuid(),
    property_id: input.property.id,
    user_id: input.claimantUserId,
    organization_id: input.organizationId,
    entity_id: null,
    relationship: RELATIONSHIP_FOR_CLAIM[input.relationship],
    status: "pending",
    recorded_owner_name: null,
    verified_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
  };
  db.property_party_relationships.unshift(relationship);

  logStatus({
    property_id: input.property.id,
    case_id: verificationCase.id,
    actor_id: input.claimantUserId,
    action: "verification.case_opened",
    to_status: verificationCase.status,
    reason: CLAIM_LABELS[input.relationship],
  });
  logAudit({
    organization_id: input.organizationId,
    actor_id: input.claimantUserId,
    action: "property_verification.claim_opened",
    entity_type: "verification_case",
    entity_id: verificationCase.id,
    metadata: { relationship: input.relationship, property_id: input.property.id },
  });
  detectRapidClaims(input.claimantUserId);
  return verificationCase;
}

/** Start (or restart) a claim on a property that already exists. */
export async function startPropertyClaim(input: {
  propertyId: UUID;
  claimantUserId: UUID | null;
  claimantName?: string | null;
  relationship: PropertyClaimRelationship;
}): Promise<VerificationCase> {
  const db = getDb();
  const property = db.properties.find((p) => p.id === input.propertyId);
  if (!property) throw new Error("Property not found.");
  const created = openPropertyClaim({
    property,
    claimantUserId: input.claimantUserId,
    claimantName: input.claimantName ?? null,
    relationship: input.relationship,
    organizationId: property.organization_id,
  });
  commit();
  await runAutomatedChecks(created.id);
  return clone(created);
}

/* ------------------------------- evidence -------------------------------- */

export async function submitEvidence(input: {
  caseId: UUID;
  proposition: VerificationProposition;
  evidenceType: string;
  summary: string;
  sourceType?: EvidenceSourceType;
  strength?: EvidenceStrength;
  storagePath?: string | null;
  documentDate?: string | null;
  actorId?: UUID | null;
}): Promise<VerificationEvidence> {
  const db = getDb();
  const c = db.verification_cases.find((row) => row.id === input.caseId);
  if (!c) throw new Error("Verification case not found.");

  const evidence: VerificationEvidence = {
    id: uuid(),
    case_id: c.id,
    proposition: input.proposition,
    evidence_type: input.evidenceType,
    source_type: input.sourceType ?? "user_upload",
    source_provider: "user",
    official_reference: null,
    retrieved_at: nowIso(),
    document_date: input.documentDate ?? null,
    document_hash: null,
    storage_path: input.storagePath ?? null,
    // Uploads are never primary proof — documents can be forged.
    strength: input.strength ?? "unverified_upload",
    summary: input.summary,
    expires_at: null,
    created_at: nowIso(),
  };
  db.verification_evidence.unshift(evidence);

  // Reused supporting document across unrelated properties is a risk signal.
  const reused = db.verification_evidence.filter(
    (e) => e.summary === evidence.summary && e.case_id !== evidence.case_id,
  );
  if (reused.length > 0) {
    recordRiskEvent({
      propertyId: c.property_id,
      caseId: c.id,
      userId: c.claimant_user_id,
      kind: "reused_document",
      severity: "medium",
      detail: "The same supporting document was submitted for another property.",
    });
  }

  // Uploaded evidence goes to a human; it can never self-issue a badge.
  c.status =
    c.status === "ownership_verified" || c.status === "authorized_representative_verified"
      ? c.status
      : "manual_review";
  c.updated_at = nowIso();
  logStatus({
    property_id: c.property_id,
    case_id: c.id,
    actor_id: input.actorId ?? null,
    action: "verification.evidence_submitted",
    to_status: c.status,
    reason: input.evidenceType,
  });
  commit();
  return latency(clone(evidence), 200);
}

/**
 * Runs the provider chain. With no vendor configured this records why the case
 * cannot be automated and parks it — it must never fabricate a success.
 */
export async function runAutomatedChecks(caseId: UUID): Promise<VerificationCase> {
  const db = getDb();
  const c = db.verification_cases.find((row) => row.id === caseId);
  if (!c) throw new Error("Verification case not found.");
  const property = db.properties.find((p) => p.id === c.property_id);
  if (!property) throw new Error("Property not found.");

  const notes: string[] = [];
  const parcel = await PropertyDataProvider.findParcel({
    normalizedAddress: property.normalized_address ?? "",
    state: property.state,
    zip: property.zip,
  });
  if (!parcel.ok) notes.push(parcel.reason);

  const deed = await RecordedDocumentProvider.currentOwner({
    parcelNumber: property.parcel_number,
    jurisdiction: property.recording_jurisdiction,
  });
  const assessor = await AssessorDataProvider.owner({ parcelNumber: property.parcel_number });
  const identity = await IdentityVerificationProvider.verifyPerson({
    userId: c.claimant_user_id ?? "",
    legalName: c.claimant_name,
  });

  const propertyConfidence: ConfidenceLevel =
    deed.ok && evidenceCanIssueBadge(deed.mode) ? "strong" : assessor.ok ? "weak" : "none";
  const identityConfidence: ConfidenceLevel =
    identity.ok && identity.data.passed && evidenceCanIssueBadge(identity.mode) ? "strong" : "none";

  // Corroborate the claimed name against recorded ownership where available.
  const record = currentOwnershipRecord(property.id);
  let authorityConfidence: ConfidenceLevel = "none";
  if (record && c.claim_relationship === "individual_owner") {
    const match = compareOwnerName(c.claimant_name, record.raw_owner_name);
    notes.push(match.reason);
    if (match.match === "none") {
      c.hard_contradiction = true;
    } else if (match.match === "exact" || match.match === "strong") {
      authorityConfidence = identityConfidence === "strong" ? "moderate" : "weak";
    }
    if (record.ownership_capacity === "trustee" || record.owner_party_type === "trust") {
      c.hard_contradiction = true;
      notes.push(
        "Records show title held in a trustee capacity while the claim is personal ownership.",
      );
    }
  }

  if (!deed.ok || !identity.ok) {
    notes.push("Automated verification is unavailable, so this claim needs manual review.");
  }

  c.property_confidence = propertyConfidence;
  c.identity_confidence = identityConfidence;
  c.authority_confidence = authorityConfidence;
  c.contradictions = Array.from(new Set([...c.contradictions, ...notes.filter(Boolean)]));
  // Fail closed: every proposition must hold, on production-grade evidence.
  const sufficient = (level: ConfidenceLevel) => level === "strong" || level === "moderate";
  const autoApprovable =
    !c.hard_contradiction &&
    c.property_confidence === "strong" &&
    c.identity_confidence === "strong" &&
    sufficient(c.authority_confidence);
  c.status = autoApprovable ? "ownership_verified" : "manual_review";
  c.updated_at = nowIso();
  logStatus({
    property_id: c.property_id,
    case_id: c.id,
    actor_id: null,
    action: "verification.automated_checks",
    to_status: c.status,
    reason: notes[0] ?? null,
  });
  commit();
  return latency(clone(c), 260);
}

/* ------------------------------- decisions -------------------------------- */

export type ReviewDecision =
  | "verify_ownership"
  | "verify_representative"
  | "request_information"
  | "keep_pending"
  | "unable_to_verify"
  | "suspend"
  | "fraud_escalation";

const DECISION_STATUS: Record<ReviewDecision, VerificationCaseStatus> = {
  verify_ownership: "ownership_verified",
  verify_representative: "authorized_representative_verified",
  request_information: "collecting_evidence",
  keep_pending: "manual_review",
  unable_to_verify: "unable_to_verify",
  suspend: "suspended",
  fraud_escalation: "fraud_review",
};

const RELATIONSHIP_STATUS: Partial<Record<VerificationCaseStatus, RelationshipVerificationStatus>> =
  {
    ownership_verified: "ownership_verified",
    authorized_representative_verified: "authorized_representative_verified",
    unable_to_verify: "unable_to_verify",
    suspended: "suspended",
    revoked: "revoked",
  };

/** Reviewer decision. Material decisions require a reason. */
export async function decideVerificationCase(input: {
  caseId: UUID;
  decision: ReviewDecision;
  reason: string;
  reviewerId: UUID | null;
  recordedOwnerName?: string | null;
}): Promise<VerificationCase> {
  const db = getDb();
  const c = db.verification_cases.find((row) => row.id === input.caseId);
  if (!c) throw new Error("Verification case not found.");
  if (!input.reason.trim()) throw new Error("A reason is required for this decision.");

  const from = c.status;
  const to = DECISION_STATUS[input.decision];
  const now = nowIso();
  c.status = to;
  c.reviewer_id = input.reviewerId;
  c.decision_reason = input.reason.trim();
  c.updated_at = now;
  c.decided_at = now;
  if (to === "ownership_verified" || to === "authorized_representative_verified") {
    c.last_verified_at = now;
    // Verification is not permanent — schedule the next look.
    c.next_review_at = new Date(Date.now() + 365 * 86_400_000).toISOString();
    c.reverification_required = false;
  }

  const relationshipStatus = RELATIONSHIP_STATUS[to];
  if (relationshipStatus) {
    const record = currentOwnershipRecord(c.property_id);
    db.property_party_relationships
      .filter((r) => r.property_id === c.property_id && r.user_id === c.claimant_user_id)
      .forEach((r) => {
        r.status = relationshipStatus;
        r.recorded_owner_name =
          input.recordedOwnerName ?? record?.raw_owner_name ?? r.recorded_owner_name;
        r.verified_at =
          relationshipStatus === "ownership_verified" ||
          relationshipStatus === "authorized_representative_verified"
            ? now
            : null;
        r.updated_at = now;
      });
  }

  logStatus({
    property_id: c.property_id,
    case_id: c.id,
    actor_id: input.reviewerId,
    action: `verification.${input.decision}`,
    from_status: from,
    to_status: to,
    reason: c.decision_reason,
  });
  logAudit({
    organization_id: c.organization_id,
    actor_id: input.reviewerId,
    actor_role: "admin",
    action: `property_verification.${input.decision}`,
    entity_type: "verification_case",
    entity_id: c.id,
    metadata: { reason: c.decision_reason, property_id: c.property_id },
  });
  commit();
  return latency(clone(c), 220);
}

/* --------------------------- representatives ------------------------------ */

/** Owner-initiated, property-specific, revocable delegation. */
export async function authorizeRepresentative(input: {
  propertyId: UUID;
  ownerUserId: UUID | null;
  ownerName: string;
  representativeName: string;
  representativeUserId?: UUID | null;
  representativeOrganizationId?: UUID | null;
  role?: PropertyRelationshipKind;
  permissions?: PropertyPermission[];
  expiresAt?: string | null;
}): Promise<RepresentativeAuthorization> {
  const db = getDb();
  const property = db.properties.find((p) => p.id === input.propertyId);
  if (!property) throw new Error("Property not found.");

  const ownerVerified = db.property_party_relationships.some(
    (r) =>
      r.property_id === input.propertyId &&
      r.revoked_at === null &&
      r.status === "ownership_verified",
  );

  const now = nowIso();
  const authorization: RepresentativeAuthorization = {
    id: uuid(),
    property_id: input.propertyId,
    owner_user_id: input.ownerUserId,
    owner_name: input.ownerName,
    representative_user_id: input.representativeUserId ?? null,
    representative_organization_id: input.representativeOrganizationId ?? null,
    representative_name: input.representativeName.trim(),
    role: input.role ?? "authorized_representative",
    permissions: input.permissions ?? DEFAULT_REPRESENTATIVE_PERMISSIONS,
    // Pending until the representative accepts and verifies.
    status: "pending",
    granted_at: null,
    expires_at: input.expiresAt ?? null,
    revoked_at: null,
    revoked_reason: null,
    verification_case_id: null,
    management_assignment_id:
      db.management_assignments.find(
        (m) => m.property_id === input.propertyId && m.revoked_at === null,
      )?.id ?? null,
    created_at: now,
  };
  db.representative_authorizations.unshift(authorization);

  if (!ownerVerified) {
    recordRiskEvent({
      propertyId: input.propertyId,
      caseId: null,
      userId: input.ownerUserId,
      kind: "suspicious_authorization_pattern",
      severity: "low",
      detail: "A representative was invited before property ownership was verified.",
    });
  }
  logStatus({
    property_id: input.propertyId,
    case_id: null,
    actor_id: input.ownerUserId,
    action: "authorization.invited",
    reason: `Representative: ${authorization.representative_name}`,
  });
  commit();
  return latency(clone(authorization), 220);
}

/**
 * Representative accepts. Their authority still has to be verified, so this
 * opens a case rather than issuing the badge.
 */
export async function acceptAuthorization(input: {
  authorizationId: UUID;
  representativeUserId: UUID | null;
  representativeName?: string | null;
}): Promise<RepresentativeAuthorization> {
  const db = getDb();
  const authorization = db.representative_authorizations.find(
    (a) => a.id === input.authorizationId,
  );
  if (!authorization) throw new Error("Authorization not found.");
  const property = db.properties.find((p) => p.id === authorization.property_id);
  if (!property) throw new Error("Property not found.");

  const now = nowIso();
  authorization.representative_user_id = input.representativeUserId;
  authorization.status = "active";
  authorization.granted_at = now;

  const verificationCase = openPropertyClaim({
    property,
    claimantUserId: input.representativeUserId,
    claimantName: input.representativeName ?? authorization.representative_name,
    relationship: "authorized_representative",
    organizationId: authorization.representative_organization_id,
  });
  authorization.verification_case_id = verificationCase.id;
  commit();
  return latency(clone(authorization), 200);
}

export async function revokeAuthorization(input: {
  authorizationId: UUID;
  actorId: UUID | null;
  reason: string;
}): Promise<RepresentativeAuthorization> {
  const db = getDb();
  const authorization = db.representative_authorizations.find(
    (a) => a.id === input.authorizationId,
  );
  if (!authorization) throw new Error("Authorization not found.");
  const now = nowIso();
  authorization.status = "revoked";
  authorization.revoked_at = now;
  authorization.revoked_reason = input.reason.trim() || null;

  // Badge and permissions go away; history is preserved.
  db.property_party_relationships
    .filter(
      (r) =>
        r.property_id === authorization.property_id &&
        r.user_id === authorization.representative_user_id &&
        r.relationship !== "owner",
    )
    .forEach((r) => {
      r.status = "revoked";
      r.revoked_at = now;
      r.updated_at = now;
    });

  logStatus({
    property_id: authorization.property_id,
    case_id: authorization.verification_case_id,
    actor_id: input.actorId,
    action: "authorization.revoked",
    to_status: "revoked",
    reason: authorization.revoked_reason,
  });
  commit();
  return latency(clone(authorization), 200);
}

export function permissionsFor(propertyId: UUID, userId: UUID | null): PropertyPermission[] {
  if (!userId) return [];
  const now = Date.now();
  return getDb()
    .representative_authorizations.filter(
      (a) =>
        a.property_id === propertyId &&
        a.representative_user_id === userId &&
        a.status === "active" &&
        (a.expires_at === null || Date.parse(a.expires_at) > now),
    )
    .flatMap((a) => a.permissions);
}

/* ------------------------------ read models ------------------------------- */

function buildVerification(propertyId: UUID): PropertyVerification {
  const db = getDb();
  const relationships = db.property_party_relationships.filter((r) => r.property_id === propertyId);
  const badge = badgeFor(relationships);
  const record = currentOwnershipRecord(propertyId);
  const authorizations = db.representative_authorizations.filter(
    (a) => a.property_id === propertyId,
  );
  const winning = relationships.find(
    (r) =>
      r.revoked_at === null &&
      (badge === "ownership_verified"
        ? r.status === "ownership_verified"
        : r.status === "authorized_representative_verified"),
  );
  const activeRep = authorizations.find((a) => a.status === "active");

  return {
    property_id: propertyId,
    badge,
    recorded_owner_name: record?.raw_owner_name ?? winning?.recorded_owner_name ?? null,
    representative_name:
      badge === "authorized_representative" ? (activeRep?.representative_name ?? null) : null,
    verified_at: winning?.verified_at ?? null,
    verification_version: verificationVersion(propertyId),
    case:
      db.verification_cases
        .filter((c) => c.property_id === propertyId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    relationships,
    ownership_records: db.property_ownership_records.filter((r) => r.property_id === propertyId),
    authorizations,
  };
}

export async function getPropertyVerification(
  propertyId: UUID | null,
): Promise<PropertyVerification | null> {
  if (!propertyId) return null;
  return latency(clone(buildVerification(propertyId)), 140);
}

/** Badges for many properties at once — used by listing cards. */
export async function getPropertyBadges(
  propertyIds: UUID[],
): Promise<Record<UUID, PropertyVerification>> {
  const map: Record<UUID, PropertyVerification> = {};
  propertyIds.forEach((id) => {
    map[id] = buildVerification(id);
  });
  return latency(clone(map), 120);
}

export async function getVerificationCasesForOrg(orgId: UUID | null): Promise<VerificationCase[]> {
  if (!orgId) return [];
  const rows = getDb()
    .verification_cases.filter((c) => c.organization_id === orgId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return latency(clone(rows), 140);
}

/** Admin review queue — everything awaiting a human decision. */
export async function getVerificationQueue(): Promise<VerificationQueueItem[]> {
  const db = getDb();
  const open: VerificationCaseStatus[] = [
    "pending",
    "collecting_evidence",
    "manual_review",
    "fraud_review",
    "suspended",
  ];
  const rows: VerificationQueueItem[] = db.verification_cases
    .filter((c) => open.includes(c.status))
    .map((c) => {
      const property = db.properties.find((p) => p.id === c.property_id);
      return {
        case: c,
        property_name: property?.name ?? "Unknown property",
        property_address: property
          ? `${property.street_address}, ${property.city}, ${property.state} ${property.zip}`
          : "—",
        recorded_owner_name: currentOwnershipRecord(c.property_id)?.raw_owner_name ?? null,
        evidence: db.verification_evidence.filter((e) => e.case_id === c.id),
        ownership_records: db.property_ownership_records.filter(
          (r) => r.property_id === c.property_id,
        ),
        entity: db.verified_entities.find((e) => e.id === c.entity_id) ?? null,
        risk_events: db.verification_risk_events.filter((r) => r.case_id === c.id),
        history: db.verification_status_events.filter((h) => h.case_id === c.id),
      };
    })
    .sort((a, b) => b.case.created_at.localeCompare(a.case.created_at));
  return latency(clone(rows), 200);
}

export function providerStatusList() {
  return providerStatuses();
}

/* ------------------------------ disclosures ------------------------------- */

/** Identity of the party being paid/trusted, so a payee change re-triggers. */
function payeeReference(propertyId: UUID): string {
  const db = getDb();
  const property = db.properties.find((p) => p.id === propertyId);
  const activeRep = db.representative_authorizations.find(
    (a) => a.property_id === propertyId && a.status === "active",
  );
  return activeRep
    ? `rep:${activeRep.representative_organization_id ?? activeRep.representative_name}`
    : `org:${property?.organization_id ?? "unknown"}`;
}

export type DisclosureRequirement = {
  required: boolean;
  badge: PropertyBadge;
  /** True once a badge exists — no disclosure and no notice needed. */
  verified: boolean;
  /** Neutral notice text for verified-free properties, already acknowledged. */
  notice: string | null;
  disclosure_version: string;
  verification_version: string;
};

export async function getDisclosureRequirement(input: {
  tenantUserId: UUID | null;
  propertyId: UUID | null;
  context: DisclosureContext;
}): Promise<DisclosureRequirement> {
  const empty: DisclosureRequirement = {
    required: false,
    badge: null,
    verified: false,
    notice: null,
    disclosure_version: DISCLOSURE_VERSION,
    verification_version: "",
  };
  if (!input.propertyId) return latency(empty, 80);

  const db = getDb();
  const verification = buildVerification(input.propertyId);
  if (verification.badge) {
    return latency(
      {
        ...empty,
        badge: verification.badge,
        verified: true,
        verification_version: verification.verification_version,
      },
      80,
    );
  }

  const payee = payeeReference(input.propertyId);
  const acknowledged = input.tenantUserId
    ? db.verification_acknowledgements.some(
        (a) =>
          a.tenant_user_id === input.tenantUserId &&
          a.property_id === input.propertyId &&
          a.payee_reference === payee &&
          a.disclosure_version === DISCLOSURE_VERSION &&
          a.verification_version === verification.verification_version,
      )
    : false;

  return latency(
    {
      required: !acknowledged,
      badge: null,
      verified: false,
      notice: "Property ownership has not been verified by RentID.",
      disclosure_version: DISCLOSURE_VERSION,
      verification_version: verification.verification_version,
    },
    80,
  );
}

export async function acknowledgeDisclosure(input: {
  tenantUserId: UUID;
  propertyId: UUID;
  context: DisclosureContext;
}): Promise<void> {
  const db = getDb();
  const verification = buildVerification(input.propertyId);
  const relationship = verification.relationships.find((r) => r.revoked_at === null) ?? null;
  db.verification_acknowledgements.unshift({
    id: uuid(),
    tenant_user_id: input.tenantUserId,
    property_id: input.propertyId,
    relationship_id: relationship?.id ?? null,
    payee_reference: payeeReference(input.propertyId),
    disclosure_version: DISCLOSURE_VERSION,
    verification_version: verification.verification_version,
    context: input.context,
    acknowledged_at: nowIso(),
    metadata: { status_at_acknowledgement: verification.case?.status ?? "none" },
  });
  logAudit({
    actor_id: input.tenantUserId,
    action: "property_verification.disclosure_acknowledged",
    entity_type: "property",
    entity_id: input.propertyId,
    metadata: { context: input.context, disclosure_version: DISCLOSURE_VERSION },
  });
  commit();
  await latency(null, 120);
}

/* ------------------------------- risk events ------------------------------ */

export function recordRiskEvent(input: {
  propertyId: UUID | null;
  caseId: UUID | null;
  userId: UUID | null;
  kind: RiskEventKind;
  severity: VerificationRiskEvent["severity"];
  detail: string;
}): VerificationRiskEvent {
  const event: VerificationRiskEvent = {
    id: uuid(),
    property_id: input.propertyId,
    case_id: input.caseId,
    user_id: input.userId,
    kind: input.kind,
    severity: input.severity,
    detail: input.detail,
    created_at: nowIso(),
    resolved_at: null,
  };
  getDb().verification_risk_events.unshift(event);
  return event;
}

/** Many unrelated claims in a short window is reviewed, never accused. */
function detectRapidClaims(userId: UUID | null) {
  if (!userId) return;
  const cutoff = Date.now() - 86_400_000;
  const recent = getDb().verification_cases.filter(
    (c) => c.claimant_user_id === userId && Date.parse(c.created_at) > cutoff,
  );
  if (recent.length >= 5) {
    recordRiskEvent({
      propertyId: null,
      caseId: null,
      userId,
      kind: "rapid_multi_property_claims",
      severity: "medium",
      detail: `${recent.length} property claims opened in 24 hours.`,
    });
  }
}

/** Ownership transfer or payee change suspends the badge until re-verified. */
export async function requireReverification(input: {
  propertyId: UUID;
  reason: string;
  actorId?: UUID | null;
}): Promise<void> {
  const db = getDb();
  const now = nowIso();
  db.verification_cases
    .filter((c) => c.property_id === input.propertyId)
    .forEach((c) => {
      if (c.status === "ownership_verified" || c.status === "authorized_representative_verified") {
        c.status = "suspended";
      }
      c.reverification_required = true;
      c.updated_at = now;
    });
  db.property_party_relationships
    .filter((r) => r.property_id === input.propertyId && r.revoked_at === null)
    .forEach((r) => {
      if (r.status === "ownership_verified" || r.status === "authorized_representative_verified") {
        r.status = "suspended";
        r.updated_at = now;
      }
    });
  logStatus({
    property_id: input.propertyId,
    case_id: null,
    actor_id: input.actorId ?? null,
    action: "verification.reverification_required",
    to_status: "suspended",
    reason: input.reason,
  });
  commit();
  await latency(null, 120);
}

export { DISCLOSURE_VERSION, normalizeOwnerName };
export type { AuthorizationStatus };
