import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  AppShell,
  Button,
  DemoNotice,
  Field,
  FormGrid,
  Glass,
  ListRow,
  PageHeader,
  SectionCard,
  StatusPill,
  TextInput,
} from "@/components/rentid/patterns";
import { useAuth, usePrimaryRole, useProfile, useSignOut, useUpdateProfile } from "@/lib/auth";
import { useActiveOrg, useInvalidateRentId, useUpdateOrganization } from "@/lib/rentid";
import { resetDemoData } from "@/lib/services";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useProfile();
  const role = usePrimaryRole();
  const active = useActiveOrg();
  const updateProfile = useUpdateProfile();
  const updateOrg = useUpdateOrganization();
  const signOut = useSignOut();
  const invalidate = useInvalidateRentId();

  const isTenant = role === "tenant";

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await updateProfile.mutateAsync({
        full_name: String(form.get("fullName") ?? "") || null,
        phone: String(form.get("phone") ?? "") || null,
      });
      toast.success("Profile saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile could not be saved.");
    }
  }

  async function saveOrg(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active.orgId) return;
    const form = new FormData(event.currentTarget);
    try {
      await updateOrg.mutateAsync({
        orgId: active.orgId,
        name: String(form.get("name") ?? ""),
        legal_entity_name: String(form.get("legalEntityName") ?? "") || null,
      });
      toast.success("Workspace saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workspace could not be saved.");
    }
  }

  return (
    <AppShell subtitle={isTenant ? "Tenant" : active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader title="Settings" subtitle={user?.email ?? undefined} />

      <div className="mt-5 space-y-4">
        <SectionCard title="Your profile">
          <form onSubmit={saveProfile} className="space-y-3 px-4 py-4">
            <FormGrid>
              <Field label="Full name" htmlFor="fullName">
                <TextInput id="fullName" name="fullName" defaultValue={profile.data?.full_name ?? ""} />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <TextInput id="phone" name="phone" defaultValue={profile.data?.phone ?? ""} />
              </Field>
            </FormGrid>
            <Field label="Email" htmlFor="email" hint="Email changes need the live auth service.">
              <TextInput id="email" value={user?.email ?? ""} readOnly disabled />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={updateProfile.isPending}>
                Save profile
              </Button>
            </div>
          </form>
        </SectionCard>

        {!isTenant && active.org ? (
          <SectionCard title="Workspace" aside={active.isDemo ? "Demo portfolio" : undefined}>
            <form onSubmit={saveOrg} className="space-y-3 px-4 py-4">
              <FormGrid>
                <Field label="Workspace name" htmlFor="name">
                  <TextInput id="name" name="name" defaultValue={active.org.name} required />
                </Field>
                <Field label="Legal entity" htmlFor="legalEntityName">
                  <TextInput
                    id="legalEntityName"
                    name="legalEntityName"
                    defaultValue={active.org.legal_entity_name ?? ""}
                  />
                </Field>
              </FormGrid>
              <div className="flex justify-end">
                <Button type="submit" loading={updateOrg.isPending}>
                  Save workspace
                </Button>
              </div>
            </form>
          </SectionCard>
        ) : null}

        <SectionCard title="Account">
          <ListRow
            title="Role"
            subtitle="Roles are stored separately from your profile and cannot be self-assigned."
            pill={<StatusPill status={(role ?? "unknown").replace("_", " ")} tone="accent" />}
          />
          <ListRow
            title="Sign out"
            subtitle="Ends this session on this device."
            value={
              <Button
                tone="secondary"
                size="sm"
                onClick={async () => {
                  await signOut();
                  await navigate({ to: "/auth", replace: true });
                }}
              >
                Sign out
              </Button>
            }
          />
        </SectionCard>

        <Glass className="p-5">
          <p className="font-display text-[14px] font-semibold">Preview data</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Reset the demo portfolio back to its seeded state — properties, tenancies, payments and documents.
          </p>
          <Button
            tone="danger"
            size="sm"
            className="mt-3"
            onClick={() => {
              resetDemoData();
              invalidate();
              toast.success("Demo data reset.");
            }}
          >
            Reset demo data
          </Button>
        </Glass>

        <DemoNotice>
          When the backend reconnects: authentication, storage and row-level security take over these screens without
          UI changes — see the integration checklist in the repository.
        </DemoNotice>
      </div>
    </AppShell>
  );
}
