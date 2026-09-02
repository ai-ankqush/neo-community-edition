import "server-only";
import { smtpSendMail } from "./smtp";

/**
 * Transactional email over SMTP (dependency-free — see ./smtp). Configure with a provider that issues an
 * SMTP submission token, e.g. Proton Mail:
 *   SMTP_HOST=smtp.protonmail.ch  SMTP_PORT=587  SMTP_USER=<your custom-domain address>
 *   SMTP_PASS=<the generated SMTP token>  EMAIL_FROM=<same address, may be "Name <addr>">
 * Never throws — email failure must not break the calling flow.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const from = process.env.EMAIL_FROM?.trim() || user || "Neo <neo@neocontrol.ai>";

  if (!host || !user || !pass) {
    console.warn("SMTP not configured (SMTP_HOST/USER/PASS) — skipping email to", to);
    return false;
  }

  try {
    await smtpSendMail({ host, port, user, pass }, { from, to, subject, html });
    return true;
  } catch (err) {
    console.error("EMAIL SEND ERROR", err);
    return false;
  }
}
