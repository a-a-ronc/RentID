/**
 * /applications — every rental application across every listing, in one inbox.
 *
 * The per-listing pipeline (listings/$listingId) is where a landlord tunes one
 * listing; this is where they make decisions. Approving an applicant hands
 * straight into the core loop: "Invite to lease" creates the pending tenancy
 * and invitation for the listing's unit and gives back the link to send.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { InviteLink } from "@/components/rentid/InviteLink";
import {
  Button,
  Field,
  FormGrid,
  InlineError,
  LoadingCard,
  Modal,
  Select,
  TextInput,
} from "@/components/rentid/kit";
import {
  APPLICATION_STATUSES,
  applicationLabel,
  applicationTone,
  SourcePill,
} from "@/components/rentid/listing-ui";
import { AppShell, PageHeader, StatusPill, SummaryGrid } from "@/components/rentid/patterns";
import { EmptyState, Glass, Pill } from "@/components/rentid/Surface";
import {
  applicationBucket,
  incomeCheck,
  isUndecided,
  sortForInbox,
  type ApplicationBucket,
} from "@/lib/applications";
import { money, shortDate } from "@/lib/format";
import {
  useActiveOrg,
  useApplications,
  useInviteTenant,
  useUpdateApplicationStatus,
} from "@/lib/rentid";
import type { ApplicationStatus, ApplicationWithContext } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({
    meta: [{ title: "Applications — RentID" }, { name: "robots", content: "noindex" }],
  }),
  component: ApplicationsPage,
});

const TABS: { key: ApplicationBucket | "all"; label: string }[] = [
  { key: "decide", label: "Needs a decision" },
  { key: "approved", label: "Approved" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function ApplicationsPage() {
  const active = useActiveOrg();
  const applications = useApplications(active.orgId);
  const [tab, setTab] = useState<ApplicationBucket | "all">("decide");
  const [listingId, setListingId] = useState<string>("all");
  const [inviting, setInviting] = useState<ApplicationWithContext | null>(null);

  const all = useMemo(() => applications.data ?? [], [applications.data]);

  const listingOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of all) {
      if (a.listing && !seen.has(a.listing.id)) {
        seen.set(a.listing.id, `${a.listing.headline} · ${a.property_name} ${a.unit_name}`);
      }
    }
    return [...seen.entries()];
  }, [all]);

  const scoped = listingId === "all" ? all : all.filter((a) => a.listing_id === listingId);
  const counts = {
    decide: scoped.filter((a) => applicationBucket(a.status) === "decide").length,
    approved: scoped.filter((a) => applicationBucket(a.status) === "approved").length,
    closed: scoped.filter((a) => applicationBucket(a.status) === "closed").length,
    all: scoped.length,
  };
  const visible = sortForInbox(
    tab === "all" ? scoped : scoped.filter((a) => applicationBucket(a.status) === tab),
  );
  const shared = scoped.filter((a) => a.profile_shared).length;

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader title="Applications" subtitle={active.org?.name} />

      <SummaryGrid
        className="mt-5"
        items={[
          {
            label: "Needs a decision",
            value: String(counts.decide),
            tone: counts.decide > 0 ? "warning" : "neutral",
            hint: "Waiting on you",
          },
          { label: "Approved", value: String(counts.approved), tone: "success" },
          {
            label: "RentID profile shared",
            value: scoped.length ? `${Math.round((shared / scoped.length) * 100)}%` : "—",
            hint: "Verified history attached",
          },
          { label: "Total", value: String(counts.all), hint: "Across every channel" },
        ]}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-4 py-1.5 font-display text-[12px] font-medium transition-colors",
              tab === t.key ? "bg-brand text-brand-foreground" : "glass text-muted-foreground",
            )}
          >
            {t.label}
            <span className="num ml-1.5 opacity-70">{counts[t.key]}</span>
          </button>
        ))}
        {listingOptions.length > 1 ? (
          <Select
            aria-label="Filter by listing"
            className="ml-auto w-auto py-1.5 text-[12px]"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
          >
            <option value="all">All listings</option>
            {listingOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {applications.isLoading ? (
          <LoadingCard label="Loading applications…" />
        ) : applications.isError ? (
          <InlineError
            message="Applications could not be loaded."
            onRetry={() => void applications.refetch()}
          />
        ) : all.length === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Publish a listing and share its apply link. Applications from RentID, Zillow, Apartments.com and direct links all land here."
            action={
              <Link
                to="/listings"
                className="rounded-full bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground"
              >
                Go to listings
              </Link>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title={tab === "decide" ? "You're all caught up" : "Nothing here"}
            description={
              tab === "decide"
                ? "Every application has a decision. New ones will appear here."
                : "No applications match this filter."
            }
          />
        ) : (
          visible.map((a) => (
            <ApplicationCard key={a.id} application={a} onInvite={() => setInviting(a)} />
          ))
        )}
      </div>

      <InviteFromApplication
        application={inviting}
        organizationId={active.orgId}
        onClose={() => setInviting(null)}
      />
    </AppShell>
  );
}

/* ------------------------------------------------------------------ card */

