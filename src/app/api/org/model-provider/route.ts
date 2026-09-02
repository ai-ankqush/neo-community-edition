import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, ApiError } from "@/lib/rbac";
import { supabaseAdmin } from "@/lib/supabase";
import { encryptSecret } from "@/server/model/provider";

export const dynamic = "force-dynamic";

/** POST /api/org/model-provider — set the org's BYO model provider + key (Community).
 *  Admin only. The key is encrypted at the application layer before storage. */
const Body = z.object({
  provider: z.enum(["anthropic", "bedrock", "vertex"]),
  key: z.string().min(10).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin");
    const b = Body.parse(await req.json());
    const update: Record<string, unknown> = {
      model_provider: b.provider,
      model_updated_at: new Date().toISOString(),
    };
    if (b.provider === "anthropic") {
      if (!b.key) throw new ApiError(400, "An Anthropic API key is required.");
      update.model_secret_encrypted = encryptSecret(b.key);
      update.model_meta = {};
    } else if (b.provider === "bedrock") {
      // Keyless: store the customer's cross-account role + region. External id is the org id.
      const meta = (b.meta ?? {}) as { region?: string; roleArn?: string };
      if (!meta.region || !meta.roleArn) throw new ApiError(400, "Bedrock needs a region and a role ARN.");
      update.model_meta = { region: meta.region, roleArn: meta.roleArn, externalId: session.internalOrgId };
      update.model_secret_encrypted = null;
    } else {
      throw new ApiError(400, `Provider '${b.provider}' is not supported yet.`);
    }
    const { error } = await supabaseAdmin()
      .from("organizations")
      .update(update)
      .eq("id", session.internalOrgId);
    if (error) throw new ApiError(500, "Could not save the model provider.");
    return NextResponse.json({ ok: true, provider: b.provider, configured: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("MODEL PROVIDER SAVE ERROR", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

/** DELETE /api/org/model-provider — remove the stored key. Admin only. */
export async function DELETE() {
  try {
    const session = await requireRole("org_admin");
    const { error } = await supabaseAdmin()
      .from("organizations")
      .update({ model_provider: null, model_secret_encrypted: null, model_meta: {}, model_updated_at: new Date().toISOString() })
      .eq("id", session.internalOrgId);
    if (error) throw new ApiError(500, "Could not remove the key.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("MODEL PROVIDER DELETE ERROR", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
