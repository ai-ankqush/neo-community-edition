import { NextResponse } from "next/server";
import { requireRole, ApiError } from "@/lib/rbac";
import { listInstallations } from "@/server/fabric/connectors/github";
import { requireFabricEnabled } from "@/server/fabric/gate";

export const dynamic = "force-dynamic";

/** GET /api/connections/github/installations — admin diagnostic. Lists this
 *  GitHub App's installations so the correct installation id can be copied.
 *  Browse to this URL while signed in as an admin. */
export async function GET() {
  try {
    const session = await requireRole("org_admin");
    await requireFabricEnabled(session.internalOrgId);
    const installations = await listInstallations();
    return NextResponse.json({
      appIdConfigured: Boolean(process.env.GITHUB_APP_ID),
      privateKeyConfigured: Boolean(process.env.GITHUB_APP_PRIVATE_KEY),
      installations,
      hint: "Copy the `id` of the installation whose `account` owns your repo, and paste it into Settings → Connections.",
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
