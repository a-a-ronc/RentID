import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/rentid/patterns";
import { ComingSoon } from "@/components/rentid/Surface";
import { useActiveOrg } from "@/lib/rentid";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages — RentID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const active = useActiveOrg();
  return (
    <AppShell subtitle={active.isDemo ? "Demo portfolio" : "Landlord"}>
      <PageHeader title="Messages" subtitle={active.org?.name} />
      <div className="mt-5">
        <ComingSoon
          title="Tenant messaging"
          description="Direct, tenancy-linked conversations with your tenants — kept with the lease, not lost in email."
          points={[
            "One thread per tenancy",
            "Maintenance updates in context",
            "Read receipts and history on the record",
          ]}
        />
      </div>
    </AppShell>
  );
}
