import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Per-deployment email template overrides. A partner-admin can toggle each lifecycle email and
 * override its subject/body from /admin/emails. NULL subject/body → the built-in default is used.
 */
export type EmailKey =
  | "welcome" | "trial_ending" | "activate" | "inactivity_nudge" | "dormancy_warning" | "vendor_invite";

export type EmailTemplate = { enabled: boolean; subject: string | null; body: string | null };

/** Editor metadata: label, help, the variables each email supports, and a plain-text default to edit from. */
export const EMAIL_META: {
  key: EmailKey; label: string; description: string; vars: string[]; defaultSubject: string; defaultBody: string;
}[] = [
  {
    key: "welcome", label: "Welcome", description: "Sent once when a customer signs up.",
    vars: ["name", "brand"],
    defaultSubject: "Welcome to {brand} — thank you for choosing us",
    defaultBody: "Hi {name},\n\nWelcome to {brand} — and thank you for choosing us. {brand} gives you one place to see every AI your organization runs, understand what each one can do, and prove it's under control.\n\nThe best way to feel it is to run a single use case through — describe one AI in a sentence and {brand} works out the rest.\n\nGlad to have you,\nThe {brand} team",
  },
  {
    key: "trial_ending", label: "Trial ending", description: "Sent a few days before a trial ends.",
    vars: ["name", "workspace", "brand", "when"],
    defaultSubject: "Your {brand} trial ends {when}",
    defaultBody: "Hi {name},\n\nYour {brand} trial for {workspace} ends {when}. Everything you've built stays exactly where it is — you just need an active plan to keep working past then.\n\nNot sure which plan fits? Just reply and we'll help.\n\nThe {brand} team",
  },
  {
    key: "activate", label: "Activate account", description: "Sent to a signup that never signed in.",
    vars: ["name", "brand"],
    defaultSubject: "Activate your {brand} account",
    defaultBody: "Hi {name},\n\nThanks for signing up for {brand} — your account is ready, but it looks like you haven't signed in yet. It only takes a minute: sign in and add one AI use case.\n\nThe {brand} team",
  },
  {
    key: "inactivity_nudge", label: "Inactivity nudge", description: "Sent when a workspace goes idle ~10 days.",
    vars: ["name", "workspace", "brand"],
    defaultSubject: "Your {brand} workspace is ready when you are",
    defaultBody: "Hi {name},\n\nWe noticed you haven't been back to {workspace} in a little while — no problem at all. Your assessments and controls are right where you left them.\n\nWhenever you're ready — we're here if you need anything.\nThe {brand} team",
  },
  {
    key: "dormancy_warning", label: "Dormancy warning", description: "Warns a long-idle workspace before cleanup.",
    vars: ["name", "workspace", "brand", "days", "grace"],
    defaultSubject: "Keep your {brand} workspace active",
    defaultBody: "Hi {name},\n\nYour workspace {workspace} hasn't been used in about {days} days. To keep it — and all your assessments — click below within {grace} days. If you don't, the workspace and its data will be permanently deleted.\n\nThe {brand} team",
  },
  {
    key: "vendor_invite", label: "Vendor review invite", description: "Invites a vendor to a security review.",
    vars: ["org", "product"],
    defaultSubject: "{org} — AI product security review for {product}",
    defaultBody: "{org} is reviewing {product} before purchase and would like you to answer a short security questionnaire. You'll only have access to this review — nothing else.",
  },
];

export async function getEmailTemplate(key: EmailKey): Promise<EmailTemplate> {
  try {
    const { data } = await supabaseAdmin()
      .from("email_templates").select("enabled, subject, body").eq("key", key).maybeSingle();
    if (!data) return { enabled: true, subject: null, body: null };
    return {
      enabled: data.enabled !== false,
      subject: (data.subject as string) || null,
      body: (data.body as string) || null,
    };
  } catch {
    return { enabled: true, subject: null, body: null }; // table not migrated yet → defaults
  }
}

/** Replace {var} tokens. Unknown tokens are left as-is. */
export function renderVars(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
