import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { getAuthContext } from "@/server/identity/auth-context";
import { supabaseAdmin } from "./supabase";
import { logAudit } from "./audit";

/**
 * Current published versions of the legal documents. Bump these (date-stamped)
 * whenever the Terms or Privacy Policy materially change — a user who has only
 * accepted an older version will get a fresh record on next load, and (if you
 * add a gate) can be re-prompted.
 */
export const TERMS_VERSION = "2026-06-08";
export const PRIVACY_VERSION = "2026-06-08";

/**
 * Mirror the user's legal consent into our DB. Clerk's sign-up form is what
 * actually collects the agreement checkbox; this records a versioned,
 * auditable copy on first authenticated load. Best-effort: never throws.
 */
export async function recordTermsAcceptance(): Promise<void> {
  try {
    const { userId, internalOrgId } = await getAuthContext();
    if (!userId || !internalOrgId) return;

    const sb = supabaseAdmin();

    // already recorded for this version?
    const { data: existing } = await sb
      .from("terms_acceptances")
      .select("id")
      .eq("user_id", userId)
      .eq("terms_version", TERMS_VERSION)
      .maybeSingle();
    if (existing) return;

    // use Clerk's captured timestamp when available, else now
    let acceptedAt: string | undefined;
    if (AUTH_PROVIDER !== "builtin") {
      try {
        const u = await currentUser();
        const ts = (u as { legalAcceptedAt?: number | null } | null)?.legalAcceptedAt;
        if (ts) acceptedAt = new Date(ts).toISOString();
      } catch {
        // ignore - fall back to default now()
      }
    }

    const { error } = await sb.from("terms_acceptances").insert({
      user_id: userId,
      org_id: internalOrgId,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      source: "signup",
      ...(acceptedAt ? { accepted_at: acceptedAt } : {}),
    });

    // unique-violation just means a concurrent request beat us; ignore it
    if (error && !error.message.includes("duplicate")) {
      console.error("TERMS RECORD FAILED", error.message);
      return;
    }

    await logAudit({
      orgId: internalOrgId,
      actor: userId,
      action: "legal.accept",
      detail: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION },
    });
  } catch (err) {
    console.error("TERMS RECORD FAILED", err);
  }
}
