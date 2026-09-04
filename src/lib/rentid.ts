/**
 * React Query hooks over the RentID service layer.
 *
 * Components never talk to a datasource directly — they use these hooks, so
 * replacing the mock services with Supabase queries requires no UI changes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import * as svc from "@/lib/services";
import type {
  DocumentKind,
  MaintenanceRequest,
  MaintenanceStatus,
  Organization,
  PropertyType,
  UUID,
} from "@/lib/types";

export type { Organization };

const KEYS = [
  "organizations",
  "properties",
  "property",
  "units",
  "tenancies",
  "tenancy",
  "my-tenancies",
  "payments",
  "metrics",
  "maintenance",
  "documents",
  "leases",
  "lease",
  "invitations",
  "my-invitations",
  "conversations",
  "notifications",
  "reviews",
  "profile",
  "roles",
  "audit",
];

export function useInvalidateRentId() {
  const qc = useQueryClient();
  return () => {
    for (const key of KEYS) void qc.invalidateQueries({ queryKey: [key] });
  };
}

/* ------------------------------ organizations ----------------------------- */

export function useOrganizations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organizations", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => svc.getOrganizations(user!.id),
  });
}

/** The workspace the landlord is acting in: their own, otherwise the demo portfolio. */
export function useActiveOrg() {
  const { user } = useAuth();
  const orgs = useOrganizations();
  const own = orgs.data?.find((o) => !o.is_demo);
  const demo = orgs.data?.find((o) => o.is_demo);
  const active = own ?? demo ?? null;
  return {
    ...orgs,
    org: active,
    orgId: active?.id ?? null,
    isDemo: Boolean(active?.is_demo),
    hasOwnOrg: Boolean(own),
    userId: user?.id ?? null,
  };
}

export function useCreateOrganization() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: { name: string; legalEntityName?: string | null }) =>
      svc.createOrganization({ ...input, ownerId: user!.id }),
    onSuccess: invalidate,
  });
}

export function useUpdateOrganization() {
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: ({ orgId, ...patch }: { orgId: UUID; name?: string; legal_entity_name?: string | null }) =>
      svc.updateOrganization(orgId, patch),
    onSuccess: invalidate,
  });
}

/* -------------------------------- portfolio ------------------------------- */

export function useProperties(orgId: UUID | null) {
  return useQuery({
    queryKey: ["properties", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getProperties(orgId),
  });
}

export function useProperty(propertyId: UUID) {
  return useQuery({
    queryKey: ["property", propertyId],
    queryFn: () => svc.getProperty(propertyId),
  });
}

export function useCreateProperty() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: {
      organizationId: UUID;
      name: string;
      propertyType: PropertyType;
      streetAddress: string;
      city: string;
      state: string;
      zip: string;
      yearBuilt?: number | null;
      notes?: string | null;
    }) => svc.createProperty({ ...input, actorId: user?.id ?? null }),
    onSuccess: invalidate,
  });
}

export function useUnits(propertyId?: UUID | null, orgId?: UUID | null) {
  return useQuery({
    queryKey: ["units", propertyId ?? null, orgId ?? null],
    queryFn: () => svc.getUnits(propertyId ?? null, orgId ?? null),
  });
}

export function useCreateUnit() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: {
      organizationId: UUID;
      propertyId: UUID;
      name: string;
      bedrooms?: number | null;
      bathrooms?: number | null;
      squareFeet?: number | null;
      monthlyRent?: number | null;
      securityDeposit?: number | null;
      rentDueDay?: number;
    }) => svc.createUnit({ ...input, actorId: user?.id ?? null }),
    onSuccess: invalidate,
  });
}

export function useUpdateUnit() {
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: ({ unitId, patch }: { unitId: UUID; patch: Parameters<typeof svc.updateUnit>[1] }) =>
      svc.updateUnit(unitId, patch),
    onSuccess: invalidate,
  });
}

/* -------------------------------- tenancies ------------------------------- */

export function useTenancies(orgId: UUID | null) {
  return useQuery({
    queryKey: ["tenancies", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getTenancies(orgId),
  });
}

export function useTenancy(tenancyId: UUID) {
  return useQuery({
    queryKey: ["tenancy", tenancyId],
    queryFn: () => svc.getTenant(tenancyId),
  });
}

export function useMyTenancies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-tenancies", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => svc.getMyTenancies(user?.id ?? null),
  });
}

export function useInviteTenant() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: {
      organizationId: UUID;
      propertyId: UUID;
      unitId: UUID;
      email: string;
      name: string;
      monthlyRent?: number | null;
      securityDeposit?: number | null;
      startDate?: string | null;
      endDate?: string | null;
    }) => svc.inviteTenant({ ...input, actorId: user?.id ?? null }),
    onSuccess: invalidate,
  });
}

