import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Organization = {
  id: string;
  name: string;
  legal_entity_name: string | null;
  owner_id: string | null;
  is_demo: boolean;
};

export function useOrganizations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["organizations", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, legal_entity_name, owner_id, is_demo")
        .order("is_demo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
  });
}

/** The ownership entity the landlord is currently working in: their own, else the shared demo portfolio. */
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

export function useProperties(orgId: string | null) {
  return useQuery({
    queryKey: ["properties", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*, units(*)")
        .eq("organization_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProperty(propertyId: string) {
  return useQuery({
    queryKey: ["property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*, units(*)")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTenancies(orgId: string | null) {
  return useQuery({
    queryKey: ["tenancies", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenancies")
        .select("*, units(name, monthly_rent), properties(name)")
        .eq("organization_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePayments(orgId: string | null) {
  return useQuery({
    queryKey: ["payments", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, tenancies(tenant_name, units(name), properties(name))")
        .eq("organization_id", orgId!)
        .order("due_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMaintenance(orgId: string | null) {
  return useQuery({
    queryKey: ["maintenance", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("*, units(name), properties(name), tenancies(tenant_name)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDocuments(orgId: string | null) {
  return useQuery({
    queryKey: ["documents", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, tenancies(tenant_name), properties(name)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLeases(orgId: string | null) {
  return useQuery({
    queryKey: ["leases", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leases")
        .select("*, tenancies(tenant_name), units(name)")
        .eq("organization_id", orgId!)
        .order("end_date");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvitations(orgId: string | null) {
  return useQuery({
    queryKey: ["invitations", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_invitations")
        .select("*, units(name), properties(name)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Invitations addressed to the signed-in user's email (tenant side). */
export function useMyInvitations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-invitations", user?.email],
    enabled: Boolean(user?.email),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_invitations")
        .select("*, units(name, monthly_rent), properties(name, street_address, city, state), organizations(name)")
        .eq("status", "pending")
        .eq("email", user!.email!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tenancies where the signed-in user is the tenant. */
export function useMyTenancies() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-tenancies", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenancies")
        .select(
          "*, units(name, bedrooms, bathrooms, monthly_rent, security_deposit, rent_due_day), properties(name, street_address, city, state, zip), organizations(name), leases(*), payments(*), maintenance_requests(*), verification_records(*)",
        )
        .eq("tenant_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useInvalidateRentId() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "organizations",
      "properties",
      "property",
      "tenancies",
      "payments",
      "maintenance",
      "documents",
      "leases",
      "invitations",
      "my-invitations",
      "my-tenancies",
      "profile",
      "roles",
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** Accept an invitation: links the signed-in tenant and marks the tenancy verified. */
export function useAcceptInvitation() {
  const invalidate = useInvalidateRentId();
  const acceptFn = useServerFn(acceptInvitation);

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await acceptFn({ data: { invitationId } });
      return result.tenancyId;
    },
    onSuccess: invalidate,
  });
}
