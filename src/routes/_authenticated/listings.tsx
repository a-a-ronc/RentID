import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  AppShell,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
  SummaryGrid,
  ToolbarButton,
} from "@/components/rentid/patterns";
import {
  Button,
  DemoNotice,
  Field,
  FormGrid,
  InlineError,
  LoadingCard,
  Modal,
  Select,
  TextArea,
  TextInput,
} from "@/components/rentid/kit";
import { EmptyState, Pill } from "@/components/rentid/Surface";
import { money, shortDate } from "@/lib/format";
import {
  useActiveOrg,
  useApplications,
  useCreateListing,
  useListings,
  useProperties,
  useUnits,
  useUpdateApplicationStatus,
  useUpdateListingStatus,
} from "@/lib/rentid";
import type { ApplicationStatus, ApplicationWithContext } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/listings")({
  head: () => ({
    meta: [
      { title: "Listings & applications — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ListingsPage,
});

const SYNDICATION = ["RentID Marketplace", "Zillow"];

function ListingsPage() {
  const active = useActiveOrg();
  const listings = useListings(active.orgId);
  const applications = useApplications(active.orgId);
  const properties = useProperties(active.orgId);
  const createListing = useCreateListing();
  const updateListing = useUpdateListingStatus();
  const updateApplication = useUpdateApplicationStatus();

  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [rent, setRent] = useState("");
  const [availableOn, setAvailableOn] = useState("");
  const [term, setTerm] = useState("12");
  const [selected, setSelected] = useState<ApplicationWithContext | null>(null);

  const units = useUnits(propertyId || null, active.orgId);
  const vacantUnits = useMemo(
    () => (units.data ?? []).filter((u) => u.occupancy_status !== "occupied"),
    [units.data],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active.orgId || !propertyId || !unitId) return;
    await createListing.mutateAsync({
      organizationId: active.orgId,
      propertyId,
      unitId,
      headline,
      description: description || null,
      monthlyRent: Number(rent || 0),
      availableOn: availableOn || new Date().toISOString().slice(0, 10),
      leaseTermMonths: Number(term || 12),
      syndicatedTo: ["RentID Marketplace"],
      publish: true,
    });
    setOpen(false);
    setHeadline("");
    setDescription("");
    setRent("");
    setAvailableOn("");
  }

  const published = (listings.data ?? []).filter((l) => l.status === "published");
  const newApplications = (applications.data ?? []).filter((a) => a.status === "new");
  const inReview = (applications.data ?? []).filter((a) => a.status === "in_review");

  const toneFor = (status: ApplicationStatus) =>
    status === "approved"
      ? "success"
      : status === "denied"
        ? "danger"
        : status === "in_review"
          ? "accent"
          : "neutral";

  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader
        title="Listings & applications"
        subtitle={active.org?.name}
        action={<ToolbarButton label="New listing" onClick={() => setOpen(true)} />}
      />

      {active.isDemo ? (
        <div className="mt-4">
          <DemoNotice>
            Listings and applications use demo data. Syndication to partner sites activates once the
            backend and partner feeds are connected.
          </DemoNotice>
        </div>
      ) : null}

      <div className="mt-5">
        <SummaryGrid
          items={[
            { label: "Published", value: published.length },
            { label: "New applications", value: newApplications.length, tone: newApplications.length ? "warning" : "neutral" },
            { label: "In review", value: inReview.length },
            {
              label: "Approved",
              value: (applications.data ?? []).filter((a) => a.status === "approved").length,
              tone: "success",
            },
          ]}
        />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <SectionCard title="Your listings" aside={`${listings.data?.length ?? 0} total`}>
          {listings.isPending ? (
            <div className="p-4">
              <LoadingCard rows={3} />
            </div>
          ) : listings.isError ? (
            <div className="p-4">
              <InlineError message="Listings unavailable." onRetry={() => void listings.refetch()} />
            </div>
          ) : listings.data && listings.data.length > 0 ? (
            listings.data.map((listing, i) => (
              <div key={listing.id}>
                <ListRow
                  title={listing.headline}
                  subtitle={`${listing.property?.name ?? "Property"} · ${listing.unit?.name ?? "Unit"} · available ${shortDate(listing.available_on)}`}
                  value={money(listing.monthly_rent)}
                  pill={
                    <StatusPill
                      status={listing.status}
                      tone={listing.status === "published" ? "success" : listing.status === "leased" ? "accent" : "neutral"}
                    />
                  }
                  delay={i * 40}
                />
                <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                  {listing.syndicated_to.length > 0 ? (
                    listing.syndicated_to.map((dest) => (
                      <Pill key={dest} tone="accent">
                        {dest}
                      </Pill>
                    ))
                  ) : (
                    <Pill>Not syndicated</Pill>
                  )}
                  <Pill>{listing.application_count} applications</Pill>
                  {listing.status === "published" ? (
                    <>
                      <Link
                        to="/rent/$listingId"
                        params={{ listingId: listing.id }}
                        className="text-[11.5px] font-medium text-accent"
                      >
                        View public page
                      </Link>
                      <Button
                        size="sm"
                        tone="ghost"
                        onClick={() =>
                          void updateListing.mutateAsync({ listingId: listing.id, status: "paused" })
                        }
                      >
                        Pause
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() =>
                        void updateListing.mutateAsync({ listingId: listing.id, status: "published" })
                      }
                    >
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4">
              <EmptyState
                title="No listings yet"
                description="Publish a vacant unit to start receiving applications with verified rental history."
                action={<Button onClick={() => setOpen(true)}>New listing</Button>}
              />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Applications" aside={`${applications.data?.length ?? 0} total`}>
          {applications.isPending ? (
            <div className="p-4">
              <LoadingCard rows={3} />
            </div>
          ) : applications.data && applications.data.length > 0 ? (
            applications.data.map((application, i) => (
              <ListRow
                key={application.id}
                title={application.applicant_name}
                subtitle={`${application.property_name} · ${application.unit_name} · applied ${shortDate(application.created_at)}`}
                pill={<StatusPill status={application.status.replace("_", " ")} tone={toneFor(application.status)} />}
                onClick={() => setSelected(application)}
                delay={i * 40}
              />
            ))
          ) : (
            <ListRow title="No applications yet" subtitle="Applications appear here as renters apply" />
          )}
        </SectionCard>
      </div>

      {/* ------------------------------ new listing ----------------------------- */}
      <Modal open={open} onClose={() => setOpen(false)} title="New listing">
        <form onSubmit={submit}>
          <FormGrid>
            <Field label="Property">
              <Select
                required
                value={propertyId}
                onChange={(e) => {
                  setPropertyId(e.target.value);
                  setUnitId("");
                }}
              >
                <option value="">Select a property</option>
                {(properties.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" hint="Only vacant units can be listed">
              <Select required value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select a unit</option>
                {vacantUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Headline" className="sm:col-span-2">
              <TextInput required value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </Field>
            <Field label="Monthly rent">
              <TextInput
                required
                type="number"
                inputMode="numeric"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </Field>
            <Field label="Available from">
              <TextInput type="date" value={availableOn} onChange={(e) => setAvailableOn(e.target.value)} />
            </Field>
            <Field label="Lease term (months)">
              <TextInput type="number" value={term} onChange={(e) => setTerm(e.target.value)} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </FormGrid>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Published to {SYNDICATION[0]}. Partner syndication can be enabled per listing later.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createListing.isPending} disabled={createListing.isPending}>
              Publish listing
            </Button>
          </div>
        </form>
      </Modal>

      {/* --------------------------- application review ------------------------- */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.applicant_name ?? "Application"}
        description={selected ? `${selected.property_name} · ${selected.unit_name}` : undefined}
      >
        {selected ? (
          <div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Email", selected.applicant_email],
                ["Phone", selected.applicant_phone ?? "—"],
                ["Monthly income", money(selected.monthly_income ?? 0)],
                ["Requested move-in", selected.move_in_date ? shortDate(selected.move_in_date) : "—"],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-secondary/60 px-3 py-2.5">
                  <p className="label-eyebrow">{label}</p>
                  <p className="num mt-1 truncate text-[13px] font-medium">{value}</p>
                </div>
              ))}
            </div>

            {selected.note ? (
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{selected.note}</p>
            ) : null}

            <div className="mt-4 rounded-2xl border border-border/70 p-4">
              <p className="label-eyebrow">Shared rental record</p>
              {selected.passport ? (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {[
                    ["Verified tenancies", selected.passport.verified_tenancies],
                    ["Verified payments", selected.passport.verified_payments],
                    ["On-time rate", `${selected.passport.on_time_pct}%`],
                    ["Months of history", selected.passport.months_of_history],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="num text-[14px] font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  This applicant did not share their RentID history. Nothing here is verified.
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                tone="ghost"
                onClick={() =>
                  void updateApplication
                    .mutateAsync({ applicationId: selected.id, status: "in_review" })
                    .then(() => setSelected(null))
                }
              >
                Move to review
              </Button>
              <Button
                tone="danger"
                onClick={() =>
                  void updateApplication
                    .mutateAsync({ applicationId: selected.id, status: "denied" })
                    .then(() => setSelected(null))
                }
              >
                Deny
              </Button>
              <Button
                onClick={() =>
                  void updateApplication
                    .mutateAsync({ applicationId: selected.id, status: "approved" })
                    .then(() => setSelected(null))
                }
              >
                Approve
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
