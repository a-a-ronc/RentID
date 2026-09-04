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
- [x] Responsive browser audit (desktop 1280px verified; mobile spot-check) + end-to-end milestone flow (landlord → invite → tenant accept)

## Audits (after milestone flow works)
- [ ] Schema + RLS audit (incl. 9 remaining SECURITY DEFINER linter warnings)
- [ ] Permissions audit
- [ ] Code organization pass
