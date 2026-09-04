import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Building2, ShieldCheck, Wallet } from "lucide-react";

import { Eyebrow } from "@/components/rentid/Surface";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RentID — Rent, leases and rental reputation" },
      {
        name: "description",
        content:
          "RentID gives landlords and tenants verified rental identities, leases, payments and reputation in one trusted place.",
      },
      { property: "og:title", content: "RentID — Rent, leases and rental reputation" },
      {
        property: "og:description",
        content:
          "Verified rental identities, leases, payments and reputation — for landlords and tenants.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: BadgeCheck,
    title: "Verified tenancies",
    body: "Both sides confirm the lease before it counts. Reputation is built only on verified rentals.",
  },
  {
    icon: Building2,
    title: "Portfolio clarity",
    body: "Properties, units, leases and documents in one ledger — every unit has a status and a number.",
  },
  {
    icon: Wallet,
    title: "Rent that reconciles",
    body: "Collected, outstanding and upcoming rent tracked per unit, per month, per lease term.",
  },
  {
    icon: ShieldCheck,
    title: "Two-way reputation",
    body: "Tenants review landlords. Landlords review tenants. Both reviews only exist after verified tenancies.",
  },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute top-1/2 -left-24 size-72 rounded-full bg-brand/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <RentIDLogo markClassName="size-8" wordmarkClassName="text-[20px]" />
          <Link
            to="/auth"
            className="glass rounded-full px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </header>

        <main className="flex-1">
          <section className="pt-10 pb-14 sm:pt-20">
            <Eyebrow>Rental trust, built in</Eyebrow>
            <h1 className="mt-3 max-w-2xl font-display text-[40px] leading-[1.05] font-bold tracking-tight sm:text-6xl">
              Every renter deserves a <span className="text-accent">verified</span> record.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              RentID is the trust layer for long-term renting. Verified tenancies, leases and
              payment history — shared between landlords and tenants, not locked in anyone's inbox.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
              >
                Create your RentID
                <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/auth"
                className="glass rounded-full px-6 py-3 text-[14px] font-medium transition-opacity hover:opacity-90"
              >
                I'm a tenant
              </Link>
            </div>

            <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {[
                ["Verified", "tenancies only"],
                ["Two-way", "reviews"],
                ["Rent", "reconciled"],
                ["Leases", "on file"],
              ].map(([big, small], i) => (
                <div key={small} className="glass rounded-2xl p-4" style={{ animationDelay: `${i * 70}ms` }}>
                  <p className="font-display text-[17px] font-semibold">{big}</p>
                  <Eyebrow className="mt-1">{small}</Eyebrow>
                </div>
              ))}
            </div>
          </section>

          <section className="pb-20">
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {FEATURES.map((f, i) => (
                <div key={f.title} className="glass rounded-2xl p-5" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="grid size-9 place-items-center rounded-xl bg-accent/12">
                    <f.icon className="size-4 text-accent" strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-3.5 font-display text-[15px] font-semibold tracking-tight">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </section>
        </main>

        <footer className="border-t border-border/60 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="label-eyebrow">© 2026 RentID</p>
            <p className="text-[11px] text-muted-foreground">
              Payments and credit reporting coming soon.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
