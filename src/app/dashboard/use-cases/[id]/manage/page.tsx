import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import type { StackSelection } from "@/lib/tech-catalog";
import { buildUseCaseAiBom } from "@/lib/ai-bom-generate";
import { TierBadge, FunctionBadge } from "@/components/console/ui";
import OwnershipEditor from "../ownership-editor";
import GovernancePanel from "../governance-panel";
import StackPicker from "../stack-picker";
import UseCaseAiBom from "../use-case-ai-bom";
import VerifyAibom from "../verify-aibom";

/** Manage use case — the single home for everything a customer edits about a use
 *  case: ownership, governance (technical owner / sponsor / lifecycle / exceptions /
 *  incidents), the tech stack, and the AI-BOM. Keeps the use-case detail page focused
 *  on the assessment itself. */
export default async function ManageUseCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, orgRole, userId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const isAdmin = orgRole === "org:admin";
  const sb = supabaseAdmin();

  const [{ data: uc }, { data: orgRow }] = await Promise.all([
    sb.from("use_cases").select("*").eq("org_id", internalOrgId).eq("id", id).maybeSingle(),
    sb.from("organizations").select("plan, is_demo").eq("id", internalOrgId).single(),
  ]);
  if (!uc) notFound();
  const plan = planFor(orgRow?.plan);

  // AI vendor-risk status per product (lowercased product name)
  const { data: vrows } = await sb
    .from("vendor_reviews")
    .select("product_name, decision, final_decision, self_attested")
    .eq("org_id", internalOrgId).neq("status", "archived");
  const vendorStatus: Record<string, "reviewed" | "self"> = {};
  for (const v of vrows ?? []) {
    const key = String(v.product_name ?? "").toLowerCase().trim();
    if (!key) continue;
    if (v.final_decision || v.decision) vendorStatus[key] = "reviewed";
    else if (v.self_attested) vendorStatus[key] = "self";
  }

  const [{ data: gExceptions }, { data: gIncidents }, { count: controlCount }, { data: classifyRec }] = await Promise.all([
    sb.from("use_case_exceptions").select("id, title, detail, risk_owner, status, expires_on").eq("org_id", internalOrgId).eq("use_case_id", id).order("created_at", { ascending: false }),
    sb.from("use_case_incidents").select("id, title, severity, status, note, occurred_at").eq("org_id", internalOrgId).eq("use_case_id", id).order("created_at", { ascending: false }),
    sb.from("control_items").select("id", { count: "exact", head: true }).eq("org_id", internalOrgId).eq("use_case_id", id),
    sb.from("stage_records").select("accepted_output").eq("org_id", internalOrgId).eq("use_case_id", id).eq("stage", "classify").not("accepted_at", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const classifyOut = classifyRec?.accepted_output ?? null;

  // platform role → can edit
  let platformRole = "viewer";
  if (isAdmin) platformRole = "org_admin";
  else if (userId) {
    const { data: m } = await sb.from("memberships").select("role").eq("org_id", internalOrgId).eq("user_id", userId).maybeSingle();
    platformRole = m?.role ?? "viewer";
  }
  const canAct = platformRole === "org_admin" || platformRole === "assessor";

  // AI-BOM verification: latest evidence + whether a repo is connected
  const [{ data: aibomEv }, { count: ghConnections }] = await Promise.all([
    sb.from("control_evidence")
      .select("result, raw_artifact_ref, remediation_hint, checked_at, valid_until, confidence")
      .eq("org_id", internalOrgId).eq("use_case_id", id).eq("capability_id", "ai_bom_present_and_valid")
      .order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("org_connections").select("id", { count: "exact", head: true }).eq("org_id", internalOrgId).eq("provider", "github").eq("status", "connected"),
  ]);
  const aibomInitial = aibomEv
    ? {
        result: aibomEv.result as string,
        rawArtifactRef: aibomEv.raw_artifact_ref as string | null,
        remediationHint: aibomEv.remediation_hint as string | null,
        checkedAt: aibomEv.checked_at as string | null,
        validUntil: aibomEv.valid_until as string | null,
        confidence: aibomEv.confidence as string | null,
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/dashboard/use-cases/${uc.id}`} className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to use case
      </Link>

      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-xl font-bold">Manage — {uc.name}</h1>
        {uc.business_function && <FunctionBadge fn={uc.business_function} />}
        {uc.tier && <TierBadge tier={uc.tier} />}
      </div>
      <p className="mb-5 text-[13px] text-[var(--faint)]">
        Ownership, governance, the tech stack, and the AI-BOM for this use case. Changes here keep the use-case page focused on the assessment.
      </p>

      <OwnershipEditor
        useCaseId={uc.id}
        businessFunction={uc.business_function ?? null}
        ownerName={uc.owner_name ?? null}
        ownerEmail={uc.owner_email ?? null}
        canEdit={canAct}
      />
      <GovernancePanel
        useCaseId={uc.id}
        technicalOwner={(uc as { technical_owner?: string | null }).technical_owner ?? null}
        sponsor={(uc as { sponsor?: string | null }).sponsor ?? null}
        lifecycle={(uc as { lifecycle?: string | null }).lifecycle ?? null}
        exceptions={(gExceptions ?? []) as never}
        incidents={(gIncidents ?? []) as never}
        canEdit={canAct}
      />

      <StackPicker
        useCaseId={uc.id}
        stack={(uc.stack as StackSelection) ?? null}
        controlsDone={(controlCount ?? 0) > 0}
        productLimit={Number.isFinite(plan.techProductLimit) ? plan.techProductLimit : -1}
        stackAware={plan.stackAwareControls}
        vendorStatus={vendorStatus}
      />

      <UseCaseAiBom
        bom={buildUseCaseAiBom(
          { id: uc.id, name: uc.name, description: uc.description, tier: uc.tier },
          (uc.stack as never) ?? null,
          (classifyOut as never) ?? null,
        )}
        useCaseName={uc.name}
      />

      {(plan.integrations || orgRow?.is_demo) && (
        <VerifyAibom
          useCaseId={uc.id}
          canVerify={canAct}
          hasConnection={(ghConnections ?? 0) > 0}
          initial={aibomInitial}
        />
      )}
    </div>
  );
}
