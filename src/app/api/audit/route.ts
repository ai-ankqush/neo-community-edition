import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "engine.generate": "Ran assessment stage",
  "artifacts.generate": "Generated code artifacts",
  "pack.download": "Downloaded Implementation Pack",
  "use_case.create": "Created use case",
  "use_case.update": "Updated use case",
  "use_case.archive": "Archived use case",
  "use_case.delete": "Deleted use case",
  "stage.accept": "Accepted stage output",
  "stage.gate_confirm": "Confirmed stage gate",
  "control.update": "Updated a control",
  "control.verify": "Verified a control",
  "condition.update": "Updated a condition",
  "board.decision": "Recorded ARB decision",
  "role.set": "Changed a member role",
  "member.remove": "Removed a member",
  "plan.select": "Changed plan",
};

function prettyAction(action: string): string {
  return ACTION_LABEL[action] ?? action.replace(/[._]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** GET /api/audit - admin-only activity log, last 30 days. Lazy-loaded by the
 *  Settings panel so it never blocks page load. */
export async function GET() {
  try {
    const session = await requireRole("org_admin");
    const sb = supabaseAdmin();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: events }, { data: useCases }] = await Promise.all([
      sb.from("audit_events")
        .select("id, actor, action, object_type, object_id, detail, at")
        .eq("org_id", session.internalOrgId)
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(100),
      sb.from("use_cases").select("id, name").eq("org_id", session.internalOrgId),
    ]);

    const ucName = new Map((useCases ?? []).map((u) => [u.id, u.name]));
    let emailOf = new Map<string, string>();
    try {
      const client = await clerkClient();
      const list = await client.organizations.getOrganizationMembershipList({ organizationId: session.orgId, limit: 100 });
      emailOf = new Map(
        list.data
          .map((m): [string, string] => [m.publicUserData?.userId ?? "", m.publicUserData?.identifier ?? ""])
          .filter(([k]) => k)
      );
    } catch {
      // best-effort; fall back to raw actor id
    }

    const rows = (events ?? []).map((e) => {
      const detail = (e.detail ?? {}) as Record<string, unknown>;
      const stage = typeof detail.stage === "string" ? detail.stage : null;
      const who = e.actor === "engine" ? "Engine" : emailOf.get(e.actor) || "—";
      const item =
        e.object_type === "use_case" && e.object_id
          ? ucName.get(e.object_id) ?? "(removed)"
          : e.object_type
          ? e.object_type.replace(/_/g, " ")
          : "—";
      return { id: e.id, at: e.at, who, action: prettyAction(e.action), stage, item };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("AUDIT FETCH ERROR", err);
    return NextResponse.json({ error: "Could not load activity log" }, { status: 500 });
  }
}
