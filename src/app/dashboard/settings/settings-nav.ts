import { User, CreditCard, Users, SlidersHorizontal, ShieldHalf, Scale, ListChecks, GraduationCap, Radio, KeyRound, Plug, Wand2, Gavel, Target, Gauge, Library, type LucideIcon } from "lucide-react";
import { BRAND } from "@/lib/brand";

/** Single source of truth for the Settings ("Admin panel") navigation.
 *  Consumed by BOTH the left-column nav (sidebar focused mode) and the settings page.
 *
 *  Sections and sub-items each carry a full `href`. A section/sub is either:
 *   - in-page  (rendered by the settings page via ?tab / ?sub), or
 *   - linked   (its own route, shown inside the focused settings shell) — set `match`. */

export type SettingsSub = { key: string; label: string; Icon: LucideIcon; blurb: string; href: string; match?: string };
export type SettingsSection = {
  key: string;
  label: string;
  Icon: LucideIcon;
  blurb: string;
  href: string;
  inPage: boolean;
  match: string;
  sub?: SettingsSub[];
};

// AI Action Fabric — split into navigable sub-pages. Connection (token / SDK / MCP proxy)
// is admin plumbing, so it lives here, not near Red Team.
export const AF_SUBS: SettingsSub[] = [
  { key: "rules", label: "Rules & authority", Icon: Scale, blurb: `What your AI is allowed to do, and how hard ${BRAND.name} holds the line.`, href: "/dashboard/settings?tab=ai-action-fabric&sub=rules" },
  { key: "enforcement", label: "Per-control enforcement", Icon: ListChecks, blurb: "Set enforcement per control, overriding the default rules.", href: "/dashboard/settings?tab=ai-action-fabric&sub=enforcement" },
  { key: "tuning", label: "Learning & tuning", Icon: GraduationCap, blurb: `Review ${BRAND.name}'s calls and graduate its autonomy over time.`, href: "/dashboard/settings?tab=ai-action-fabric&sub=tuning" },
  { key: "connection", label: "Connection · SDK / MCP proxy", Icon: KeyRound, blurb: `Generate a connection key and point your agent at ${BRAND.name} — in-agent SDK or the governed MCP proxy.`, href: "/dashboard/settings?tab=ai-action-fabric&sub=connection" },
  { key: "soc", label: "SOC / SIEM streaming", Icon: Radio, blurb: "Forward blocks, flags and findings to your SOC in real time.", href: "/dashboard/settings?tab=ai-action-fabric&sub=soc" },
];
export const AF_DEFAULT_SUB = "rules";

// AI Assessments settings — risk appetite + custom frameworks (defining a framework is a governance act).
export const ASSESSMENT_SUBS: SettingsSub[] = [
  { key: "risk", label: "Risk appetite", Icon: Gauge, blurb: "How much control coverage your business accepts, by risk tier.", href: "/dashboard/settings?tab=assessments&sub=risk" },
  { key: "frameworks", label: "Frameworks", Icon: Library, blurb: `Map ${BRAND.name}'s controls to NIST, ISO 42001, the EU AI Act — or add your own framework.`, href: "/dashboard/settings?tab=assessments&sub=frameworks" },
];

// Integrations — its own routes, but shown in the settings shell with the Composer as a first-class item.
export const INTEGRATION_SUBS: SettingsSub[] = [
  { key: "managed", label: `Managed by ${BRAND.name}`, Icon: Plug, blurb: `Connect ${BRAND.name} to your systems with recipe-driven, read-only auth.`, href: "/dashboard/integrations", match: "/dashboard/integrations" },
  { key: "composer", label: "Integration Composer", Icon: Wand2, blurb: `No connector? Compose a read-only check on the fly — name the system, ${BRAND.name} builds it.`, href: "/dashboard/integrations/composer", match: "/dashboard/integrations/composer" },
];

