# RentID Roadmap

## Milestone 1 — Core platform (complete against mock data layer)
- [x] Frosted Ledger → RentID coral/near-black design system (styles.css), logo + favicon
- [x] Domain types for every planned entity (src/lib/types.ts)
- [x] Mock data layer: localStorage DB + centralized seed (src/lib/mock/)
- [x] Service layer: auth, portfolio, tenancies, finance, operations (src/lib/services/)
- [x] React Query hook boundary (src/lib/rentid.ts) — components never touch a datasource
- [x] Design system kit: buttons, forms, tables, modals, badges, status pills, loading/error/empty states
- [x] Trust language: Verified Tenancy / Verified Payment / Platform Verified / Landlord & Tenant Reported / Under Dispute
- [x] Landlord: dashboard, properties, property detail, units, tenants, tenant detail, payments, maintenance, documents, leases, messages, reports, applications, reviews
- [x] Tenant: home, my tenancy, lease, payments, maintenance, messages, rental profile
- [x] Platform: landing, sign in/up with role selection, onboarding wizard, invitation acceptance, settings
- [x] Mobile navigation: landlord (Home/Properties/Payments/Messages/More), tenant (Home/Pay/Maintenance/Messages/Profile)
- [x] Proposed SQL schema (supabase/planned/0001_schema.sql) — review only, not applied
- [x] Proposed RLS policies (supabase/planned/0002_rls.sql) — review only, not applied
- [x] Backend integration checklist (docs/SUPABASE_INTEGRATION.md)
- [x] Typecheck clean

## Milestone 2 — Rental identity network (business map, mock data)
- [x] Public marketing routes per role: /for-tenants, /for-landlords, /for-property-managers
- [x] Public rental marketplace: /rent search + /rent/$listingId detail with consented profile sharing
- [x] Public provider profiles: /providers/$orgId with sourced trust signals and verified-tenancy reviews
- [x] Property-manager product: /manager overview, /manager/portfolio, /manager/owners
- [x] Owner accounts + owner-granted management authority, separate from ownership
- [x] Landlord/PM leasing desk: /listings with syndication state and application review
- [x] Manager demo sign-in and role-aware routing + mobile navigation
- [x] Planned SQL + RLS for organizations.kind/verification, owner_accounts,
      management_assignments, listings, rental_applications (review only)

## Milestone 3 — Student housing category (business map §25-§38, mock data)
- [x] `management_category` on properties: student housing is a configuration on the
      same identity/property/lease/payment graph, not a separate product
- [x] Bed/room inventory, academic terms, occupancies, roommate groups, guarantors
- [x] Money separated into charge/obligation, payer/funding source and payment record;
      external payments are recorded and reconciled, never presented as RentID-processed
- [x] Append-only ledger for every charge, payment, allocation and reminder
- [x] Approval-first lease changes: sublease, assignment, replacement, transfers,
      renewal, early termination, guarantor change — with PM/owner approval steps,
      documents, signatures, fees and effective dates
- [x] Replacement listings stay private until a request is explicitly allowed
- [x] Manager surfaces: /manager/student, /manager/student/units/$unitId,
      /manager/student/changes, /manager/student/preleasing, /manager/student/turnover
- [x] Resident surface: /tenant/housing — own bed, roommates by name only, own charges,
      payers/guarantor, requests, unit maintenance and own payment history
- [x] Turnover readiness with blockers, and maintenance/damage allocation with
      evidence and lease basis before it affects verified history
- [x] Student demo sign-in (student@rentid.demo)
- [x] Planned SQL + RLS for the full student layer (review only, not applied)

## Next — when the backend is reachable
- [ ] Apply schema migration, then RLS migration
- [ ] Enable email/password + Google auth; move invitation acceptance to a server function
- [ ] Create the private documents bucket and switch lease/document upload to real storage
- [ ] Replace each service body with real queries (signatures stay identical)
- [ ] Delete src/lib/mock/ and demo notices
- [ ] Landlord / tenant / property-manager access tests + database linter audit

## Deliberately not started
Stripe and live payments, autopay, credit screening, background checks,
reputation scoring, AI tenant scores, native apps, QuickBooks,
partner listing syndication feeds, marketplace lease fees.
