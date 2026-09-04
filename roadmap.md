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

## Next — when the backend is reachable
- [ ] Apply schema migration, then RLS migration
- [ ] Enable email/password + Google auth; move invitation acceptance to a server function
- [ ] Create the private documents bucket and switch lease/document upload to real storage
- [ ] Replace each service body with real queries (signatures stay identical)
- [ ] Delete src/lib/mock/ and demo notices
- [ ] Landlord / tenant / property-manager access tests + database linter audit

## Deliberately not started
Stripe and live payments, autopay, credit screening, background checks,
reputation scoring, AI tenant scores, native apps, marketplace listings,
QuickBooks.