export const IN_PAGE_KEYS = ["general", "billing", "team", "assessments", "ai-action-fabric", "model-provider"];

export type NavFlags = { showAF: boolean; showIntegrations: boolean; showJudgement: boolean; showModelProvider?: boolean };

export function settingsSections(flags: NavFlags): SettingsSection[] {
  const s: SettingsSection[] = [
    { key: "general", label: "General", Icon: User, blurb: `Your workspace and what ${BRAND.name} remembers about you.`, href: "/dashboard/settings?tab=general", inPage: true, match: "" },
    { key: "billing", label: "Billing & Subscriptions", Icon: CreditCard, blurb: "Plan, usage, price and renewal.", href: "/dashboard/settings?tab=billing", inPage: true, match: "" },
    { key: "team", label: "User Access", Icon: Users, blurb: "Members, roles, single sign-on and the activity log.", href: "/dashboard/settings?tab=team", inPage: true, match: "" },
    { key: "assessments", label: "AI Assessments", Icon: SlidersHorizontal, blurb: "Risk appetite and control frameworks.", href: "/dashboard/settings?tab=assessments", inPage: true, match: "", sub: ASSESSMENT_SUBS },
  ];
  if (flags.showModelProvider) {
    s.push({ key: "model-provider", label: "Model Provider", Icon: KeyRound, blurb: "Bring your own Anthropic key — model usage bills to your account.", href: "/dashboard/settings?tab=model-provider", inPage: true, match: "" });
  }
  if (flags.showAF) {
    s.push({ key: "ai-action-fabric", label: "AI Action Fabric", Icon: ShieldHalf, blurb: "Govern what your AI does in real time.", href: "/dashboard/settings?tab=ai-action-fabric", inPage: true, match: "", sub: AF_SUBS });
  }
  if (flags.showIntegrations) {
    s.push({ key: "integrations", label: "Integrations", Icon: Plug, blurb: `Connect ${BRAND.name} to your systems, or compose a read-only check.`, href: "/dashboard/integrations", inPage: false, match: "/dashboard/integrations", sub: INTEGRATION_SUBS });
  }
  if (flags.showJudgement) {
    s.push({ key: "disagreements", label: "Disagreements", Icon: Gavel, blurb: `Where ${BRAND.name}'s read of the evidence contradicts the record.`, href: "/dashboard/dissent", inPage: false, match: "/dashboard/dissent" });
    s.push({ key: "calibration", label: `${BRAND.name}'s Track Record`, Icon: Target, blurb: `How often ${BRAND.name} was right — scored honestly.`, href: "/dashboard/calibration", inPage: false, match: "/dashboard/calibration" });
  }
  return s;
}

export const SETTINGS_DEFAULT = "general";

// Routes that render inside the focused settings shell (settings + relocated admin surfaces).
export const SETTINGS_ROUTE_PREFIXES = [
  "/dashboard/settings", "/dashboard/integrations", "/dashboard/dissent", "/dashboard/calibration",
];
export function isSettingsRoute(pathname: string): boolean {
  return SETTINGS_ROUTE_PREFIXES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/** Is this section the active one? */
export function sectionOn(section: SettingsSection, pathname: string, curTab: string): boolean {
  return section.inPage ? pathname.startsWith("/dashboard/settings") && curTab === section.key : pathname.startsWith(section.match);
}

/** Which sub of the (active) section is selected — ?sub for in-page, longest path match for linked. */
export function activeSubKey(section: SettingsSection, pathname: string, curSub: string): string | undefined {
  if (!section.sub || section.sub.length === 0) return undefined;
  if (section.inPage) return section.sub.some((x) => x.key === curSub) ? curSub : section.sub[0].key;
  let best = section.sub[0].key, bestLen = -1;
  for (const x of section.sub) {
    if (x.match && pathname.startsWith(x.match) && x.match.length > bestLen) { best = x.key; bestLen = x.match.length; }
  }
  return best;
}
