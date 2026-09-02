import Link from "next/link";
import { getAuthContext } from "@/server/identity/auth-context";
import { auth } from "@clerk/nextjs/server";
import { ensureOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { Card } from "@/components/console/ui";
import { buildComposerCandidates, ALL_TECH } from "@/lib/composer-context";
import type { StackSelection } from "@/lib/tech-catalog";
import ComposerPanel from "../composer-panel";
import ManageCustom, { type CustomCheck } from "./manage-custom";
import { BRAND } from "@/lib/brand";

export default async function ComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ compose?: string }>;
}) {
  const sp = await searchParams;
  const { orgId } = await getAuthContext();
  if (!orgId) return <p className="text-[var(--muted)]">Select an organization first.</p>;
  const internalOrgId = (await getAuthContext()).internalOrgId as string;
  const sb = supabaseAdmin();
  const { data: org } = await sb.from("organizations").select("is_demo, plan").eq("id", internalOrgId).single();
  const plan = planFor(org?.plan);
  const isDemo = Boolean(org?.is_demo);

  if (!(plan.integrations || isDemo)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-lg font-bold">Integrations are a Starter feature</h2>
        <p className="mt-2 text-[13px] text-[var(--muted)]">Upgrade to connect and verify controls in your live systems.</p>
        <Link href="/dashboard/plans" className="mt-4 inline-block rounded-md bg-[var(--accent,#06d6d6)] px-4 py-2 text-[13px] font-semibold text-black">See plans</Link>
      </div>
    );
  }

  // Context: the techs this org uses that Neo has no connector for + existing custom integrations.
  const [{ data: ucs }, { data: ctrls }, { data: conns }, { data: checks }] = await Promise.all([
    sb.from("use_cases").select("id, name, stack").eq("org_id", internalOrgId).neq("status", "archived"),
    sb.from("control_items").select("id, use_case_id, control, pillar, framework_refs").eq("org_id", internalOrgId),
    sb.from("ai_custom_connectors").select("id, name, system_name, base_url, status").eq("org_id", internalOrgId).neq("status", "disabled"),
    sb.from("ai_custom_checks").select("id, connector_id, control_text, plain_summary, last_state, last_rollup, last_findings, last_run_at, expires_at").eq("org_id", internalOrgId).order("created_at", { ascending: false }),
  ]);

  const candidates = buildComposerCandidates(
    (ucs ?? []).map((u) => ({ id: u.id as string, name: u.name as string | null, stack: (u.stack as StackSelection) ?? null })),
    (ctrls ?? []).map((c) => ({ id: c.id as string, use_case_id: c.use_case_id as string, control: c.control as string, pillar: c.pillar as number | null, framework_refs: (c.framework_refs as Record<string, string>) ?? null })),
  );

  const connById = new Map((conns ?? []).map((c) => [c.id as string, c]));
  const connectorsWithCheck = new Set<string>();
  const checkRows: CustomCheck[] = (checks ?? [])
    .filter((ch) => connById.has(ch.connector_id as string))
    .map((ch) => {
      const conn = connById.get(ch.connector_id as string)!;
      connectorsWithCheck.add(conn.id as string);
      return {
        checkId: ch.id as string,
        connectorId: conn.id as string,
        name: conn.name as string,
        systemName: conn.system_name as string,
        controlText: (ch.control_text as string) ?? null,
        plainSummary: (ch.plain_summary as string) ?? null,
        lastRollup: (ch.last_rollup as string) ?? null,
        lastState: (ch.last_state as string) ?? null,
        lastRunAt: (ch.last_run_at as string) ?? null,
        expiresAt: (ch.expires_at as string) ?? null,
        findings: (ch.last_findings as { label: string; pass: boolean; proves: string }[]) ?? null,
      };
    });
  // connectors added for later use, no check yet
  const connectorOnlyRows: CustomCheck[] = (conns ?? [])
    .filter((c) => !connectorsWithCheck.has(c.id as string))
    .map((c) => ({
      checkId: "", connectorId: c.id as string, name: c.name as string, systemName: c.system_name as string,
      controlText: null, plainSummary: null, lastRollup: null, lastState: null, lastRunAt: null, expiresAt: null, findings: null,
      connectorOnly: true,
    }));
  const existing: CustomCheck[] = [...checkRows, ...connectorOnlyRows];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/integrations" className="text-[12px] text-[var(--muted)] hover:underline">← Integrations</Link>
        <h2 className="mt-1 text-xl font-bold">{BRAND.name} Integration Composer</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--faint)]">
          For systems {BRAND.name} doesn&apos;t connect to yet. Pick one — {BRAND.name} writes a <span className="font-semibold text-[var(--text)]">read-only</span> check,
          tells you what it needs, and proves whether the control exists in your live system. Read-only, always.
        </p>
      </div>

      {/* Compose a new one */}
      <ComposerPanel
        candidates={candidates}
        catalog={ALL_TECH}
        preselectTech={sp.compose ?? ""}
        existingConnectors={(conns ?? []).map((c) => ({ id: c.id as string, systemName: c.system_name as string, baseUrl: c.base_url as string }))}
      />

      {/* Manage what's already been created */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[var(--faint)]">
          Your connectors <span className="text-[var(--muted)]">· {existing.length}</span>
        </h3>
        <ManageCustom checks={existing} />
      </div>
    </div>
  );
}
