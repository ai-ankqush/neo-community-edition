import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { CAPABILITIES } from "@/server/fabric/capabilities";
import { PILLAR_NAMES } from "@/components/console/theme";

/**
 * SHARED CONTROLS — the same control, counted once.
 *
 * The problem this solves: when five use cases all run on Claude, the engine recommends the same
 * Claude-scoped controls on each of them — five separate control_items rows tagged with the same
 * capability_id. Coverage then counts that ONE underlying control five times, and "missing" five
 * times. The estate looks worse than it is, and — more importantly — it hides the leverage:
 * closing that ONE control lifts all five use cases at once.
 *
 * A control's SCOPE follows its capability. A capability that a *provider* satisfies (Claude/
 * Anthropic, Okta, AWS…) is a property of the shared integration, not of any single use case — so
 * every control bound to it is the same control. We group by capability_id, collapse the copies,
 * and rank the gaps by how many use cases each one would fix.
 *
 * And because evidence is capability-scoped (control_evidence is keyed on capability_id, not just
 * the control row), a single live check on the connected integration proves that shared control
 * for EVERY use case on it — which is exactly the "does the control already exist?" detection.
 *
 * This does NOT rewrite the per-use-case coverage score (everything downstream depends on it). It
 * is an estate-level view that presents the de-duplicated truth alongside it.
 */

export type SharedState = "proven" | "attested" | "gap";

export interface SharedControl {
  capabilityId: string;
  name: string;
  pillar: number | null;
  pillarName: string | null;
  providers: string[];
  connected: boolean;        // at least one satisfying provider is connected
  useCaseIds: string[];      // distinct use cases this one control sits on
  useCaseNames: string[];
  instances: number;         // how many control_items rows this collapses (the double-count)
  state: SharedState;        // proven (live check passed) | attested (in place, unproven) | gap
  leverage: number;          // use cases a single fix/verify would lift
}

export interface SharedControlsView {
  shared: SharedControl[];        // shared controls (≥2 use cases), leverage-sorted
  instanceCount: number;          // total control_items rows across shared groups
  uniqueCount: number;            // distinct shared controls
  dedupeDelta: number;            // instances collapsed away = instanceCount - uniqueCount
  openLeverage: SharedControl[];  // the unproven/gap ones — where closing once helps most
}

export async function deriveSharedControls(orgId: string): Promise<SharedControlsView> {
  const sb = supabaseAdmin();
  const [{ data: controls }, { data: ucs }, { data: conns }, { data: evidence }] = await Promise.all([
    sb.from("control_items")
      .select("id, use_case_id, pillar, control, status, verification_status, capability_id")
      .eq("org_id", orgId).not("capability_id", "is", null),
    sb.from("use_cases").select("id, name").eq("org_id", orgId).neq("status", "archived"),
    sb.from("org_connections").select("provider").eq("org_id", orgId).eq("status", "connected"),
    sb.from("control_evidence").select("capability_id, result").eq("org_id", orgId),
  ]);

  const ucName = new Map((ucs ?? []).map((u) => [u.id as string, u.name as string]));
  const liveUcs = new Set(ucName.keys());
  const connected = new Set((conns ?? []).map((c) => c.provider as string));
  // A capability is proven org-wide the moment a real check passes on it — evidence is keyed on the
  // capability, so that single result covers every use case bound to it.
  const provenCaps = new Set(
    (evidence ?? []).filter((e) => (e.result as string) === "pass").map((e) => e.capability_id as string),
  );

  type Grp = {
    capabilityId: string; pillar: number | null; ucIds: Set<string>;
    instances: number; allInPlace: boolean; nameVotes: Map<string, number>;
  };
  const groups = new Map<string, Grp>();
  for (const c of controls ?? []) {
    const uc = c.use_case_id as string | null;
    if (!uc || !liveUcs.has(uc)) continue;         // ignore archived / detached
    const cap = c.capability_id as string;
    if (!CAPABILITIES[cap]) continue;              // only capabilities we recognise are provider-scoped
    const g = groups.get(cap) ?? {
      capabilityId: cap, pillar: (c.pillar as number) ?? null, ucIds: new Set<string>(),
      instances: 0, allInPlace: true, nameVotes: new Map<string, number>(),
    };
    g.ucIds.add(uc);
    g.instances += 1;
    if ((c.status as string) !== "in_place") g.allInPlace = false;
    const t = (c.control as string) ?? "";
    g.nameVotes.set(t, (g.nameVotes.get(t) ?? 0) + 1);
    groups.set(cap, g);
  }

  const shared: SharedControl[] = [];
  for (const g of groups.values()) {
    if (g.ucIds.size < 2) continue;                // "shared" means it lands on more than one AI
    const cap = CAPABILITIES[g.capabilityId];
    const proven = provenCaps.has(g.capabilityId);
    const state: SharedState = proven ? "proven" : g.allInPlace ? "attested" : "gap";
    const providers = cap.providers ?? [];
    const ucIds = [...g.ucIds];
    // prefer the capability's own label; fall back to the most common control wording
    const topName = [...g.nameVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    shared.push({
      capabilityId: g.capabilityId,
      name: cap.label || topName || g.capabilityId,
      pillar: g.pillar,
      pillarName: g.pillar != null ? PILLAR_NAMES[g.pillar] ?? null : null,
      providers,
      connected: providers.some((p) => connected.has(p)),
      useCaseIds: ucIds,
      useCaseNames: ucIds.map((id) => ucName.get(id) ?? "use case"),
      instances: g.instances,
      state,
      leverage: g.ucIds.size,
    });
  }

  shared.sort((a, b) => b.leverage - a.leverage || a.name.localeCompare(b.name));
  const instanceCount = shared.reduce((s, x) => s + x.instances, 0);
  const uniqueCount = shared.length;
  const openLeverage = shared
    .filter((s) => s.state !== "proven")
    .sort((a, b) => b.leverage - a.leverage);

  return { shared, instanceCount, uniqueCount, dedupeDelta: instanceCount - uniqueCount, openLeverage };
}
