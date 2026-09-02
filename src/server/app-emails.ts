import "server-only";
import { sendEmail } from "@/lib/email";
import { BRAND } from "@/lib/brand";
import { getEmailTemplate, renderVars, type EmailKey } from "@/lib/email-templates";

/**
 * Transactional lifecycle emails — warm, plain-language, on-brand. Each can be toggled off or have its
 * subject/body overridden per deployment from /admin/emails (see email_templates); otherwise the rich
 * built-in default below is used. Distinct from the Sky auth emails in server/sky/emails.ts.
 */
const APP = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.neocontrol.ai";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://neocontrol.ai";

/** Escape user-supplied text before it goes into email HTML. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(heading: string, bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">
    <div style="padding:22px 0;border-bottom:1px solid #e2e8f0">
      <a href="${SITE}" style="text-decoration:none;color:inherit;display:inline-block">
        <img src="${SITE}/apple-touch-icon.png" width="30" height="30" alt="${BRAND.name}" style="border-radius:8px;vertical-align:middle" />
        <span style="font-size:15px;font-weight:700;color:#0f172a;vertical-align:middle;margin-left:9px">${BRAND.name}</span>
        <span style="font-size:13px;color:#64748b;vertical-align:middle;margin-left:6px">AI Control Platform</span>
      </a>
    </div>
    <div style="padding:26px 0">
      <h1 style="font-size:21px;line-height:1.3;margin:0 0 14px">${heading}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:18px 0;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.7">
      Need a hand? Reply to this email or write to <a href="mailto:${BRAND.contactEmail}" style="color:#64748b">${BRAND.contactEmail}</a> — a real person will help.<br/>
      <span style="display:inline-block;margin-top:9px">
        <a href="${SITE}/privacy" style="color:#64748b;text-decoration:underline">Privacy Policy</a>
        &nbsp;·&nbsp;
        <a href="${SITE}/terms" style="color:#64748b;text-decoration:underline">Terms of Use</a>
      </span><br/>
      <span style="display:inline-block;margin-top:9px;color:#b6c0cf">© ${year} ${BRAND.name} · AI Control Platform</span>
    </div>
  </div>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:22px 0"><a href="${url}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${label}</a></p>`;
}

const p = (html: string) => `<p style="font-size:14.5px;line-height:1.65;color:#334155;margin:0 0 14px">${html}</p>`;

/**
 * Send a lifecycle email, honoring the per-deployment override: skip if disabled; use the custom
 * subject/body (plain text, {vars} substituted, wrapped in the brand shell + CTA) if set; else the
 * rich built-in default. Never throws.
 */
async function deliver(
  key: EmailKey,
  to: string,
  opts: {
    defaultSubject: string;
    heading: string;
    defaultBody: string;
    cta?: { url: string; label: string };
    vars: Record<string, string | number>;
  }
): Promise<boolean> {
  const t = await getEmailTemplate(key);
  if (!t.enabled) return false;
  const subject = renderVars(t.subject || opts.defaultSubject, opts.vars);
  let bodyHtml: string;
  if (t.body) {
    bodyHtml = t.body
      .split(/\n\s*\n/)
      .map((par) => p(esc(renderVars(par, opts.vars)).replace(/\n/g, "<br/>")))
      .join("");
    if (opts.cta) bodyHtml += button(opts.cta.url, renderVars(opts.cta.label, opts.vars));
  } else {
    bodyHtml = opts.defaultBody;
  }
  return sendEmail({ to, subject, html: shell(renderVars(opts.heading, opts.vars), bodyHtml) });
}

/** Sent once, when a new user first goes through the welcome/onboarding. */
export function sendWelcomeEmail(to: string, firstName?: string | null): Promise<boolean> {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  const defaultBody =
    p(hi) +
    p(`<strong>Welcome to ${BRAND.name} — and thank you for choosing us.</strong> We're genuinely glad you're here. ${BRAND.name} gives you one place to see every AI your organization runs, understand what each one can actually do, and prove it's under control — to your team, your auditors, and your board.`) +
    p(`The best way to feel it is to run a single use case through. Describe one AI in a sentence and ${BRAND.name} works out what it can see, decide, and do, tiers the risk, and generates the controls — usually in a few minutes.`) +
    button(APP, `Open ${BRAND.name}`) +
    p(`New here? The <a href="${SITE}/getting-started" style="color:#3b82f6">getting-started guide</a> walks you through it. And if you ever get stuck, we're one reply away.`) +
    p(`Glad to have you,<br/>The ${BRAND.name} team`);
  return deliver("welcome", to, {
    defaultSubject: `Welcome to ${BRAND.name} — thank you for choosing us`,
    heading: `Welcome to the ${BRAND.name} AI Control Platform`,
    defaultBody,
    cta: { url: APP, label: `Open ${BRAND.name}` },
    vars: { name: firstName || "there", brand: BRAND.name },
  });
}

