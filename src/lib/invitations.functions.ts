import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Accept a tenant invitation.
 *
 * Runs server-side with privileged access because the tenancy row is not yet
 * linked to the accepting user (tenant_user_id is null), so RLS cannot let the
 * tenant claim it from the browser. The handler verifies the invitation is
 * pending, unexpired, and addressed to the signed-in user's email before
 * writing anything.
 */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ invitationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const email = (context.claims['email'] as string | undefined)?.toLowerCase();
    if (!email) throw new Error("Your account has no email address.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("tenant_invitations")
      .select("*")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) throw new Error("This invitation is no longer available.");
    if (invite.status !== "pending") throw new Error("This invitation has already been used.");
    if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error("This invitation has expired.");
    if ((invite.email ?? "").toLowerCase() !== email) {
      throw new Error("This invitation was sent to a different email address.");
    }

    const now = new Date().toISOString();
    let tenancyId = invite.tenancy_id;

    if (tenancyId) {
      const { error } = await supabaseAdmin
        .from("tenancies")
        .update({
          tenant_user_id: context.userId,
          status: "active",
          verified: true,
          verified_at: now,
        })
        .eq("id", tenancyId);
      if (error) throw error;
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("tenancies")
        .insert({
          organization_id: invite.organization_id,
          property_id: invite.property_id!,
          unit_id: invite.unit_id!,
          tenant_user_id: context.userId,
          tenant_name: invite.full_name,
          tenant_email: invite.email,
          tenant_phone: invite.phone,
          status: "active",
          monthly_rent: invite.monthly_rent,
          start_date: invite.lease_start,
          end_date: invite.lease_end,
          verified: true,
          verified_at: now,
        })
        .select("id")
        .single();
      if (error) throw error;
      tenancyId = created.id;
    }

    const { error: inviteUpdate } = await supabaseAdmin
      .from("tenant_invitations")
      .update({
        status: "accepted",
        accepted_by: context.userId,
        accepted_at: now,
        tenancy_id: tenancyId,
      })
      .eq("id", data.invitationId);
    if (inviteUpdate) throw inviteUpdate;

    // Idempotent: the tenant role and the verification record may already exist.
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "tenant" }, { onConflict: "user_id,role", ignoreDuplicates: true });

    const { data: existingRecord } = await supabaseAdmin
      .from("verification_records")
      .select("id")
      .eq("tenancy_id", tenancyId!)
      .eq("record_type", "tenancy")
      .maybeSingle();

    if (!existingRecord) {
      await supabaseAdmin.from("verification_records").insert({
        tenancy_id: tenancyId!,
        subject_user_id: context.userId,
        record_type: "tenancy",
        label: "Verified Tenancy — Confirmed by landlord invitation",
      });
    }

    return { tenancyId };
  });
