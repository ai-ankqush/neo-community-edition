import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { ApiError } from "@/lib/rbac";
import { planFor } from "@/lib/plans";

/** Connected verification (connectors + live control verification) is available to plans with the
 *  integrations flag (Starter+ / Enterprise), plus any demo org. Matches the integration pages' gate. */
export async function requireFabricEnabled(internalOrgId: string): Promise<void> {
  const { data } = await supabaseAdmin()
    .from("organizations").select("is_demo, plan").eq("id", internalOrgId).single();
  if (!(planFor(data?.plan).integrations || data?.is_demo)) {
    throw new ApiError(403, "Connected verification is available on the Starter and Enterprise plans.");
  }
}