function ApplicationCard({
  application: a,
  onInvite,
}: {
  application: ApplicationWithContext;
  onInvite: () => void;
}) {
  const update = useUpdateApplicationStatus();
  const [open, setOpen] = useState(false);
  const [confirmDeny, setConfirmDeny] = useState(false);
  const rent = a.listing?.monthly_rent ?? null;
  const income = incomeCheck(a.monthly_income, rent);

  function setStatus(status: ApplicationStatus, message: string) {
    update.mutate(
      { applicationId: a.id, status },
      {
        onSuccess: () => toast.success(message),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not update the application."),
        onSettled: () => setConfirmDeny(false),
      },
    );
  }

  return (
    <Glass className="overflow-hidden">
      <div className="px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-semibold">{a.applicant_name}</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {a.listing ? (
                <Link
                  to="/listings/$listingId"
                  params={{ listingId: a.listing.id }}
                  className="hover:text-foreground hover:underline"
                >
                  {a.listing.headline}
                </Link>
              ) : (
                "Listing removed"
              )}{" "}
              · {a.property_name} {a.unit_name} · applied {shortDate(a.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {a.source ? <SourcePill source={a.source} /> : null}
            <StatusPill status={applicationLabel(a.status)} tone={applicationTone(a.status)} />
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Fact label="Monthly income">
            {a.monthly_income ? money(a.monthly_income) : "—"}
            {income ? (
              <Pill tone={income.tone}>
                <span className="num">{income.label}</span>
              </Pill>
            ) : null}
          </Fact>
          <Fact label="Rent">{rent ? `${money(rent)}/mo` : "—"}</Fact>
          <Fact label="Move-in">{a.move_in_date ? shortDate(a.move_in_date) : "Flexible"}</Fact>
          <Fact label="RentID history">
            {a.passport ? (
              <span className="inline-flex items-center gap-1 text-success">
                <ShieldCheck className="size-3.5" />
                {a.passport.verified_payments > 0
                  ? `${a.passport.on_time_pct}% on time · ${a.passport.verified_payments} payments`
                  : "Shared · no verified payments yet"}
              </span>
            ) : (
              <span className="text-muted-foreground">Not shared</span>
            )}
          </Fact>
        </dl>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {isUndecided(a.status) ? (
            confirmDeny ? (
              <>
                <span className="text-[12.5px] text-muted-foreground">
                  Deny {a.applicant_name.split(" ")[0]}?
                </span>
                <Button
                  tone="danger"
                  size="sm"
                  loading={update.isPending}
                  onClick={() => setStatus("denied", `${a.applicant_name} denied.`)}
                >
                  Deny application
                </Button>
                <Button tone="ghost" size="sm" onClick={() => setConfirmDeny(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  loading={update.isPending}
                  onClick={() =>
                    setStatus(
                      "approved",
                      `${a.applicant_name} approved. Invite them to a lease next.`,
                    )
                  }
                >
                  Approve
                </Button>
                {a.status !== "more_info_requested" ? (
                  <Button
                    tone="secondary"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      setStatus("more_info_requested", "Marked as waiting on the applicant.")
                    }
                  >
                    Request info
                  </Button>
                ) : null}
                <Button tone="ghost" size="sm" onClick={() => setConfirmDeny(true)}>
                  Deny
                </Button>
              </>
            )
          ) : a.status === "approved" ? (
            <Button size="sm" onClick={onInvite} disabled={!a.listing}>
              Invite to lease
            </Button>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Details
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border/60 bg-card/40 px-4 py-3.5">
          <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            <Fact label="Email">
              <a className="hover:underline" href={`mailto:${a.applicant_email}`}>
                {a.applicant_email}
              </a>
            </Fact>
            <Fact label="Phone">
              {a.applicant_phone ? (
                <a className="hover:underline" href={`tel:${a.applicant_phone}`}>
                  {a.applicant_phone}
                </a>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="Employer">{a.employer || "—"}</Fact>
            <Fact label="Current address">{a.current_address || "—"}</Fact>
            {a.passport ? (
              <Fact label="Verified record">
                {a.passport.verified_tenancies} verified{" "}
                {a.passport.verified_tenancies === 1 ? "tenancy" : "tenancies"} ·{" "}
                {a.passport.months_of_history} months of history
                {a.passport.late_payments > 0 ? ` · ${a.passport.late_payments} late` : ""}
              </Fact>
            ) : null}
            {a.references ? <Fact label="References">{a.references}</Fact> : null}
            {a.note ? (
              <div className="sm:col-span-2">
                <Fact label="Note from applicant">{a.note}</Fact>
              </div>
            ) : null}
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Set status</span>
            <Select
              aria-label="Application status"
              className="w-auto py-1.5 text-[12px]"
              value={a.status}
              disabled={update.isPending}
              onChange={(e) =>
                setStatus(e.target.value as ApplicationStatus, "Application status updated.")
              }
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}
    </Glass>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
        {children}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------ invite to lease */

function InviteFromApplication({
  application,
  organizationId,
  onClose,
}: {
  application: ApplicationWithContext | null;
  organizationId: string | null;
  onClose: () => void;
}) {
  const invite = useInviteTenant();
  const update = useUpdateApplicationStatus();
  const [token, setToken] = useState<string | null>(null);
  const [form, setForm] = useState<{
    startDate: string;
    endDate: string;
    rent: string;
    deposit: string;
  } | null>(null);

  // Seed the form whenever a different application is opened.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (application && seededFor !== application.id) {
    const listing = application.listing;
    const start =
      application.move_in_date ?? listing?.available_on ?? new Date().toISOString().slice(0, 10);
    setSeededFor(application.id);
    setToken(null);
    setForm({
      startDate: start,
      endDate: listing?.lease_term_months ? addMonths(start, listing.lease_term_months) : "",
      rent: listing?.monthly_rent ? String(listing.monthly_rent) : "",
      deposit: listing?.security_deposit ? String(listing.security_deposit) : "",
    });
  }

  function close() {
    setSeededFor(null);
    setToken(null);
    onClose();
  }

  if (!application || !form) return null;
  const listing = application.listing;

  async function send() {
    if (!application || !listing || !organizationId || !form) return;
    try {
      const { invitation } = await invite.mutateAsync({
        organizationId,
        propertyId: listing.property_id,
        unitId: listing.unit_id,
        email: application.applicant_email,
        name: application.applicant_name,
        monthlyRent: form.rent ? Number(form.rent) : null,
        securityDeposit: form.deposit ? Number(form.deposit) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      });
      await update.mutateAsync({ applicationId: application.id, status: "lease_sent" });
      setToken(invitation.token);
      toast.success(`Invitation created for ${application.applicant_name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the invitation.");
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title={token ? "Send this link" : `Invite ${application.applicant_name} to a lease`}
      description={
        token
          ? `Send it to ${application.applicant_email} however you normally talk. When they accept from their own account, the tenancy is verified for both of you.`
          : `${listing?.headline ?? "Listing"} · ${application.property_name} ${application.unit_name}`
      }
      footer={
        token ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={invite.isPending || update.isPending}
              disabled={!listing || !form.startDate}
              onClick={() => void send()}
            >
              Create invitation
            </Button>
          </div>
        )
      }
    >
      {token ? (
        <InviteLink token={token} />
      ) : (
        <FormGrid>
          <Field label="Lease start" htmlFor="inv-start">
            <TextInput
              id="inv-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field label="Lease end" htmlFor="inv-end" hint="Leave blank for month-to-month">
            <TextInput
              id="inv-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
          <Field label="Monthly rent" htmlFor="inv-rent">
            <TextInput
              id="inv-rent"
              inputMode="decimal"
              value={form.rent}
              onChange={(e) => setForm({ ...form, rent: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </Field>
          <Field label="Security deposit" htmlFor="inv-deposit">
            <TextInput
              id="inv-deposit"
              inputMode="decimal"
              value={form.deposit}
              onChange={(e) => setForm({ ...form, deposit: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </Field>
        </FormGrid>
      )}
    </Modal>
  );
}

/** YYYY-MM-DD plus n months, minus a day (a 12-month lease from Oct 1 ends Sep 30). */
function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const end = new Date(Date.UTC(y, m - 1 + months, d - 1));
  return end.toISOString().slice(0, 10);
}
