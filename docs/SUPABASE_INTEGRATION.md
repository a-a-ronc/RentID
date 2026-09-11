# RentID — backend integration checklist

The app currently runs entirely on a local mock data layer so no alternative
backend is introduced while the database is unavailable. Nothing in the UI talks
to a datasource directly, so connecting the real backend is a swap of service
bodies, not a rewrite.

## Architecture today

```text
routes / components
        │  (only hooks)
src/lib/rentid.ts          React Query hooks
        │
src/lib/services/*         auth · portfolio · tenancies · finance · operations
        │
src/lib/mock/db.ts         in-memory DB persisted to localStorage
src/lib/mock/seed.ts       centralized demo portfolio + demo credentials
```

- `src/lib/types.ts` holds the entity models (UUID ids, ISO timestamps) that
  mirror the planned SQL tables exactly.
- `src/lib/auth.tsx` exposes `useAuth` / `useProfile` / `useRoles` with the same
  shape a real session provider gives, so only this file and
  `src/lib/services/auth.ts` change when live auth returns.
- `supabase/planned/0001_schema.sql` — proposed schema (not applied).
- `supabase/planned/0002_rls.sql` — proposed RLS policies (not applied).

## Checklist — run in this order

1. **Connect the project.** Confirm the environment provides the project URL and
   publishable key; do not hand-edit generated integration files.
2. **Review and apply migrations.** Apply `supabase/planned/0001_schema.sql` as
   the first migration. Every `CREATE TABLE` in `public` already has its
   `GRANT` block; keep them in the same migration.
3. **Apply RLS.** Apply `supabase/planned/0002_rls.sql`. Verify each table
   reports RLS enabled and that no policy grants `anon` access to tenancy data.
4. **Enable authentication.** Email + password first, Google after. Do not
   enable anonymous sign-ups or email auto-confirm.
5. **Create storage.** Private `documents` bucket, paths
   `<organization_id>/<tenancy_id>/<file>`; the storage policies live in the RLS
   file.
6. **Replace the service bodies.** One file at a time, keeping signatures
   identical:
   - `services/auth.ts` → real session, profile row, `user_roles` read
   - `services/portfolio.ts` → organizations, properties, units
   - `services/tenancies.ts` → tenancies, invitations, verification
   - `services/finance.ts` → payments, dashboard metrics
   - `services/operations.ts` → leases, documents, maintenance, messaging
   Invitation acceptance must move to a server function (it writes a tenancy the
   caller does not yet own, which client RLS correctly refuses).
7. **Delete the mock layer.** Remove `src/lib/mock/` and the demo-notice copy
   once every service is live.
8. **Test landlord access:** sign up, onboard, create property, add unit.
9. **Test tenancy creation:** invite a tenant, accept from a second account,
   confirm the tenancy is active and verified and the unit shows occupied.
10. **Test lease upload:** upload a lease, confirm it associates with unit and
    tenant and appears on both the landlord and tenant screens.
11. **Test tenant access:** confirm a tenant sees only their own tenancy,
    lease, documents, payments and messages, and cannot read another tenancy.
12. **Test property-manager access:** a member of one organization must see
    nothing from another.
13. **Audit:** run the database linter, review every policy, and confirm admin
    actions write `audit_logs` rows.

## Explicitly out of scope for this milestone

Stripe / live payments / autopay, credit screening, background checks,
reputation scoring, AI tenant scores, native apps, marketplace listings,
QuickBooks.

## Student-housing layer (business map §25-§38)

The student vertical is a *category*, not a second product: `properties.management_category`
switches it on, and everything else hangs off the same identity/property/lease/payment graph.

When the backend is reachable:

1. Apply `supabase/planned/0001_schema.sql` (includes the student tables at the end)
   and then `0002_rls.sql` (includes `can_operate_property`, `is_my_occupancy` and the
   student policies).
2. Replace the bodies in `src/lib/services/student.ts` with queries. Signatures stay the
   same, so no screen changes.
3. Non-negotiables to preserve server-side:
   - `ledger_events`, `approval_steps` and `payment_allocations` are insert-only.
   - `charges` (obligation) stay separate from `payers` (funding source); paying never
     makes someone a lease party.
   - `student_payments.processed_by_rentid = false` is a *recorded* external payment and
     must never be shown as processed by RentID.
   - A lease change only becomes effective when approvals, documents, signatures and money
     are all complete; `replacement_listing_enabled` gates any public replacement listing.
   - A roommate must never read another roommate's charges, payments or ledger events.
4. Verify with the student demo account (`student@rentid.demo`) that `/tenant/housing`
   shows only that resident's money.

## Listing syndication when partner access is approved
1. Apply the listing/channel/lead/sync tables from `supabase/planned/0001_schema.sql`
   and the policies from `0002_rls.sql`.
2. Store partner credentials as project secrets (never in code): one secret per
   marketplace, plus a feed URL where the partner uses feed ingestion.
3. Implement the partner adapter in `src/lib/syndication/adapters.ts` — replace the
   pending stub's `pending_integration` result with real API/feed calls made from a
   server function only. Only official APIs and approved feeds; no scraping and no
   unofficial posting.
4. Flip the channel's `connection_status` to `connected` once credentials verify;
   existing published listings then resync through the same code path.
5. Lead capture on public pages moves to a server function using the service role
   (no anon insert policy on `listing_leads`).
