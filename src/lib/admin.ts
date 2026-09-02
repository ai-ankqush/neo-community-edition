import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Super-admin (platform owner) access. Completely separate from org RBAC:
 * membership is an allowlist of Clerk user IDs in SUPER_ADMIN_USER_IDS
 * (comma-separated). A super-admin can view platform-wide operational
 * metadata — never tenant assessment content.
 */
export function superAdminIds(): string[] {
  return (process.env.SUPER_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isSuperAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return superAdminIds().includes(userId);
}

/**
 * Partner-admin (white-label operator) access.
 * Allowlist of Clerk user IDs in PARTNER_ADMIN_USER_IDS, set only on a partner
 * deployment. A partner-admin gets a REDUCED /admin: the org roster (users,
 * tiers, SSO) and entitlements — never the owner-only tooling (FinOps, Red Team
 * Frontier, Feedback, PAL, Partners control plane, Ask Neo web) or Neo-program
 * panels (Founding). Super-admins are unaffected and see everything.
 */
export function partnerAdminIds(): string[] {
  return (process.env.PARTNER_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPartnerAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return partnerAdminIds().includes(userId);
}

/** Anyone allowed into /admin at all (owner or partner operator). */
export function canAccessAdmin(userId: string | null | undefined): boolean {
  return isSuperAdmin(userId) || isPartnerAdmin(userId);
}

/**
 * True when this deployment is a white-label PARTNER instance rather
 * than Neo's own. On a partner deployment the /admin surface is ALWAYS the reduced operator view —
 * Neo's owner-only tooling (FinOps, Red Team Frontier, PAL, Feedback, Partners control plane, Ask
 * Neo web, Billing) must never appear, even to a super-admin. Signalled by PARTNER_KEY being set, or
 * a non-Neo brand name.
 */
export function isPartnerDeployment(): boolean {
  if (process.env.PARTNER_KEY) return true;
  const brand = process.env.NEXT_PUBLIC_BRAND_NAME?.trim();
  return Boolean(brand && brand.toLowerCase() !== "neo");
}

/** Owner-only admin surfaces (Neo's own tooling) — super-admin AND not on a partner deployment. */
export function canAccessOwnerAdmin(userId: string | null | undefined): boolean {
  return isSuperAdmin(userId) && !isPartnerDeployment();
}

/** Coarse role for gating UI/pages. Super wins if a user is in both lists. */
export function adminRole(userId: string | null | undefined): "super" | "partner" | null {
  if (isSuperAdmin(userId)) return "super";
  if (isPartnerAdmin(userId)) return "partner";
  return null;
}

/** Append-only log of super-admin access (cross-org, see migration 0007). */
export async function logAdminAccess(actor: string, action: string, detail?: unknown): Promise<void> {
  try {
    await supabaseAdmin().from("admin_access_log").insert({ actor, action, detail: detail ?? null });
  } catch (err) {
    console.error("ADMIN ACCESS LOG FAILED", err);
  }
}
