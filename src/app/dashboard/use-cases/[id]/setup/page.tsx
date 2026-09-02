import { auth } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import type { StackSelection } from "@/lib/tech-catalog";
import StackPicker from "../stack-picker";
import { BRAND } from "@/lib/brand";

/** Intake step 2 — select the technology stack right after creating a use case,
 *  before classification runs. Reuses the same StackPicker shown in Manage (the
 *  stack stays editable there later). Continue leads into the assessment. */
export default async function SetupUseCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const sb = supabaseAdmin();

  const [{ data: uc }, { data: orgRow }] = await Promise.all([
    sb.from("use_cases").select("id, name, stack").eq("org_id", internalOrgId).eq("id", id).maybeSingle(),
    sb.from("organizations").select("plan").eq("id", internalOrgId).single(),
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#3b82f6]">New use case · Step 2 of 2</div>
      <h1 className="text-xl font-bold text-[var(--text)]">Select the technology for {uc.name}</h1>
      <p className="mb-5 mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
        Tell {BRAND.name} what this AI is built on. The stack shapes the whole assessment — it maps controls to your
        actual tools and flags any third-party AI. You can change it any time in Manage.
      </p>

      <StackPicker
        useCaseId={uc.id}
        stack={(uc.stack as StackSelection) ?? null}
        controlsDone={false}
        productLimit={Number.isFinite(plan.techProductLimit) ? plan.techProductLimit : -1}
        stackAware={plan.stackAwareControls}
        vendorStatus={vendorStatus}
      />

      <div className="mt-6 flex items-center justify-between gap-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <p className="text-[12.5px] text-[var(--muted)]">Save your stack above, then continue — {BRAND.name} classifies the use case next.</p>
        <Link
          href={`/dashboard/use-cases/${uc.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#3b82f6] px-5 py-2 text-sm font-semibold text-white"
        >
          Continue to assessment <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
