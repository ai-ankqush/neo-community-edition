import { BRAND } from "@/lib/brand";
/** Guided product tour — the step script.
 *
 *  Each step spotlights an element carrying a `data-tour="<key>"` attribute on a given route,
 *  and shows a tooltip. The tour navigates between routes itself. Most steps sit on portfolio /
 *  overview pages (no use-case id needed); the create + "watch it populate" beats use a seeded
 *  demo use case so nothing has to run the live engine mid-tour.
 *
 *  To light up a step, add `data-tour="<selector-without-brackets>"` to the target element.
 *  A step with no selector shows a centred tooltip (good for chapter intros). */

export interface TourStep {
  chapter: string;                 // grouping label shown in the tooltip
  route?: string;                  // navigate here before showing the step
  selector?: string;              // CSS selector of the spotlight target (usually [data-tour="..."])
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  // 0 — welcome
  { chapter: "Welcome", title: `This is ${BRAND.name}`,
    body: `In two minutes you'll see how ${BRAND.name} takes one AI use case and turns it into controls you can ship and proof you can defend. Click Next to begin.` },

  // 1–4 — create + watch it populate (seeded demo use case)
  { chapter: "1 · Assess an AI", route: "/dashboard/use-cases", selector: '[data-tour="new-use-case"]',
    title: "Start with a use case", body: `Everything begins here. Describe an AI in plain language — what it is and what it does — and ${BRAND.name} runs the assessment end to end.` },
  { chapter: "1 · Assess an AI", route: "/dashboard", selector: '[data-tour="tier-distribution"]',
    title: "It classifies the risk", body: `${BRAND.name} works out what the AI can see, decide and do, then assigns a risk tier. Control depth scales with the tier — a read-only tool is governed lightly, an autonomous agent heavily.` },
  { chapter: "1 · Assess an AI", route: "/dashboard/heatmap", selector: '[data-tour="risk-heatmap"]',
    title: "…across every risk driver", body: "Data boundary, decision influence, tool/action, vendor exposure, recoverability and more — rated per use case, so you see exactly where the risk sits." },
  { chapter: "1 · Assess an AI", route: "/dashboard", selector: '[data-tour="pillar-coverage"]',
    title: "…and maps the controls + tech", body: `From the risk drivers and your declared tech stack, ${BRAND.name} selects the specific controls that govern this AI and shows how well they're covered.` },

  // 5 — Control Graph
  { chapter: "2 · Control Graph", route: "/dashboard/control-graph", selector: '[data-tour="control-graph"]',
    title: "Your whole estate in one map", body: "Every use case and the data, models, systems, controls and decisions around it — with a plain-English Control Picture and a verdict on top." },

  // 6 — Vendor Risk
  { chapter: "3 · Vendor Risk", route: "/dashboard/vendor-reviews", selector: '[data-tour="vendor-reviews"]',
    title: "Vet the AI you buy", body: `Before you sign a third-party AI, ${BRAND.name} assesses it, scores it, and gives you the evidence and contract terms to demand — a decision pack you can defend.` },

  // 7 — Supply Chain
  { chapter: "4 · Supply Chain", route: "/dashboard/supply-chain", selector: '[data-tour="supply-chain"]',
    title: "The AI behind your AI", body: "Every model, dataset, tool and vendor your AI is built on — enriched from public registries, scored, with CVEs surfaced and an AI-BOM you can export." },

  // 8 — Action Fabric
  { chapter: "5 · Action Fabric", route: "/dashboard/control-graph/insights", selector: '[data-tour="action-fabric"]',
    title: "Control what AI does, live", body: "Real-time mediation of AI actions — allow, constrain, step up to a human, or interdict in milliseconds. Shadow-first, with a kill switch. (Beta)" },

  // 9–11 — platform: integrations (Neo vs Composer), SSO, admin
  { chapter: "6 · Platform", route: "/dashboard/integrations", selector: '[data-tour="integrations"]',
    title: "Prove controls where they live", body: `Connect read-only to your stack to verify controls against the real thing. ${BRAND.name} ships ready-made connectors — and if one doesn't exist, the Integration Composer writes it on the fly.` },
  { chapter: "6 · Platform", route: "/dashboard/settings/sso", selector: '[data-tour="sso"]',
    title: "Enterprise-ready", body: "SSO (SAML / OIDC), isolated workspaces, granular roles, and a full audit trail — read-only by design, no standing secrets." },
  { chapter: "6 · Platform", route: "/dashboard/settings", selector: '[data-tour="admin-panel"]',
    title: "Run it your way", body: "Members and roles, risk appetite, plan and usage, and the audit log — the admin controls for governing your whole portfolio." },

  // 12 — close
  { chapter: "Start free", route: "/dashboard", title: "Now try it on your own AI",
    body: "That's the loop: assess → map → verify → govern. Create your first real use case and see it end to end — free for 30 days." },
];
