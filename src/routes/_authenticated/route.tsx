import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getSession } from "@/lib/services/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    // Local session gate only — real auth arrives with the Supabase connection,
    // and every protected read will then be enforced by RLS on the server.
    const session = getSession();
    if (!session) throw redirect({ to: "/auth" });
    return { user: session.user, roles: session.roles };
  },
  component: () => <Outlet />,
});
