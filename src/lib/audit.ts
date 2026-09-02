import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Append-only audit trail. Never throws - an audit write failure must not
 * break the business operation, but it is loudly logged for investigation.
 */
export async function logAudit(e: {
  orgId: string;
  actor: string;
  action: string; // e.g. "use_case.create", "stage.advance"
  objectType?: string;
  objectId?: string;
  detail?: unknown;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from("audit_events").insert({
      org_id: e.orgId,
      actor: e.actor,
      action: e.action,
      object_type: e.objectType ?? null,
      object_id: e.objectId ?? null,
      detail: e.detail ?? null,
    });
    if (error) console.error("AUDIT WRITE FAILED", e.action, error.message);
  } catch (err) {
    console.error("AUDIT WRITE FAILED", e.action, err);
  }
}
