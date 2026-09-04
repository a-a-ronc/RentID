# RentID Roadmap

## Milestone 1 — Core platform (in progress)
- [x] Lovable Cloud schema, RLS, storage bucket, demo seed
- [x] Frosted Ledger design system (styles.css), format helpers
- [x] Auth provider + data access layer (src/lib/auth.tsx, src/lib/rentid.ts)
- [x] App shell (desktop sidebar, mobile bottom nav)
- [ ] Root layout fonts/providers + landing page (/)
- [ ] Auth page (/auth): email/password + Google, role routing
- [ ] Onboarding (/onboarding)
- [ ] Landlord dashboard (/dashboard) with demo metrics
- [ ] Properties (/properties, /properties/$propertyId) + create property/unit + invite tenant
- [ ] Tenants (/tenants, /tenants/$tenancyId) + verify + lease upload
- [ ] Payments (/payments)
- [ ] Maintenance (/maintenance)
- [ ] Tenant dashboard (/tenant) + accept invitation + lease view
- [ ] Placeholder sections (applications, messages, reviews, documents, reports, settings)
- [ ] Typecheck + build verification, responsive browser audit
- ETA: pages land over the next several minutes; full milestone verification (typecheck + browser flow) right after.

## Audits (after milestone flow works)
- [ ] Schema + RLS audit (incl. 9 remaining SECURITY DEFINER linter warnings)
- [ ] Permissions audit
- [ ] Code organization pass