export function useVerifyTenancy() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (tenancyId: UUID) => svc.verifyTenancy(tenancyId, user?.id ?? null),
    onSuccess: invalidate,
  });
}

export function useEndTenancy() {
  const invalidate = useInvalidateRentId();
  return useMutation({ mutationFn: (tenancyId: UUID) => svc.endTenancy(tenancyId), onSuccess: invalidate });
}

export function useInvitations(orgId: UUID | null) {
  return useQuery({
    queryKey: ["invitations", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getInvitations(orgId),
  });
}

export function useMyInvitations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-invitations", user?.email],
    enabled: Boolean(user?.email),
    queryFn: () => svc.getMyInvitations(user?.email ?? null),
  });
}

export function useAcceptInvitation() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (invitationId: UUID) =>
      svc.acceptInvitation({ invitationId, userId: user!.id }).then((r) => r.tenancyId),
    onSuccess: invalidate,
  });
}

export function useRevokeInvitation() {
  const invalidate = useInvalidateRentId();
  return useMutation({ mutationFn: (id: UUID) => svc.revokeInvitation(id), onSuccess: invalidate });
}

/* --------------------------------- finance -------------------------------- */

export function usePayments(orgId: UUID | null) {
  return useQuery({
    queryKey: ["payments", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getPayments(orgId),
  });
}

export function useDashboardMetrics(orgId: UUID | null) {
  return useQuery({
    queryKey: ["metrics", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getDashboardMetrics(orgId),
  });
}

export function useMarkPaymentPaid() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (paymentId: UUID) => svc.markPaymentPaid(paymentId, user?.id ?? null),
    onSuccess: invalidate,
  });
}

/* ------------------------------- operations ------------------------------- */

export function useLeases(orgId: UUID | null) {
  return useQuery({
    queryKey: ["leases", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getLeases(orgId),
  });
}

export function useLease(leaseId: UUID) {
  return useQuery({ queryKey: ["lease", leaseId], queryFn: () => svc.getLease(leaseId) });
}

export function useUploadLease() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof svc.uploadLease>[0], "actorId">) =>
      svc.uploadLease({ ...input, actorId: user?.id ?? null }),
    onSuccess: invalidate,
  });
}

export function useDocuments(orgId: UUID | null) {
  return useQuery({
    queryKey: ["documents", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getDocuments(orgId),
  });
}

export function useUploadDocument() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: {
      organizationId: UUID;
      propertyId?: UUID | null;
      unitId?: UUID | null;
      tenancyId?: UUID | null;
      kind: DocumentKind;
      title: string;
      fileName?: string | null;
      fileSize?: number | null;
      mimeType?: string | null;
      visibleToTenant?: boolean;
    }) => svc.uploadDocument({ ...input, actorId: user?.id ?? null }),
    onSuccess: invalidate,
  });
}

export function useMaintenance(orgId: UUID | null) {
  return useQuery({
    queryKey: ["maintenance", orgId],
    enabled: Boolean(orgId),
    queryFn: () => svc.getMaintenanceRequests(orgId),
  });
}

export function useCreateMaintenance() {
  const { user } = useAuth();
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: {
      organizationId: UUID;
      propertyId: UUID;
      unitId: UUID;
      tenancyId?: UUID | null;
      title: string;
      description?: string | null;
      priority?: MaintenanceRequest["priority"];
    }) => svc.createMaintenanceRequest({ ...input, actorId: user?.id ?? null }),
    onSuccess: invalidate,
  });
}

export function useUpdateMaintenanceStatus() {
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: ({ id, status }: { id: UUID; status: MaintenanceStatus }) =>
      svc.updateMaintenanceStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useConversations(input: {
  orgId?: UUID | null;
  tenancyIds?: UUID[];
  viewerRole: "landlord" | "tenant";
}) {
  return useQuery({
    queryKey: ["conversations", input.viewerRole, input.orgId ?? null, input.tenancyIds ?? []],
    queryFn: () => svc.getConversations(input),
  });
}

export function useSendMessage() {
  const invalidate = useInvalidateRentId();
  return useMutation({
    mutationFn: (input: Parameters<typeof svc.sendMessage>[0]) => svc.sendMessage(input),
    onSuccess: invalidate,
  });
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => svc.getNotifications(user?.id ?? null),
  });
}

export function useReviews(tenancyIds: UUID[]) {
  return useQuery({
    queryKey: ["reviews", tenancyIds],
    queryFn: () => svc.getReviews(tenancyIds),
  });
}

export { tenancyVerification } from "@/lib/services/tenancies";
