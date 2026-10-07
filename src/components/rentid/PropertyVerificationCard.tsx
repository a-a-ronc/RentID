/**
 * Ownership & authority panel on the existing property detail page.
 *
 * Shows the owner-facing internal state (which is richer than the public
 * badge), lets the claimant add evidence, and lets a verified owner grant or
 * revoke a property-specific representative authorization.
 */
import { useState } from "react";
import { toast } from "sonner";

import { ListRow, SectionCard, StatusPill } from "@/components/rentid/patterns";
import {
  Button,
  Field,
  FormGrid,
  Modal,
  Select,
  TextArea,
  TextInput,
} from "@/components/rentid/kit";
import {
  OwnershipNotice,
  PropertyVerificationBadgeButton,
} from "@/components/rentid/verification-ui";
import { shortDate } from "@/lib/format";
import {
  useAuthorizeRepresentative,
  usePropertyVerification,
  useRevokeAuthorization,
  useStartPropertyClaim,
  useSubmitVerificationEvidence,
} from "@/lib/rentid";
import { CLAIM_LABELS, PERMISSION_LABELS } from "@/lib/services/verification";
import type {
  PropertyClaimRelationship,
  VerificationCaseStatus,
  VerificationProposition,
} from "@/lib/types";

const STATUS_COPY: Record<
  VerificationCaseStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral"; hint: string }
> = {
  pending: {
    label: "Claim started",
    tone: "neutral",
    hint: "Add the recorded deed and a matching ID to continue.",
  },
  collecting_evidence: {
    label: "Collecting evidence",
    tone: "warning",
    hint: "RentID needs the recorded deed, plus supporting parcel or assessor records.",
  },
  manual_review: {
    label: "In RentID review",
    tone: "warning",
    hint: "A RentID reviewer is checking the records. No badge is shown while this is open.",
  },
  ownership_verified: {
    label: "Ownership verified",
    tone: "success",
    hint: "The recorded owner and this account match.",
  },
  authorized_representative_verified: {
    label: "Authority verified",
    tone: "success",
    hint: "You are authorized to act for this property's owner.",
  },
  unable_to_verify: {
    label: "Not verified",
    tone: "danger",
    hint: "RentID could not establish this claim. You can start again with new records.",
  },
  suspended: {
    label: "Verification suspended",
    tone: "danger",
    hint: "Something changed about this property. Reverification is required before badges return.",
  },
  revoked: {
    label: "Authorization revoked",
    tone: "danger",
    hint: "The owner revoked this authority. Badges and permissions were removed.",
  },
  fraud_review: {
    label: "Under review",
    tone: "danger",
    hint: "RentID is reviewing risk signals on this property. No badge is shown.",
  },
};

const EVIDENCE_TYPES: [VerificationProposition, string, string][] = [
  ["property", "recorded_deed", "Recorded deed or transfer document"],
  ["property", "assessor_record", "Assessor / parcel record"],
  ["identity", "government_id", "Government-issued ID"],
  ["identity", "entity_filing", "Business or entity filing"],
  ["authority", "authorization_letter", "Owner authorization letter"],
  ["authority", "management_agreement", "Property management agreement"],
  ["authority", "trustee_document", "Trust or estate appointment document"],
];

