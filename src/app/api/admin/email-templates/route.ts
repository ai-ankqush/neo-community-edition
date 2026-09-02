import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@clerk/nextjs/server";
import { getAuthContext } from "@/server/identity/auth-context";
import { AUTH_PROVIDER } from "@/ce/auth-provider";
import { canAccessAdmin, logAdminAccess } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

/** The signed-in admin's email/name — from Sky (Community Edition) or Clerk. */
async function adminContact(userId: string): Promise<{ email: string | null; name: string | null }> {
  if (AUTH_PROVIDER === "builtin") {
    const { data } = await supabaseAdmin().from("sky_users").select("email, display_name").eq("user_id", userId).maybeSingle();
    return { email: (data?.email as string) ?? null, name: (data?.display_name as string) ?? null };
  }
  const u = await currentUser();
  return { email: u?.primaryEmailAddress?.emailAddress ?? null, name: u?.firstName ?? null };
}
import { EMAIL_META, type EmailKey } from "@/lib/email-templates";
import {
  sendWelcomeEmail, sendTrialEndingEmail, sendActivateAccountEmail,
  sendInactivityNudgeEmail, sendDormancyWarningEmail, sendVendorReviewInviteEmail,
} from "@/server/app-emails";

const KEYS = EMAIL_META.map((m) => m.key) as [EmailKey, ...EmailKey[]];

/** GET — every email key merged with its stored override (enabled/subject/body). */
export async function GET() {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  let stored: Record<string, { enabled: boolean; subject: string | null; body: string | null }> = {};
  try {
    const { data } = await supabaseAdmin().from("email_templates").select("key, enabled, subject, body");
    stored = Object.fromEntries((data ?? []).map((r) => [r.key as string, { enabled: r.enabled !== false, subject: (r.subject as string) ?? null, body: (r.body as string) ?? null }]));
  } catch { /* not migrated → all defaults */ }
  const templates = EMAIL_META.map((m) => ({
    ...m,
    enabled: stored[m.key]?.enabled ?? true,
    subject: stored[m.key]?.subject ?? "",
    body: stored[m.key]?.body ?? "",
  }));
  return NextResponse.json({ templates });
}

const SaveBody = z.object({
  action: z.literal("save"),
  key: z.enum(KEYS),
  enabled: z.boolean(),
  subject: z.string().max(300).optional().default(""),
  body: z.string().max(8000).optional().default(""),
});
const TestBody = z.object({ action: z.literal("test"), key: z.enum(KEYS) });

/** POST — save an override, or send a test of one email to the signed-in admin. */
export async function POST(req: NextRequest) {
  const { userId } = await getAuthContext();
  if (!canAccessAdmin(userId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const raw = await req.json();
    if (raw?.action === "test") {
      const { key } = TestBody.parse(raw);
      const { email: to, name } = await adminContact(userId!);
      if (!to) return NextResponse.json({ error: "No email on your account to send a test to." }, { status: 400 });
      const ok = await sendTest(key, to, name);
      await logAdminAccess(userId!, "admin.email.test", { key });
      return NextResponse.json({ ok, sentTo: to, note: ok ? undefined : "SMTP not configured in this environment." });
    }
    const { key, enabled, subject, body } = SaveBody.parse(raw);
    await supabaseAdmin().from("email_templates").upsert(
      { key, enabled, subject: subject.trim() || null, body: body.trim() || null, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: "key" },
    );
    await logAdminAccess(userId!, "admin.email.save", { key, enabled });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error("EMAIL TEMPLATES", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}

function sendTest(key: EmailKey, to: string, name: string | null): Promise<boolean> {
  const ws = "Sample Workspace";
  switch (key) {
    case "welcome": return sendWelcomeEmail(to, name);
    case "trial_ending": return sendTrialEndingEmail(to, name, ws, 3);
    case "activate": return sendActivateAccountEmail(to, name);
    case "inactivity_nudge": return sendInactivityNudgeEmail(to, name, ws);
    case "dormancy_warning": return sendDormancyWarningEmail(to, name, ws, "https://example.com/keep", 90, 14);
    case "vendor_invite": return sendVendorReviewInviteEmail(to, "Sample Org", "Sample Product", "https://example.com/review");
  }
}
