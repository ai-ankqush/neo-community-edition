import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveSkyPrincipal } from "@/server/identity/resolve-sky";
import type { Principal } from "@/server/identity/types";

/**
 * Guard for authenticated Sky pages. No Clerk — resolves the Neo-native Sky session and redirects to
 * /login (Sky host) when absent. Also surfaces the display email for the header.
 */
export interface SkyContext {
  principal: Principal;
  email: string;
  displayName: string | null;
}

export async function skyContext(): Promise<SkyContext> {
  let principal: Principal;
  try {
    principal = await resolveSkyPrincipal();
  } catch {
    redirect("/login");
  }
  const { data } = await supabaseAdmin().from("sky_users").select("email, display_name").eq("user_id", principal.subjectId).maybeSingle();
  return { principal, email: (data?.email as string) ?? "", displayName: (data?.display_name as string) ?? null };
}