export function PropertyVerificationCard({
  propertyId,
  className = "",
}: {
  propertyId: string;
  className?: string;
}) {
  const verification = usePropertyVerification(propertyId);
  const startClaim = useStartPropertyClaim();
  const submitEvidence = useSubmitVerificationEvidence();
  const authorize = useAuthorizeRepresentative();
  const revoke = useRevokeAuthorization();

  const [claimOpen, setClaimOpen] = useState(false);
  const [relationship, setRelationship] = useState<PropertyClaimRelationship>("individual_owner");
  const [claimantName, setClaimantName] = useState("");

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceIndex, setEvidenceIndex] = useState("0");
  const [summary, setSummary] = useState("");

  const [authOpen, setAuthOpen] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [repName, setRepName] = useState("");

  const v = verification.data;
  const c = v?.case ?? null;
  const status = c ? STATUS_COPY[c.status] : null;
  const activeAuthorizations = (v?.authorizations ?? []).filter((a) => a.status === "active");

  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTouched, setClaimTouched] = useState(false);
  const claimNameError = claimantName.trim()
    ? null
    : relationship === "individual_owner"
      ? "Enter the owner's name exactly as it appears on the deed."
      : "Enter the owner's legal name as recorded (person, business, trust or estate).";

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    setClaimTouched(true);
    setClaimError(null);
    if (claimNameError) return;
    try {
      await startClaim.mutateAsync({
        propertyId,
        relationship,
        claimantName: claimantName.trim(),
      });
      toast.success("Claim started. Next, add a document that shows ownership.");
      setClaimOpen(false);
      setClaimTouched(false);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Could not start the claim.");
    }
  }

  async function submitEvidenceForm(e: React.FormEvent) {
    e.preventDefault();
    if (!c) return;
    const pick = EVIDENCE_TYPES[Number(evidenceIndex)];
    if (!pick) return;
    try {
      await submitEvidence.mutateAsync({
        caseId: c.id,
        proposition: pick[0],
        evidenceType: pick[1],
        summary: summary.trim() || pick[2],
      });
      toast.success("Evidence submitted for review.");
      setSummary("");
      setEvidenceOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit the evidence.");
    }
  }

  async function submitAuthorization(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authorize.mutateAsync({
        propertyId,
        ownerName: ownerName.trim(),
        representativeName: repName.trim(),
      });
      toast.success("Authorization created for this property only.");
      setOwnerName("");
      setRepName("");
      setAuthOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the authorization.");
    }
  }

  return (
    <SectionCard
      title="Ownership & authority"
      aside={v?.badge ? "Verified" : "Property-specific"}
      className={className}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {c ? (
            <Button
              tone={
                c.status === "pending" || c.status === "collecting_evidence"
                  ? "primary"
                  : "secondary"
              }
              size="sm"
              onClick={() => setEvidenceOpen(true)}
            >
              {c.status === "pending" || c.status === "collecting_evidence"
                ? "Next: add ownership evidence"
                : "Add evidence"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setClaimOpen(true)}>
              Claim this property
            </Button>
          )}
          {v?.badge === "ownership_verified" ? (
            <Button tone="ghost" size="sm" onClick={() => setAuthOpen(true)}>
              Authorize a representative
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
        {v?.badge ? (
          <PropertyVerificationBadgeButton verification={v} size="md" />
        ) : (
          <OwnershipNotice />
        )}
      </div>

      {c ? (
        <>
          <ListRow
            title={status?.label ?? "Claim"}
            subtitle={status?.hint ?? ""}
            pill={<StatusPill status={status?.label ?? ""} tone={status?.tone ?? "neutral"} />}
          />
          <ListRow title="Claimed relationship" subtitle={CLAIM_LABELS[c.claim_relationship]} />
          <ListRow
            title="What RentID has established"
            subtitle={`Property record: ${c.property_confidence} · Claimant identity: ${c.identity_confidence} · Authority: ${c.authority_confidence}`}
          />
          {c.contradictions.length > 0 ? (
            <div className="px-4 py-3">
              <p className="text-[12px] font-medium text-warning">Needs attention</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
                {c.contradictions.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <ListRow
          title="No ownership claim yet"
          subtitle="Verifying one property never verifies your other properties — each one is checked on its own records."
        />
      )}

      {activeAuthorizations.map((a) => (
        <ListRow
          key={a.id}
          title={a.representative_name}
          subtitle={`${(a.permissions ?? []).map((perm) => PERMISSION_LABELS[perm]).join(", ")}${
            a.expires_at ? ` · expires ${shortDate(a.expires_at)}` : ""
          }`}
          value={
            <Button
              tone="ghost"
              size="sm"
              onClick={() =>
                void revoke
                  .mutateAsync({ authorizationId: a.id, reason: "Revoked by the owner." })
                  .then(() => toast.success("Authorization revoked."))
                  .catch((err: unknown) =>
                    toast.error(err instanceof Error ? err.message : "Could not revoke."),
                  )
              }
            >
              Revoke
            </Button>
          }
        />
      ))}

      <Modal
        open={claimOpen}
        onClose={() => {
          setClaimOpen(false);
          setClaimError(null);
        }}
        title="Claim this property"
        description="Step 1 of 2. Tell RentID how you're connected to this property. In step 2 you add a document, such as the recorded deed or a property tax statement, and a RentID reviewer checks it against county records."
      >
        <form onSubmit={submitClaim} noValidate className="space-y-3.5">
          {claimError ? (
            <p
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-[12.5px] text-destructive"
            >
              {claimError}
            </p>
          ) : null}
          <Field label="Your relationship to this property" htmlFor="claim-relationship">
            <Select
              id="claim-relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as PropertyClaimRelationship)}
            >
              {(Object.keys(CLAIM_LABELS) as PropertyClaimRelationship[]).map((key) => (
                <option key={key} value={key}>
                  {CLAIM_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Legal owner name as recorded"
            htmlFor="claim-owner"
            hint="As it's written on the deed or county record, e.g. John A. Smith or Smith Holdings LLC."
            error={claimTouched ? claimNameError : null}
          >
            <TextInput
              id="claim-owner"
              autoComplete="name"
              value={claimantName}
              aria-invalid={Boolean(claimTouched && claimNameError) || undefined}
              onChange={(e) => setClaimantName(e.target.value)}
              onBlur={() => setClaimTouched(true)}
            />
          </Field>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Starting a claim doesn't show a badge on its own. The verified badge appears only after
            the records check out.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              tone="ghost"
              onClick={() => {
                setClaimOpen(false);
                setClaimError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={startClaim.isPending} className="sm:min-w-44">
              Start claim
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title="Add ownership evidence"
        description="Step 2 of 2. Choose the document you have and describe what it shows. A RentID reviewer checks it against county records."
      >
        <form onSubmit={submitEvidenceForm} className="space-y-3.5">
          <Field label="Document type">
            <Select value={evidenceIndex} onChange={(e) => setEvidenceIndex(e.target.value)}>
              {EVIDENCE_TYPES.map(([, , label], i) => (
                <option key={label} value={String(i)}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What this document shows">
            <TextArea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Evidence is reviewed by RentID only. It is never shown to tenants or on public pages.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button tone="ghost" onClick={() => setEvidenceOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitEvidence.isPending} className="sm:min-w-44">
              Submit for review
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={authOpen} onClose={() => setAuthOpen(false)} title="Authorize a representative">
        <form onSubmit={submitAuthorization} className="space-y-3.5">
          <FormGrid>
            <Field label="Owner name">
              <TextInput
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </Field>
            <Field label="Representative or company">
              <TextInput required value={repName} onChange={(e) => setRepName(e.target.value)} />
            </Field>
          </FormGrid>
          <p className="text-[12px] text-muted-foreground">
            This authorization applies to this property only, and you can revoke it at any time.
          </p>
          <Button type="submit" loading={authorize.isPending} className="w-full">
            Create authorization
          </Button>
        </form>
      </Modal>
    </SectionCard>
  );
}
