import "server-only";
import { sendEmail } from "@/lib/email";

/**
 * Gravity-branded Sky transactional emails. Every customer lands on the Neo Gravity front door, so the
 * mail carries the same brand: "Neo Gravity — your account to Neo Sky."
 */
function shell(heading: string, bodyHtml: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2B3247">
    <div style="padding:20px 0;border-bottom:1px solid #E2E6F0">
      <span style="font-size:16px;font-weight:800;color:#2B3247">Neo <span style="font-weight:500;color:#46557F">Gravity</span></span>
    </div>
    <div style="padding:24px 0">
      <h1 style="font-size:20px;margin:0 0 12px">${heading}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 0;border-top:1px solid #E2E6F0;font-size:12px;color:#8A93B2">
      Neo Gravity is the trust kernel behind Neo Sky. If you didn't expect this email, you can ignore it.
    </div>
  </div>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:18px 0"><a href="${url}" style="background:#46557F;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${label}</a></p>`;
}

export function sendSkyVerifyEmail(to: string, url: string): Promise<boolean> {
  const html = shell("Welcome to Neo Gravity", `<p style="font-size:14px;line-height:1.6">Confirm your email to finish creating your account and access Neo Sky.</p>${button(url, "Verify email & sign in")}<p style="font-size:12px;color:#8A93B2">This link expires in 15 minutes and can be used once.</p>`);
  return sendEmail({ to, subject: "Verify your email — Neo Gravity", html });
}

export function sendSkySignInEmail(to: string, url: string): Promise<boolean> {
  const html = shell("Sign in to Neo Sky", `<p style="font-size:14px;line-height:1.6">Use the link below to sign in.</p>${button(url, "Sign in")}<p style="font-size:12px;color:#8A93B2">This link expires in 15 minutes and can be used once.</p>`);
  return sendEmail({ to, subject: "Your Neo Sky sign-in link", html });
}

export function sendSkyResetEmail(to: string, url: string): Promise<boolean> {
  const html = shell("Reset your password", `<p style="font-size:14px;line-height:1.6">We received a request to reset your Neo Sky password. If it was you, choose a new one:</p>${button(url, "Set a new password")}<p style="font-size:12px;color:#8A93B2">This link expires in 15 minutes and can be used once. If you didn't request it, your password is unchanged.</p>`);
  return sendEmail({ to, subject: "Reset your Neo Sky password", html });
}

export function sendSkyWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const hi = name ? `Hi ${name},` : "Hi,";
  const html = shell("You're in — welcome to Neo Sky", `<p style="font-size:14px;line-height:1.6">${hi}</p><p style="font-size:14px;line-height:1.6">Your account is verified and ready. Neo Sky is where you author your world on top of the physics Neo Gravity guarantees — bring your framework, connect your stack, and build capability that can bend the rules without ever breaking the invariants underneath.</p>${button(process.env.SKY_BASE_URL ?? "https://sky.neocontrol.ai", "Open Neo Sky")}`);
  return sendEmail({ to, subject: "Welcome to Neo Sky", html });
}
