import type { AppRole } from "@/lib/types";

/** Where a signed-in user lands, by role. Landlord wins when someone has several. */
export function homePathFor(roles: AppRole[]): string {
  if (roles.includes("landlord")) return "/dashboard";
  if (roles.includes("admin")) return "/admin/prospects";
  if (roles.includes("property_manager")) return "/manager";
  if (roles.includes("tenant")) return "/tenant";
  return "/dashboard";
}

/**
 * Only same-site paths are honoured as a post-sign-in destination, so a crafted
 * `?next=https://evil.example` link can't bounce someone off-site after login.
 */
export function safeNextPath(next: unknown, origin?: string): string | null {
  if (typeof next !== "string" || !next) return null;
  let path = next;
  if (origin && path.startsWith(origin)) path = path.slice(origin.length) || "/";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (
    path.startsWith("/auth") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password")
  )
    return null;
  return path;
}
