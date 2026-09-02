import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { IdentityError } from "./types";

/**
 * Resolve any IdP's tenant handle down to the neutral internal org uuid via gravity_tenant_identities.
 * The mapping is the ONLY place a provider-specific tenant handle touches Gravity — everything downstream
 * is the neutral uuid.
 */
export async function resolveTenantByBinding(idp: string, externalTenantId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("gravity_tenant_identities")
    .select("org_id")
    .eq("idp", idp)
    .eq("external_tenant_id", externalTenantId)
    .maybeSingle();
  return data?.org_id ?? null;
}

/** Bind an IdP tenant handle to a known neutral org (idempotent). Used by the host adapter on first touch. */
export async function linkTenant(idp: string, externalTenantId: string, orgId: string): Promise<void> {
  await supabaseAdmin()
    .from("gravity_tenant_identities")
    .upsert({ idp, external_tenant_id: externalTenantId, org_id: orgId }, { onConflict: "idp,external_tenant_id" });
}

export async function requireTenant(idp: string, externalTenantId: string): Promise<string> {
  const orgId = await resolveTenantByBinding(idp, externalTenantId);
  if (!orgId) throw new IdentityError(403, `No Gravity tenant is bound to ${idp} tenant "${externalTenantId}".`);
  return orgId;
}
