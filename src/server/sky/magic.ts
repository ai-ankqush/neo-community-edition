import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendSkyVerifyEmail, sendSkySignInEmail, sendSkyResetEmail, sendSkyWelcomeEmail } from "./emails";

/**
 * One-time email tokens for Sky: login, email-verification, and password-reset. We generate a
 * high-entropy token, store only its SHA-256, and email a purpose-specific link. Tokens are single-use and
 * short-lived. In non-production, if no email sender is configured, the link is returned so it can be tested
 * without email infra.
 */
export type MagicPurpose = "login" | "verify" | "reset";
const TTL_MS = 15 * 60 * 1000;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function skyBaseUrl(): string {
  return process.env.SKY_BASE_URL ?? "https://sky.neocontrol.ai";
}

/** login/verify links auto-consume (session); reset links open the reset page. */
function linkForPurpose(purpose: MagicPurpose, token: string): string {
  const base = skyBaseUrl();
  if (purpose === "reset") return `${base}/reset?token=${encodeURIComponent(token)}`;
  return `${base}/api/sky/auth/magic?token=${encodeURIComponent(token)}`;
}

export interface IssueResult {
  sent: boolean;
  /** Only populated in non-production when email could not be sent — for local testing. */
  devUrl?: string;
}

export async function issueMagicLink(userId: string, email: string, purpose: MagicPurpose = "login"): Promise<IssueResult> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await supabaseAdmin().from("sky_magic_links").insert({ token_hash: sha256(token), user_id: userId, purpose, expires_at: expiresAt });

  const url = linkForPurpose(purpose, token);
  const sent =
    purpose === "verify" ? await sendSkyVerifyEmail(email, url) : purpose === "reset" ? await sendSkyResetEmail(email, url) : await sendSkySignInEmail(email, url);

  if (!sent && process.env.NODE_ENV !== "production") return { sent: false, devUrl: url };
  return { sent };
}

export interface ConsumeResult {
  userId: string;
  purpose: MagicPurpose;
}

/**
 * Verify + consume a token (single-use), restricted to the allowed purposes. login/verify tokens also mark
 * the email verified and, on the first verification, fire the welcome email.
 */
export async function consumeMagicLink(token: string, allowed: MagicPurpose[]): Promise<ConsumeResult | null> {
  const sb = supabaseAdmin();
  const hash = sha256(token);
  const { data } = await sb
    .from("sky_magic_links")
    .select("token_hash, user_id, purpose, expires_at, consumed_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) return null;
  if (data.consumed_at) return null;
  if (!allowed.includes(data.purpose as MagicPurpose)) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  // Atomically claim it (guards double-use races).
  const { data: claimed } = await sb
    .from("sky_magic_links")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("consumed_at", null)
    .select("user_id")
    .maybeSingle();
  if (!claimed) return null;

  const userId = claimed.user_id as string;
  const purpose = data.purpose as MagicPurpose;

  if (purpose === "login" || purpose === "verify") {
    // Flip verified only if it wasn't already; if it flipped, this is the moment to welcome them.
    const { data: flipped } = await sb
      .from("sky_users")
      .update({ email_verified: true })
      .eq("user_id", userId)
      .eq("email_verified", false)
      .select("email, display_name")
      .maybeSingle();
    if (flipped?.email) await sendSkyWelcomeEmail(flipped.email as string, (flipped.display_name as string) ?? null);
  }

  return { userId, purpose };
}
