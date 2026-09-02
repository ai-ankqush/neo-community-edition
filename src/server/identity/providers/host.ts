import "server-only";
import { requireSession } from "@/lib/rbac";
import { linkTenant } from "../tenant-map";
import type { Principal } from "../types";

/**
 * Host-session identity adapter — the ONLY Clerk touchpoint in Gravity's identity path.
 *
 * The Neo platform hosts the browser session (Clerk today). This adapter turns that host session into a
 * neutral Principal and records the host<->neutral tenant binding, so the rest of Gravity never imports an
 * identity vendor. Swapping the host IdP later means replacing THIS file only.
 */
export async function resolveFromHostSession(): Promise<Principal> {
  const s = await requireSession(); // Clerk lives behind requireSession; contained here.
  await linkTenant("clerk", s.orgId, s.internalOrgId);
  return {
    tenantId: s.internalOrgId,
    subjectId: s.userId,
    roles: [s.role],
    idp: "clerk",
    via: "session",
  };
}
