# RentID Roadmap

## Milestone 1 — Core platform (in progress)
- [x] Lovable Cloud schema, RLS, storage bucket, demo seed
- [x] Frosted Ledger design system (styles.css), format helpers
- [x] Auth provider + data access layer (src/lib/auth.tsx, src/lib/rentid.ts)
- [x] App shell (desktop sidebar, mobile bottom nav)
- [x] Root layout fonts/providers + landing page (/)
- [x] Auth page (/auth): email/password + Google, role routing
- [x] Onboarding (/onboarding)
- [x] Landlord dashboard (/dashboard) with demo metrics
- [x] Properties (/properties, /properties/$propertyId) + create property/unit + invite tenant
- [x] Tenants (/tenants, /tenants/$tenancyId) + verify + lease upload
- [x] Payments (/payments)
- [x] Maintenance (/maintenance)
- [x] Documents (/documents) with upload + tenant-visible docs
- [x] Settings (/settings): profile + workspace name, sign out
- [x] Tenant dashboard (/tenant) + accept invitation + lease view
- [x] Placeholder sections (applications, messages, reviews, reports)
- [x] Typecheck passing; build OK
- [x] Role-aware navigation (tenants no longer see landlord-only sections)
- [x] Responsive browser audit (desktop 1280px + mobile 390px, no overflow, no console errors)
- [x] End-to-end milestone flow (landlord → property/unit → invite → tenant signup → accept → verified tenancy + lease)

## Audits (after milestone flow works)
- [ ] Schema + RLS audit (incl. 9 remaining SECURITY DEFINER linter warnings)
- [ ] Permissions audit
- [ ] Code organization pass
