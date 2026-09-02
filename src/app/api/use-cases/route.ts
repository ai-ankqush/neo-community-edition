import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, requireRole, ApiError } from "@/lib/rbac";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { entitlementsFor, planFor } from "@/lib/plans";
import { byokEnabled } from "@/server/model/provider";

const CreateUseCase = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(5000).optional().default(""),
  businessFunction: z.string().max(60).optional(),
  ownerName: z.string().max(120).optional(),
  ownerEmail: z.string().max(160).optional(),
});

/** GET /api/use-cases - list the org's use cases */
export async function GET() {
  try {
    const session = await requireSession();
    const orgId = await ensureOrg(session.orgId);
    const { data, error } = await supabaseAdmin()
      .from("use_cases")
      .select("id, name, description, status, stage, tier, patterns, created_at, updated_at")
      .eq("org_id", orgId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ useCases: data });
  } catch (err) {
    return handle(err);
  }
}

/** POST /api/use-cases - create (org_admin or assessor) */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("org_admin", "assessor");
    const body = CreateUseCase.parse(await req.json());
    const orgId = await ensureOrg(session.orgId);
    const sb = supabaseAdmin();

    // active use-case cap (per account, non-archived). Demo orgs are unlimited.
    const { data: org } = await sb.from("organizations").select("plan, is_demo, entitlement_overrides, suspended, model_provider").eq("id", orgId).single();
    if (org?.suspended) throw new ApiError(403, "This account is suspended. Contact your administrator.");
    // BYO (Community) orgs must configure a model key before creating a use case.
    if (byokEnabled() && !planFor(org?.plan).managedModelKey && !org?.model_provider) {
      return NextResponse.json(
        { error: "Add your model provider key in Settings before creating a use case.", code: "byo_key_required" },
        { status: 400 },
      );
    }
    const limit = entitlementsFor(org?.plan, org?.entitlement_overrides).useCasesActive;
    if (!org?.is_demo && Number.isFinite(limit)) {
      const { count } = await sb
        .from("use_cases")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .neq("status", "archived");
      if ((count ?? 0) >= limit) {
        throw new ApiError(
          402,
          `You've reached your plan's limit of ${limit} active use cases. Archive one or upgrade to add more.`
        );
      }
    }

    const { data, error } = await sb
      .from("use_cases")
      .insert({
        org_id: orgId,
        name: body.name,
        description: body.description,
        business_function: body.businessFunction || null,
        owner_name: body.ownerName || null,
        owner_email: body.ownerEmail || null,
        created_by: session.userId,
      })
      .select()
      .single();
    if (error) throw error;

    await logAudit({
      orgId,
      actor: session.userId,
      action: "use_case.create",
      objectType: "use_case",
      objectId: data.id,
      detail: { name: body.name },
    });

    return NextResponse.json({ useCase: data }, { status: 201 });
  } catch (err) {
    return handle(err);
  }
}

function handle(err: unknown) {
  if (err instanceof ApiError)
    return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError)
    return NextResponse.json({ error: err.issues }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
