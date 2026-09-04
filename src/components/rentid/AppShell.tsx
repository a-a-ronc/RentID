import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ClipboardList,
  FileText,
  Home,
  LayoutGrid,
  LineChart,
  MessageSquare,
  Settings,
  Star,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Eyebrow } from "@/components/rentid/Surface";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Home };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/properties", label: "Properties", icon: Building2 },
  { to: "/tenants", label: "Tenants", icon: Users },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/applications", label: "Applications", icon: ClipboardList },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/reviews", label: "Reviews", icon: Star },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/reports", label: "Reports", icon: LineChart },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Tenants only see their own record and the shared surfaces — the portfolio
// management pages are landlord-scoped.
const TENANT_NAV: NavItem[] = [
  { to: "/tenant", label: "My home", icon: Home },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/reviews", label: "Reviews", icon: Star },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  subtitle = "Landlord",
}: {
  children: ReactNode;
  subtitle?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const profile = useProfile();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);

  const isTenant = subtitle === "Tenant";
  const nav = isTenant ? TENANT_NAV : NAV;
  const mobilePrimary = nav.slice(0, 4);
  const home = isTenant ? "/tenant" : "/dashboard";

  const name = profile.data?.full_name ?? user?.email ?? "";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -top-28 -left-24 size-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute top-1/3 -right-12 size-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 size-56 rounded-full bg-brand/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen lg:gap-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col px-4 py-6 lg:flex">
          <Link to={home} className="px-2">
            <div className="font-display text-[19px] font-bold tracking-tight">RentID</div>
            <Eyebrow className="mt-0.5">{subtitle}</Eyebrow>
          </Link>
          <nav className="mt-7 flex flex-1 flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                  isActive(item.to)
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={signOut}
            className="mt-4 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Sign out
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-10">
          {/* Top bar */}
          <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6">
            <div className="glass flex items-center justify-between rounded-2xl px-4 py-2.5">
              <div className="leading-none lg:hidden">
                <div className="font-display text-[17px] font-bold tracking-tight">RentID</div>
                <Eyebrow className="mt-0.5">{subtitle}</Eyebrow>
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate font-display text-[14px] font-semibold">{name}</p>
                <Eyebrow className="mt-0.5">{subtitle} workspace</Eyebrow>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="grid size-8 place-items-center rounded-full bg-brand font-display text-xs font-semibold text-brand-foreground">
                    {initials(name)}
                  </div>
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-background" />
                </div>
                <button
                  onClick={signOut}
                  className="hidden rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground lg:block"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pt-5 sm:px-6">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {MOBILE_PRIMARY.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2",
                isActive(item.to) ? "bg-brand/6 text-brand" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" strokeWidth={1.75} />
              <span className="font-display text-[10px] font-medium">{item.label}</span>
            </Link>
          ))}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger className="flex flex-col items-center gap-1 rounded-xl py-2 text-muted-foreground">
              <Home className="size-4" strokeWidth={1.75} />
              <span className="font-display text-[10px] font-medium">More</span>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-none bg-background px-5 pb-8">
              <SheetTitle className="font-display text-base">All sections</SheetTitle>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {NAV.slice(4).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className="glass flex items-center gap-2.5 rounded-2xl px-3 py-3 text-[13px] font-medium"
                  >
                    <item.icon className="size-4 text-accent" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                ))}
              </div>
              <button
                onClick={signOut}
                className="mt-4 w-full rounded-2xl bg-secondary px-3 py-3 text-[13px] font-medium text-muted-foreground"
              >
                Sign out
              </button>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}
