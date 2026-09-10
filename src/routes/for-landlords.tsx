import { createFileRoute } from "@tanstack/react-router";

import { PublicGrid, PublicHero, PublicShell } from "@/components/rentid/PublicShell";

const TITLE = "RentID for landlords — verified tenants, reconciled rent, one ledger";
const DESCRIPTION =
  "List units, review verified applicants, reconcile rent per unit, track maintenance and build an operating reputation you own.";

export const Route = createFileRoute("/for-landlords")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForLandlords,
});

function ForLandlords() {
  return (
    <PublicShell>
      <PublicHero
        eyebrow="For landlords"
        title={
          <>
            Rent that reconciles. Tenants that <span className="text-accent">check out</span>.
          </>
        }
        body="Every unit has a status and a number. Applicants arrive with verified rental history instead of a PDF of promises, and your own operating record travels with your properties."
        primary={{ to: "/auth", label: "Start with a demo portfolio" }}
        secondary={{ to: "/for-property-managers", label: "I manage for owners" }}
      />

      <section className="pb-12">
        <h2 className="font-display text-[19px] font-semibold tracking-tight">Run the portfolio</h2>
        <div className="mt-4">
          <PublicGrid
            items={[
              {
                title: "Properties, units and leases",
                body: "Occupancy, rent, deposits and lease dates per unit, with documents attached where they belong.",
              },
              {
                title: "Rent ledger that balances",
                body: "Collected, outstanding, late and upcoming rent for the month — per tenancy, per period.",
              },
              {
                title: "Listings and applications",
                body: "Publish a vacancy, receive applications with verified rental history attached, decide in one place.",
              },
              {
                title: "Maintenance and evidence",
                body: "Work orders with priority, response time and a closing record you can point to later.",
              },
            ]}
          />
        </div>
      </section>

      <section className="pb-12">
        <h2 className="font-display text-[19px] font-semibold tracking-tight">
          Verification, not vibes
        </h2>
        <div className="mt-4">
          <PublicGrid
            columns={3}
            items={[
              {
                title: "Claim your property",
                body: "Ownership is verified before badges, listings or payout changes activate.",
              },
              {
                title: "Confirm the tenancy",
                body: "Both sides confirm the lease. Reputation only builds on verified tenancies.",
              },
              {
                title: "Show your record",
                body: "Response times, collection rate and reviews — every label carries its source.",
              },
            ]}
          />
        </div>
      </section>
    </PublicShell>
  );
}