/** Sent once, ~3 days before a trial ends. */
export function sendTrialEndingEmail(to: string, firstName: string | null | undefined, workspace: string, days: number): Promise<boolean> {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const defaultBody =
    p(hi) +
    p(`Your ${BRAND.name} trial for <strong>${esc(workspace)}</strong> ends ${when}. Everything you've built — your use cases, controls, evidence, and decisions — stays exactly where it is; you just need an active plan to keep working in it past then.`) +
    button(`${APP}/dashboard/plans`, "Choose a plan") +
    p("Not sure which plan fits, or want to talk it through? Just reply to this email and we'll sort out the right fit with you.") +
    p(`The ${BRAND.name} team`);
  return deliver("trial_ending", to, {
    defaultSubject: `Your ${BRAND.name} trial ends ${when}`,
    heading: `Keep your ${BRAND.name} workspace going`,
    defaultBody,
    cta: { url: `${APP}/dashboard/plans`, label: "Choose a plan" },
    vars: { name: firstName || "there", workspace, brand: BRAND.name, when, days },
  });
}

/** Sent once to an org that signed up but never reached the app (last_active_at is null). */
export function sendActivateAccountEmail(to: string, firstName?: string | null): Promise<boolean> {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  const defaultBody =
    p(hi) +
    p(`Thanks for signing up for ${BRAND.name} — your account is created and waiting, but it looks like you haven't had a chance to sign in and activate it yet.`) +
    p(`It only takes a minute: sign in, add one AI use case in a sentence, and ${BRAND.name} works out what it can see, decide, and do, tiers the risk, and generates the controls for you.`) +
    button(APP, "Activate your account") +
    p(`If you ran into any trouble signing in, just reply and we'll get you sorted.`) +
    p(`The ${BRAND.name} team`);
  return deliver("activate", to, {
    defaultSubject: `Activate your ${BRAND.name} account`,
    heading: `Let's activate your ${BRAND.name} account`,
    defaultBody,
    cta: { url: APP, label: "Activate your account" },
    vars: { name: firstName || "there", brand: BRAND.name },
  });
}

/** Sent when a workspace goes ~10 days without a sign-in (re-arms on return; nothing is deleted). */
export function sendInactivityNudgeEmail(to: string, firstName: string | null | undefined, workspace: string): Promise<boolean> {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  const defaultBody =
    p(hi) +
    p(`We noticed you haven't been back to <strong>${esc(workspace)}</strong> in a little while — no problem at all. Your assessments and controls are right where you left them, safe and sound.`) +
    p(`If you weren't sure what to do next, that's the easy part: add one AI use case and ${BRAND.name} handles the classification, risk tier, and controls for you.`) +
    button(`${APP}/dashboard/use-cases/new`, "Jump back in") +
    p(`Whenever you're ready — we're here if you need anything.<br/>The ${BRAND.name} team`);
  return deliver("inactivity_nudge", to, {
    defaultSubject: `Your ${BRAND.name} workspace is ready when you are`,
    heading: "Still there? We saved your place",
    defaultBody,
    cta: { url: `${APP}/dashboard/use-cases/new`, label: "Jump back in" },
    vars: { name: firstName || "there", workspace, brand: BRAND.name },
  });
}

/** Dormancy warning — workspace idle ~90 days; keep it or it's deleted after the grace window. */
export function sendDormancyWarningEmail(to: string, firstName: string | null | undefined, workspace: string, keepUrl: string, dormantDays: number, graceDays: number): Promise<boolean> {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  const defaultBody =
    p(hi) +
    p(`Your workspace <strong>${esc(workspace)}</strong> hasn't been used in about ${dormantDays} days. To keep it — and all your assessments — just click below within ${graceDays} days. If you don't, the workspace and its data will be permanently deleted.`) +
    button(keepUrl, "Keep my workspace") +
    p(`Or simply sign in — that keeps it active too. Questions? Just reply to this email.`) +
    p(`The ${BRAND.name} team`);
  return deliver("dormancy_warning", to, {
    defaultSubject: `Keep your ${BRAND.name} workspace active`,
    heading: `Is your ${BRAND.name} workspace still needed?`,
    defaultBody,
    cta: { url: keepUrl, label: "Keep my workspace" },
    vars: { name: firstName || "there", workspace, brand: BRAND.name, days: dormantDays, grace: graceDays },
  });
}

/** Vendor-review invite — external vendor gets a scoped link to answer one review's questions. */
export function sendVendorReviewInviteEmail(to: string, orgName: string, productName: string, url: string): Promise<boolean> {
  const defaultBody =
    p(`<strong>${esc(orgName)}</strong> is reviewing <strong>${esc(productName)}</strong> before purchase and would like you to answer a short security questionnaire. You'll only have access to this review — nothing else.`) +
    button(url, "Answer the questions") +
    p(`Or paste this link into your browser:<br/><span style="word-break:break-all;color:#64748b">${url}</span>`);
  return deliver("vendor_invite", to, {
    defaultSubject: `${orgName} — AI product security review for ${productName}`,
    heading: "AI product security review",
    defaultBody,
    cta: { url, label: "Answer the questions" },
    vars: { org: orgName, product: productName },
  });
}
