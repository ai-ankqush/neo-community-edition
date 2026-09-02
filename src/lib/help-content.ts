import { BRAND } from "@/lib/brand";
import { isCommunity } from "@/ce/edition";
/**
 * Help knowledge base. Single source of truth for:
 *   - the in-app Help page (rendered as articles)
 *   - Ask Neo "help" mode (concatenated into the assistant's context)
 * Keep articles short, task-oriented, and free of proprietary methodology.
 *
 * Community Edition ships a subset of the product, so the paid-module articles
 * (AI Action Fabric, AI Supply Chain, Vendor AI Review, Reversibility, Disrupt,
 * paid plans/billing) are filtered out below — otherwise the Help page and Ask
 * Neo would describe features a self-hoster doesn't have.
 */

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  body: string; // plain text / light markdown; rendered simply
}

const ALL_HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started — your first 15 minutes",
    category: "Getting started",
    body: `New to ${BRAND.name}? Here's the fastest path from sign-up to your first governed AI use case.

1. Create your account at app.neocontrol.ai and set up your organization (any name you like). This is your own isolated workspace.
2. Add your first AI use case: go to AI Assessments → AI Use Cases → New Use Case, and describe what the AI does in a sentence — what it's for, the business outcome, and its tech stack. ${BRAND.name} works out what it can see, decide and do, assigns a risk tier, and generates the controls.
3. Work through the assessment stages, accepting each draft: classify → risk tier → questions → controls → evidence → decision. You Confirm the classification and risk tier (your sign-off) before the controls are built on them.
4. Invite your team in Settings → User Access. ${BRAND.name} has role-based access control — Admin, Assessor, Contributor, Viewer — so everyone gets exactly the access they need.
5. (Optional) Connect a system in Settings → Integrations to verify controls live. ${BRAND.name} is read-only — it only reads configuration to prove a control is in place; it never writes to or changes your systems.
6. See the whole picture on the AI Control Graph (your estate), act on the Findings, and generate a board-ready PDF from Executive Reports.

Prefer a guided walkthrough? Take the product tour at neocontrol.ai/tour — or just ask me here (for example "how do I add a use case?", "how do I invite my team?", "how does the risk tier work?") and I'll walk you through it step by step.`,
  },
  {
    slug: "what-is-neo",
    title: `What is ${BRAND.name}?`,
    category: "Getting started",
    body: `${BRAND.name} is an AI Control Architecture platform. You describe an AI use case, and ${BRAND.name} runs a structured assessment that classifies its risk, recommends controls mapped to your technology stack, helps you capture evidence and a governance decision, and produces an audit-grade report.

${BRAND.name} is read-only with respect to your environment. Where you connect a system for live verification, ${BRAND.name} only reads policy or configuration state to prove a control is in place — it never writes to, changes, or takes any action in your systems.`,
  },
  {
    slug: "run-an-assessment",
    title: "How to run an assessment",
    category: "Getting started",
    body: `1. Go to Use Cases and click New Use Case.
2. Describe the use case in plain language. Next you'll select your technology stack — it's a step right after you create the use case (paid plans); you can edit it later in Manage.
3. Run each stage in order: ${BRAND.name} classifies the pattern, assigns a risk tier, asks tailored questions, then generates controls, evidence guidance, tests, and a recommended decision.
4. Review each stage's draft before committing. For the classification and the risk tier you'll either Confirm the recommendation (your sign-off) or Suggest changes to correct it — see "Confirming the classification and risk tier". Other stages you Accept to advance. You can go Back or rewind if something changes.
5. When complete, export a report from the use case page or the Reports section.`,
  },
  {
    slug: "stages",
    title: "The assessment stages",
    category: "Assessments",
    body: `An assessment moves through these stages: intake, classify, tier, questions, controls, evidence, assurance, decision, operate.

You advance one stage at a time and accept each draft before moving on. The classification and risk-tier stages need your explicit confirmation — you Confirm the recommendation or Suggest changes to correct it — because the controls are built on them. Questions must be answered before controls are generated — controls built on unanswered questions would be guesswork. If you change your answers, rewind to the questions stage; this clears the downstream stages so the record stays coherent, and you re-run controls.`,
  },
  {
    slug: "risk-tiers",
    title: "Risk tiers",
    category: "Assessments",
    body: `Each use case is assigned a risk tier based on what the AI can see, decide, and do. Higher tiers carry deeper control requirements. Tier 4 and above are treated as high risk and require action-level governance controls. The tier drives which controls ${BRAND.name} recommends and how much assurance is expected before a use case is approved.

You confirm the risk tier before controls are generated. ${BRAND.name} proposes a tier with its reasoning and a set of escalation triggers shown as checkboxes; tick the ones that are true for your use case and the tier updates to reflect them. Confirming records the tier as your decision — see "Confirming the classification and risk tier".`,
  },
  {
    slug: "confirm-classify-and-tier",
    title: "Confirming the classification and risk tier",
    category: "Assessments",
    body: `Two stages need your explicit sign-off before ${BRAND.name} builds your controls: the classification (what the AI can See, Decide and Do) and the risk tier. This is deliberate — the controls are built on these two, so they have to be right, and they are yours to confirm. ${BRAND.name}'s principle: AI proposes; you check and decide. You can't outsource your judgement to the AI.

At each of these stages ${BRAND.name} shows its proposal and gives you two choices:
- Confirm — this is correct: you agree, and ${BRAND.name} stamps it and moves on. This is your sign-off, and it is recorded on the assessment.
- Suggest changes: something is wrong (often because the use-case description was thin or loose). Tell ${BRAND.name} what is actually true — for example "the AI can only read the CRM, it never writes" or "it never emails the counterparty". ${BRAND.name} adds that to the use case and re-runs the stage so the result matches your real intent. You can do this as many times as you need.

On the risk tier, the escalation triggers appear as checkboxes. Tick the ones that are true; the tier updates automatically to reflect them, and confirming records that as your decision.

You cannot reach the controls until both the classification and the risk tier are confirmed. If you correct something after later stages have run, those stages re-open so the record stays consistent.`,
  },
  {
    slug: "stack-aware-controls",
    title: "Stack-aware controls",
    category: "Assessments",
    body: `When you declare your technology stack (for example AWS, Okta, CrowdStrike, Splunk, ServiceNow), ${BRAND.name} turns generic control requirements into specific implementation steps for those tools. Add tools from the stack picker on the use case page. Plan limits cap how many tech products you can map; Premium and above remove most limits.`,
  },
  {
    slug: "verify-controls",
    title: "Verifying controls",
    category: "Assessments",
    body: `On the Controls and Evidence views you can mark each control as verified, partial, or missing, and attach the evidence that proves it. This builds the assurance picture for the use case.

You can verify a control two ways. By attestation — you confirm the control and attach proof. Or by live verification — connect the relevant system read-only and ${BRAND.name} checks the control against the real thing (for example, "MFA enforced" read from your identity provider), then records the result as tamper-evident evidence with a freshness timestamp. See "Connecting your stack (live verification)".`,
  },
  {
    slug: "decisions",
    title: "Decisions and the review board",
    category: "Assessments",
    body: `${BRAND.name} produces a recommended decision for each use case. Your review board can record a formal verdict — approved, approved with conditions, pilot only with strict controls, rejected pending technology, or rejected — alongside a rationale. Open conditions are tracked until closed. The Executive Summary and Reports views roll these up across the portfolio.`,
  },
  {
    slug: "ask-neo",
    title: `Using Ask ${BRAND.name}`,
    category: "Assessments",
    body: `Ask ${BRAND.name} is your built-in assistant, available on every page. It has two modes:
- Product help: how the platform and methodology work (this knowledge base).
- My portfolio: analysis over your own assessment data — risk, controls implemented vs pending, decisions, and readiness.

Switch modes in the Ask ${BRAND.name} panel. Portfolio answers use only your organization's data.`,
  },
  {
    slug: "ai-action-fabric",
    title: "AI Action Fabric — governing what your AI can do",
    category: "Action Fabric",
    body: `Assessments prove your controls are in place. The AI Action Fabric governs what an AI agent actually *does* — live. Every action an agent tries (send an email, update a record, issue a refund, delete data, change a permission) is decided by ${BRAND.name} in real time and turned into a fresh, scoped, revocable permission. The agent has no standing authority; it earns a yes, a conditional yes, a hold-for-approval, or a block for each action.

Connecting your AI: there are three ways, all using the same connection key and endpoint (Settings › AI Action Fabric › Connection):
- SDK: wrap your tool calls so ${BRAND.name} decides before each one runs.
- Governed MCP proxy: re-point your agent's MCP client at the proxy so every tool call is mediated inline.
- Audit-log collector: pull your system's log on a schedule to detect actions that bypassed ${BRAND.name} (monitor only).

Modes, earned not applied: every integration starts in Watch (shadow) — ${BRAND.name} judges every action and changes nothing, so you see exactly what it would do. When an integration has a proven track record (enough reviewed decisions with a high match rate and no risky overrides), you can graduate it to Approve (a person confirms each high-impact action) and then Block (${BRAND.name} allows the safe actions and blocks the risky ones automatically). You can't jump straight to blocking something unproven — you earn it — unless you explicitly mark a use case a test environment for experimentation.

Enforcement is paid: watching in shadow is free on every plan. Actually blocking live actions (enforcement) is a paid capability, and even then it's opt-in (a separate recorded acknowledgment) and earned per integration. A kill-switch reverts all enforcement to observe-only instantly. Low-risk actions fail open if ${BRAND.name} is unreachable; destructive actions fail closed.

Key places:
- Delegation: watch a single action get decided — what was requested, ${BRAND.name}'s verdict, the scope, whether it's reversible, how fast it decided, and why.
- Anticipate (Preempted): what ${BRAND.name} anticipated and already stopped on your estate, with proof, plus the gaps still open.
- Recovery: reversible actions are armed so you can take them back within a window.
- Red Team → Live Fire: attack a connected AI (a direct endpoint or an MCP server) with real adversarial probes to prove what actually breaks.

Proof: every decision, every kill-switch flip, and every recovery is written to the audit log.`,
  },
  {
    slug: "plans",
    title: "Plans and limits",
    category: "Billing",
    body: `${BRAND.name} has a 14-day free Trial plus paid plans. The Trial gives you the full feature set on a small number of use cases with no card required; when it ends, choose a plan to keep working — your data is preserved. Higher plans raise the use-case allowance and add capabilities such as all framework crosswalks, advanced reporting, control verification (both attestation and live read-only verification through connectors), and (on Enterprise) SSO and multiple workspaces. Live verification and integrations are available across plans.

The AI Action Fabric watches every AI action in shadow on all plans; actually blocking actions (enforcement) is a paid capability, and even then it is earned per integration through a proven track record.

See the Plans page in the app for current pricing and exact limits. A use-case slot is consumed when you first generate engine output for it; deleting a use case after that archives it rather than refunding the slot.`,
  },
  {
    slug: "build-and-deploy",
    title: "Build & Deploy: implementation pack and code artifacts",
    category: "Assessments",
    body: `Once a use case has controls, the Build & Deploy page hands them to engineering.

Download the Implementation Pack — a zip with a master checklist, a per-control runbook (why it matters, how to implement it on your stack, the test that proves it works, and the evidence to capture), and a tickets.csv you can import into Jira or Linear. This is available on every plan.

On Premium and above you can also Generate code artifacts: ${BRAND.name} writes a starting scaffold per control, mapped to your declared stack — Terraform, policy-as-code, a config snippet, or a SIEM detection rule for monitoring controls. Every environment-specific value is flagged with a TODO. These are review-before-apply scaffolds to adapt to your environment, never blind apply scripts. Generate once and the code is stored, so re-downloads are instant; if you re-run the assessment afterwards, the page flags the code as out of date so you can regenerate.`,
  },
  {
    slug: "appearance",
    title: "Light and dark mode",
    category: "Account",
    body: `Use the sun/moon button in the top header to switch between dark and light themes. Your choice is remembered in your browser, so it persists across sessions on that device.`,
  },
  {
    slug: "activity-log",
    title: "Activity log",
    category: "Account",
    body: `Organization admins can review recent activity under Settings → Activity Log: who did what over the last 30 days — assessments run, code artifacts generated, implementation packs downloaded, role changes, and recorded decisions. The log is append-only and cannot be edited or deleted.`,
  },
  {
    slug: "reports",
    title: "Reports and export",
    category: "Reports",
    body: `Export a per-use-case report from any use case page (Print / PDF). The Reports section gives a portfolio rollup: execution status (controls implemented, partial, pending), tests, open conditions, and the decision on record per use case, plus a decision register. Use Ask ${BRAND.name}'s portfolio mode to query this in plain language.`,
  },
  {
    slug: "agencies-msps",
    title: `Using ${BRAND.name} as an agency or MSP`,
    category: "Account",
    body: `If you run assessments on behalf of clients, create one workspace per client. Each workspace is fully isolated — its own use cases, controls, evidence, decisions, plan, team, and audit trail. Nothing is shared between clients.

To add a client: open the Workspace switcher at the bottom-left of the sidebar, or click "New client workspace", and give it the client's name. You can switch between client workspaces from the same menu at any time.

Each workspace carries its own plan and usage limits, so you can keep a client on the Trial while assessing, then move them up as needed. Invite client team members into their own workspace from Settings without giving them access to your other clients.`,
  },
  {
    slug: "roles",
    title: "Roles and access",
    category: "Account",
    body: `Organization admins (set in your identity provider) can manage everything. Other members are assigned a platform role — assessor, contributor, or viewer — which controls who can run engine stages and record decisions. Manage members and roles in Settings.`,
  },
  {
    slug: "red-team",
    title: "Red Team",
    category: "Assessments",
    body: `Red Team generates concrete attack paths for a use case and scores each against your current control posture.

Open a use case that has reached the risk-tier stage, go to its Red Team tab, and run the analysis. For each attack you get the scenario (how it actually happens), the unguarded outcome, a severity, the OWASP LLM / MITRE ATLAS reference, and the pillar/control that blocks it. Each path is marked Exposed, Partial, or Blocked based on whether that control is in place and verified in your workspace — so you see what you are exposed to today.

The Red Team page in the left nav rolls this up across the whole portfolio: total attack paths, how many are exposed, exposure by vector (SEE / DECIDE / DO), and your top current exposures with the control that fixes each. Re-run Red Team after you change controls or context to refresh the picture.`,
  },
  {
    slug: "vendor-ai-review",
    title: "Vendor AI Review",
    category: "Assessments",
    body: `Vendor AI Review lets you vet a third-party AI product before you buy it — a copilot, an agent, or AI-enabled SaaS.

Start a review from the Vendor AI Review section: name the product and business function. ${BRAND.name} classifies what the vendor's AI can see, decide, and do, assigns a risk tier, and generates a tier-scaled questionnaire — the exact questions, evidence, and contract terms to put to the vendor, mapped to NIST AI RMF, ISO 42001, and OWASP.

Send it to the vendor through a scoped portal link — no login for them, and the link is revocable. Their answers come back and you score each as met, partial, gap, or evasive, with conditions and residual risk. ${BRAND.name} rolls this into a recommended decision; your board records the verdict — approve, approve with conditions, defer, or reject — and you export a decision-pack PDF. You can optionally convert an approved product into a tracked use case.

Available on Enterprise and for Founding Reviewers.`,
  },
  {
    slug: "connect-your-stack",
    title: "Connecting your stack (live verification)",
    category: "Assessments",
    body: `Live verification connects ${BRAND.name} to systems you already run — read-only — and proves each control against the real thing, instead of taking your word for it.

Go to Integrations to connect a system. ${BRAND.name} uses a recipe-driven framework with thin, native auth (an API token, an OAuth client-credentials app, a cloud read-only role, etc.); it stores no standing secrets it doesn't control and never requests write access. A preflight check confirms auth, scope, and reachability before any verification runs.

Once connected, controls that map to a connected capability show a "Verify live" action and return PASS or FAIL with inline evidence — the provider, when it was checked, a freshness window, and a tamper-evident hash. Examples: MFA enforced (Okta, Microsoft Entra ID, Google Workspace), cloud audit logging enabled (AWS, GCP, Azure), AI-BOM present in your repo (GitHub), change management linked (ServiceNow, Jira), SIEM ingestion (Splunk).

Live verification connects read-only only: ${BRAND.name} reads policy or configuration state to confirm a control and never changes anything in your environment.`,
  },
  {
    slug: "sso",
    title: "Single Sign-On (SSO)",
    category: "Account",
    body: `On Enterprise, your team can sign in with your company identity provider — Okta, Microsoft Entra ID, Google Workspace, or any SAML/OIDC IdP.

An organization admin sets it up under Settings → Single Sign-On: submit your IdP type and company email domain(s), and we provision the enterprise connection and email you the exact values your IdP needs (ACS URL and Entity ID). Once your IT team adds those and shares the IdP metadata back, we activate it.

After activation, anyone with a verified email domain signs in through your IdP and is added to this workspace automatically (just-in-time provisioning). Existing members keep their current sign-in until SSO is active. Typical turnaround is one business day.`,
  },
  {
    slug: "data-security",
    title: "Data and security",
    category: "Account",
    body: `Your assessment data is isolated per organization with row-level access controls and encrypted in transit and at rest. ${BRAND.name} does not use your assessment content to train third-party models and does not require access to your production systems. See the Privacy Policy and Terms of Service at neocontrol.ai/privacy and neocontrol.ai/terms.`,
  },

  {
    slug: "how-neo-decides",
    title: `How ${BRAND.name} decides — the operating principles`,
    category: `How ${BRAND.name} works`,
    body: `${BRAND.name} turns a single AI use case into one connected thread — from the governance decision, to the controls, to the code engineers ship, to detections, to red-teaming. Five teams that usually never share a record work off the same one.

Two principles run through everything, and they explain why ${BRAND.name} behaves the way it does:

1. Control depth scales with risk. ${BRAND.name} first classifies what an AI can SEE (the data and systems it reads), DECIDE (the judgements it shapes), and DO (the actions it can take), then assigns a risk tier (1–5). A higher tier demands more controls, more evidence, and a stricter decision. So a read-only internal search tool is governed lightly; an autonomous agent that can change records is governed heavily.

2. Declared is not verified — and ${BRAND.name} never pretends otherwise. Everything starts as "declared" (you told us) and only becomes "verified" when a read-only check proves it against your real system. ${BRAND.name} is deliberately conservative: when proof is thin it drops a level rather than over-claiming. A green result you can't trust is worse than an honest gap.

Controls are organised so the same use case can be governed, watched, anticipated, disrupted, and adapted over its life — the functions you see across the product (Govern, Observe, Anticipate, Disrupt, Adapt). Ask ${BRAND.name} can explain any specific control, score, or verdict in plain language — that's what this assistant is for.`,
  },
  {
    slug: "disrupt-control-modes",
    title: "Disrupt: control modes (Shadow, Human approval, Autonomous, Monitor, Validate)",
    category: `How ${BRAND.name} works`,
    body: `The Disrupt page (part of AI Action Fabric) lists every control from each of your use cases and lets you choose how ${BRAND.name} governs each one. There are two families of mode, and which one a control gets depends on whether it is ENFORCEABLE — i.e. whether it can gate an AI action at runtime.

Enforceable (runtime) controls take an enforcement mode and graduate up a ladder:
- Shadow — ${BRAND.name} watches and logs what it would do, but enforces nothing. The safe starting point.
- Human approval — a risky action is paused and stepped up to a person before it can proceed.
- Autonomous — ${BRAND.name} allows or blocks the action itself, in milliseconds (below the 250ms human-reaction wall). A control can only reach Autonomous after the breaking control on its path is VERIFIED and the model + reviewers agree.

Non-enforceable controls — posture, configuration, assurance, monitoring and governance controls that can't inline-block a single action — take one of two modes: Monitor or Validate. This is the pair people most often mix up:

- Monitor — ${BRAND.name} keeps a continuous, PASSIVE watch. It observes the related activity and evidence and alerts you if the control drifts, lapses, or something violates it. It does NOT re-prove the control itself. Use it when you simply want an eye on the control and to be told if something changes.

- Validate — ${BRAND.name} ACTIVELY re-checks that the control is genuinely in place, on a cadence. It re-runs the live read-only verification (or re-confirms the evidence) and records a fresh PASS/FAIL, flagging you if the control stops holding. Use it for a control you've connected and can prove against a real system (for example "MFA enforced" read from your identity provider) so the evidence never goes stale.

In one line: Monitor watches for problems in what is happening; Validate periodically re-proves that the control still works. Monitor is passive observation; Validate is active re-verification that produces fresh, timestamped evidence. Validate is therefore stronger, but it depends on the control being connected/verifiable — Monitor is the fallback when you can't (or don't need to) re-prove it live.`,
  },
  {
    slug: "ai-supply-chain",
    title: "AI Supply Chain — the AI behind your AI",
    category: "AI Supply Chain",
    body: `AI Supply Chain Control maps everything an AI use case is built on — every model, dataset, tool, third-party vendor, and the compute it runs on — and shows what each can change, what breaks if it fails, and where you are blind.

The hero is the AI Dependency Authority Graph: a left-to-right view of your dependencies where the relationships are first-class (data → model → action), not just a list. Each node carries four independent scores (see "The four scores"). The graph is derived fresh each time, so a model update, a new CVE, a provider change, or a vendor decision re-opens the picture automatically.

It has two altitudes: an Overview (your whole portfolio rolled up) and a per-use-case Dependency Map (the graph, scores, verdict, and tabs for one use case).`,
  },
  {
    slug: "four-scores",
    title: "The four scores (Impact, Influence, Confidence, Volatility)",
    category: "AI Supply Chain",
    body: `Every dependency in the Authority Graph is scored on four axes that move independently — that's the point: a single combined score would hide the danger.

- Impact — blast radius. How much breaks if this dependency fails or is compromised.
- Influence — how much this dependency shapes the AI's output (from informational up to action-shaping).
- Confidence — how well it's proven (see "Assurance tiers"). Higher = fewer blind spots.
- Volatility — how silently it can change underneath you (a managed cloud service vs. an open-weight model a third party can swap).

The danger node is the intersection: high influence, low confidence, high volatility — something that heavily shapes the answer, isn't proven, and can change without telling you. A flat bill of materials can never point at that.`,
  },
  {
    slug: "assurance-tiers",
    title: "Assurance tiers — declared vs verified",
    category: "AI Supply Chain",
    body: `Confidence in a dependency sits on a ladder, and ${BRAND.name} is strict about which rung something is on:

- Unknown — nothing proven; the honest default for anything not yet assessed.
- Declared — self-stated (you, or a vendor, said so). Better than unknown, but unproven.
- Evidenced — backed by public-registry signals (e.g., model provenance, known CVEs) or a completed vendor review.
- Verified — a read-only connector confirmed it against your live system. The strongest tier.

A third-party AI you don't operate can't reach "verified" (you can't run a check inside someone else's environment) — its ceiling is "evidenced/disclosed." This is why a use case that leans on an unverifiable vendor AI tops out at "Ready with conditions," never fully Ready.`,
  },
  {
    slug: "decision-readiness",
    title: "Decision Readiness verdict",
    category: "AI Supply Chain",
    body: `The verdict is ${BRAND.name}'s one-line operational conclusion for a use case, read off the Authority Graph. States, worst to best:

- Blocked — a verified control failure or a dangerous over-authorised dependency on the critical path.
- Re-attestation required — something material changed since your last decision; re-decide.
- Insufficient proof — the critical path has high-influence dependencies that are only declared. The honest early default.
- Pilot only — partially controlled; at least one high-influence dependency is unverified, or the human-approval gate is only declared.
- Ready with conditions — controlled except for advisory or minor gaps.
- Ready — every high-influence dependency on the critical path is verified, with a verified approval gate and no danger nodes or open changes.

The critical authority path is the one chain that matters most: most-sensitive data → the model → the highest-authority action. The fastest path tells you the one or two steps that clear the most blockers (e.g., "verify retrieval source-trust"). ${BRAND.name} never returns "Ready" without verified evidence on that path.`,
  },
  {
    slug: "trust-debt-excess",
    title: "Trust Debt and Excess Authority",
    category: "AI Supply Chain",
    body: `Trust Debt is a single board-ready count (not a 0–100 score) of the unproven assumptions your AI currently rests on: high-influence dependencies that aren't verified, hidden dependencies, excess-authority findings, a missing verified approval gate, and pending re-attestations. It's shown with a band — none / low / moderate / high / critical. It's a count on purpose: collapsing four independent scores into one number would hide exactly what matters. Lower it by verifying dependencies and closing gaps.

Excess Authority flags where a dependency has more power than its job needs — for example, a use case tiered as decision-support that actually has a write action, or sensitive data reaching a third-party vendor. It's the honest "declared vs declared" version (what you said it should do vs. what the stack says it can do); the deeper "this service account can read HR records" version comes once connectors verify it.`,
  },
  {
    slug: "vendor-assurance-rungs",
    title: "Vendor assurance: not assessed, self-attested, vendor-reviewed",
    category: "AI Supply Chain",
    body: `A third-party AI in your stack carries one assurance status, and it changes the supply-chain risk:

- Not assessed — no review yet. Treated as "unknown," flags as a risk, and counts toward Trust Debt.
- Self-attested — you answered for the vendor yourself (the "answer yourself" option). It's your assertion, treated as "declared" — a notch above not-assessed, but still counts toward Trust Debt. It can't reach the reviewed bar.
- Vendor-reviewed — you sent the questionnaire and the vendor's answers were scored to a decision (approve / conditions / defer / reject). An approval reaches "evidenced/disclosed" and clears that dependency's debt. A reject or defer is flagged as a danger — a product you wouldn't buy that's still embedded.

To set it: on the Vendor AI Review list, either send the review to the vendor, or use "Self-attest" on a vendor. The status feeds straight into the AI Supply Chain graph and the use case's verdict.`,
  },
  {
    slug: "concentration-containment",
    title: "Provider concentration, containment, and exports",
    category: "AI Supply Chain",
    body: `Provider concentration shows when one external compute provider (a hyperscaler or GPU cloud) is carrying several high-tier use cases — a single point of failure across your portfolio. ${BRAND.name} derives it from the declared stacks and groups it once.

Containment readiness answers the question most AI tools skip: if this AI goes wrong, can you stop it? It scores ten containment controls (disable model access, revoke identity, block egress, stop the runtime, preserve logs, and so on) as Ready / Partial / Not ready. It's an honest attestation today, becoming connector-verified as integrations land.

Exports: the AI-CBOM is a machine-readable bill of materials for your AI (CycloneDX ML-BOM); the Due-Diligence report is a printable summary for an auditor, customer, or acquirer. Both are available per use case and for the whole portfolio.`,
  },
  {
    slug: "framework-crosswalks",
    title: `Which frameworks does ${BRAND.name} map controls to?`,
    category: "Frameworks & compliance",
    body: `Every control ${BRAND.name} generates carries a conceptual crosswalk to the frameworks that matter, so one assessment satisfies many obligations. Today ${BRAND.name} maps each control to: NIST AI RMF (Govern/Map/Measure/Manage), ISO/IEC 42001, the EU AI Act, OWASP LLM and Agentic Top 10, SR 11-7 (US model risk management), and NYDFS 23 NYCRR Part 500. You can switch between frameworks on the Controls page to see the reference for each control. The mapping is conceptual — it shows which provision a control helps satisfy if the framework applied — not a legal opinion.`,
  },
  {
    slug: "sr-11-7-mapping",
    title: `How does ${BRAND.name} map to SR 11-7 (model risk management)?`,
    category: "Frameworks & compliance",
    body: `SR 11-7 is the US supervisory guidance on model risk management (Federal Reserve SR 11-7; OCC Bulletin 2011-12), increasingly applied to AI and machine-learning models. It has three elements, and ${BRAND.name} operationalizes each:

- Development, implementation, and use — ${BRAND.name} inventories and classifies each model, bounds its data and inputs, and validates its outputs and appropriate use.
- Validation and effective challenge — ${BRAND.name}'s independent assurance and Red Team (Live Fire and Simulation) are the operational form of effective challenge; the Human Accountability model enforces a validator role distinct from the model owner; Monitoring provides ongoing monitoring and outcomes analysis.
- Governance, policies, and controls — the AI Control Graph is the model inventory, the risk tier is the model risk rating, and evidence provides the documentation and audit trail.

Every control is tagged with the SR 11-7 element it supports (visible on the Controls page). SR 11-7 was written for traditional models and strains on agentic AI; ${BRAND.name} closes that gap with tool/action control, approval gates, and incident containment. See the SR 11-7 crosswalk in the AI Control Architecture for the full mapping.`,
  },
  {
    slug: "nydfs-part-500-mapping",
    title: `How does ${BRAND.name} map to NYDFS Part 500 (23 NYCRR 500)?`,
    category: "Frameworks & compliance",
    body: `NYDFS supervises AI through the cybersecurity lens of 23 NYCRR Part 500, not as a separate AI regime — its guidance tells covered entities to fold AI risk into the Part 500 program they already run. ${BRAND.name} helps do that:

- AI asset inventory (500.13) — the AI Control Graph and AI-BOM give the AI portion of the asset inventory.
- Access (500.7, 500.12) — AI identities are scoped and reviewed like any asset.
- Risk assessment (500.9) — AI systems are tiered and their findings feed the Part 500 risk assessment.
- Third-party AI (500.11) — Vendor AI Review and AI Supply Chain surface vendor AI and its data access.
- Testing (500.5) — Red Team provides AI penetration testing (prompt injection, exfiltration, tool misuse).
- Monitoring and training (500.14), Incident (500.16/500.17) — monitoring, evidence, and AI incident containment plus notification evidence.

Each control is tagged with the Part 500 section it helps satisfy (visible on the Controls page). See the NYDFS Part 500 crosswalk in the AI Control Architecture for the full mapping.`,
  },
  {
    slug: "us-state-ai-laws-mapping",
    title: `Does ${BRAND.name} help with US state AI laws?`,
    category: "Frameworks & compliance",
    body: `US state AI laws converge on a handful of operational obligations — disclosure that AI is in use, documentation, human review of consequential decisions, explanation or contestability of adverse outcomes, and bias testing in some sectors. ${BRAND.name} produces the controls and evidence behind each: decision transparency and disclosure (Output and Decision control), human review (Human Accountability), documentation and inventory (AI inventory and classification), and bias testing (AI Assurance and Red Team). Because the obligations overlap, one ${BRAND.name} assessment tends to produce evidence for several laws at once (Colorado, Texas, California, Utah, New York City, Illinois).

Important: state AI law is changing fast — Colorado replaced its comprehensive act with a narrower one, and federal preemption has been signaled — so treat the state mapping as a moving overlay and confirm current law with counsel. Durable obligations (SR 11-7, NYDFS Part 500) are the safer anchor. This is not legal advice.`,
  },
  {
    slug: "reversibility-recovery-ledger",
    title: "Reversibility and the Recovery Ledger",
    category: "AI Action Fabric",
    body: `For every AI action it sees, ${BRAND.name} works out in advance whether it can be taken back, and classifies it three ways: reversible (prior state can be restored), compensatable (a compensating action neutralises it — e.g. revoke a grant, cancel a job), or irreversible (data left the boundary, a hard delete, money moved — there is no way back).

For reversible and compensatable actions, ${BRAND.name} arms an undo in the Recovery Ledger (Action Fabric → Recovery): the concrete compensating steps, a confidence that the undo would actually work, and a window before it expires (reversibility decays as downstream effects fan out). You take an action back with one tap; because ${BRAND.name} holds no standing write access, it composes the way back and your own systems execute it. Irreversible actions get no undo — ${BRAND.name} flags them to be simulated first and gated behind a human.

Today this runs as a signal alongside the rules decision (it never changes a verdict yet). The honesty rule is strict: ${BRAND.name} never claims to undo something it can't, and marks the genuinely irreversible plainly.`,
  },
  {
    slug: "personal-memory-and-nudges",
    title: `What ${BRAND.name} remembers about you, and the nudges`,
    category: "Account",
    body: `${BRAND.name} keeps a small memory to make your workspace feel like yours — where you spend time, what you were mid-way through, your role, your preferences. This is PRIVATE to you: your admins cannot see it, and it is never shared unless you choose to export it. You can see everything ${BRAND.name} remembers, and delete any of it, under Settings → "What ${BRAND.name} remembers about you". Deleting is a real delete.

From time to time ${BRAND.name} taps you on the shoulder with a single nudge — the one thing that most needs you right now (an unfinished assessment, an unproven control, a missing integration), chosen from your real estate and ranked toward what your role cares about. It points; you decide — it never does the work or the judgement for you. It appears at most once per session, on the home only, and never re-raises something you've waved off. Turn nudges down to high-severity-only, or off, in the same Settings panel.`,
  },
  {
    slug: "dissent",
    title: `When ${BRAND.name} disagrees with you`,
    category: "Getting started",
    body: `${BRAND.name} will tell you when it thinks you're wrong. If its read of the evidence contradicts what's on the record, it raises a disagreement — on the use case, and on the Disagreements page.

A disagreement is only ever raised from a contradiction ${BRAND.name} can point at, never from a hunch. Three today: a control marked "in place" that Red Team walked straight through; a risk tier that under-describes what the AI can demonstrably do (a critical exposed path, or irreversible actions observed); and an approval standing over a critical path that is still open with nothing tracking it.

Every disagreement carries its evidence and a falsifier — "what would change my mind" — so you can settle it with facts rather than argue with it. ${BRAND.name} never blocks: you can overrule, and it steps aside and won't raise that one again. But overruling requires a reason, and the reason is recorded. "The AI objected, a named human overruled it, and here is why" is exactly the artifact a board, an auditor, or a post-incident review will ask for.

${BRAND.name} also withdraws its own objections. When the evidence behind one goes away, the disagreement closes itself and is marked as ${BRAND.name} having been wrong. That record is kept on purpose — a system that only escalates is easy to ignore.`,
  },
  {
    slug: "neo-track-record",
    title: `${BRAND.name}'s Track Record (calibration)`,
    category: "Getting started",
    body: `${BRAND.name} commits to falsifiable claims before the answer exists — "this control will fail when you verify it live", "this attack path will still be exposed at your next Red Team run", "this control will still have no evidence behind it in 30 days" — and then your own systems settle them.

That last part is the whole design. A prediction only counts if it resolves WITHOUT a human adjudicating: a live verification check runs, a Red Team run happens, a clock expires. ${BRAND.name} is never scored on whether you agreed with it, because a system scored on agreement learns to tell you what you want to hear. Marking a control "verified" by hand is not accepted as proof ${BRAND.name} was wrong — that is the same attestation it doubted.

The scorecard shows two things. Accuracy: how often ${BRAND.name} is right when it commits. And calibration: when ${BRAND.name} says 70%, is it right about 70% of the time? The second matters more. Being right 90% of the time while claiming 99% is still lying about your uncertainty.

Until enough predictions have settled, ${BRAND.name} shows the count and refuses to state a rate. The confidence numbers it gives today are reasoned priors, not earned ones; once there's real data they get re-derived from what actually happened. Wrong predictions are shown as prominently as right ones.`,
  },
];

// Paid modules not present in Community Edition. Filtered out so neither the Help
// page nor Ask Neo describe features a self-hoster doesn't have.
const CE_HIDDEN_CATEGORIES = new Set(["Action Fabric", "AI Action Fabric", "AI Supply Chain"]);
const CE_HIDDEN_TITLE_MATCHES = ["Vendor AI Review", "Disrupt:", "Plans and limits"];

function ceVisible(a: HelpArticle): boolean {
  if (CE_HIDDEN_CATEGORIES.has(a.category)) return false;
  if (CE_HIDDEN_TITLE_MATCHES.some((t) => a.title.includes(t))) return false;
  return true;
}

/**
 * Articles the current edition should show. Community Edition drops the paid
 * modules; the full product keeps everything. Used by the Help page AND Ask Neo,
 * so both stay in scope automatically.
 */
export const HELP_ARTICLES: HelpArticle[] = isCommunity()
  ? ALL_HELP_ARTICLES.filter(ceVisible)
  : ALL_HELP_ARTICLES;

/** Compact knowledge base string fed to Ask Neo in help mode. */
export const HELP_KB: string = HELP_ARTICLES.map(
  (a) => `## ${a.title} (${a.category})\n${a.body}`
).join("\n\n");
