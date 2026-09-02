/**
 * MARKETING_KB — the ONLY source of truth the public website concierge ("Ask Neo")
 * may speak from. Keep this factual and non-overclaiming: it is customer-facing and
 * governed by the same honesty discipline as the product. If something isn't in
 * here (or in the HELP_KB the endpoint also passes), the concierge says it isn't
 * sure and offers to have the team follow up. Do NOT put pricing numbers here that
 * can go stale — describe the shape, not the dollar figure, unless confirmed.
 */
export const MARKETING_KB: string = `
# What Neo is
Neo (neocontrol.ai) is an AI governance and control platform. It helps organizations
inventory their AI use, assess the risk of each use case, select and verify the controls
that make that AI safe to run, and produce the evidence and reports auditors and regulators
ask for. The through-line: you can use AI to help, but you can't outsource your judgement to
it — Neo keeps a human accountable for consequential decisions.

# The framework underneath (the 10 pillars)
Every AI use case is governed across 10 control pillars:
1. Inventory & Classification  2. Identity & Access  3. Data Boundary
4. Prompt / Input handling  5. Output / Decision controls  6. Tool / Action controls
7. Human Accountability  8. Assurance & Testing  9. Monitoring, Logging & Evidence
10. Incident Containment & Recovery.
The framework is public (the AI Control Architecture) and the platform operationalizes it.

# What the platform does (modules)
- AI Assessments: describe a use case; Neo classifies it, assigns a risk tier, generates the
  required controls per pillar, the questions to answer, the evidence to collect, an assurance
  test plan, and a governance decision record.
- AI Control Graph: a live map of your AI estate — every use case, its controls, coverage,
  and where the gaps are — with a Shadow AI view that surfaces ungoverned AI spend.
- AI Supply Chain: a dependency map of the models, data, tools and providers your AI relies on
  (an AI bill of materials), with vendor review and concentration/blast-radius analysis.
- AI Red Team: runs real, authorized attacks (Live Fire) against your own AI to prove whether a
  control actually holds, plus a no-traffic Simulation replay and an Anticipate feed of emerging
  threats. It uses judgement, not brute force.
- Reversibility (undo for agentic AI): for every AI action, Neo works out in advance whether it
  can be taken back — reversible, compensatable, or irreversible — arms an undo with the concrete
  way back for the recoverable ones, and gates the irreversible ones (simulate first, then a human).
  The point: you can let AI act boldly where wrong is survivable, and hold the line where it isn't.
  This is what lets AI act at machine speed without betting the outcome is final.
- Integrations & Composer: read-only connectors (AWS, GitHub, and more) that let Neo verify
  controls against your real systems instead of taking your word for it.
- Reporting: executive and per-use-case reports, plus a US Financial Services regulatory
  coverage view.
- Ask Neo: an in-product assistant that answers plain-language questions about your posture.

# Frameworks & regulations Neo maps to
Every control is crosswalked to: NIST AI RMF, ISO/IEC 42001, the EU AI Act, and OWASP for
LLM/agentic risks. For US financial services, Neo also maps to SR 11-7 (Federal Reserve / OCC
model risk management) and NYDFS 23 NYCRR Part 500 (which supervises AI through the cybersecurity
program). US state AI laws (Colorado, Texas, California, Utah, NYC Local Law 144, Illinois) are
covered as a crosswalk appendix. The point is one control set, evidenced once, mapped to many.

# Who it's for
CISOs, AI governance / risk leaders, and the teams standing up AI responsibly — especially in
regulated sectors (financial services, government/public sector, healthcare-adjacent). It suits
organizations that need to show auditors and regulators that their AI is under control.

# How to get started
- Book a walkthrough / talk to the team: the concierge can capture your details and Neo's team
  will reach out. The team's email is neo@neocontrol.ai — this is the ONLY contact address; never
  invent or guess any other email.
- Founding program: a limited early-access cohort. Interested visitors can leave their details.
- Self-serve plans exist from an individual practitioner tier up to Enterprise (with SSO). For a
  current price, the concierge should offer to connect the visitor with the team rather than quote
  a figure.

# What Neo is NOT
Neo is not a model provider and does not train your models. It does not take enforcement actions
on your systems by default — verification connectors are read-only, and any active enforcement is
customer-controlled and opt-in. It does not replace human judgement; it makes the human's judgement
faster and better-evidenced.
`.trim();
