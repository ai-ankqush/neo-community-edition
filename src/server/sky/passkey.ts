import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { issueChallenge, takeChallenge, verifyAssertion, verifyRegistrationClientData, b64url, fromB64url, rpId, origin } from "./webauthn";

/**
 * Passkey (WebAuthn) registration + login ceremonies. Credentials live in sky_credentials with
 * method='passkey' and data = { credentialId, publicKey(SPKI b64url), alg, transports }.
 */

interface PasskeyData {
  credentialId: string;
  publicKey: string; // SPKI, base64url
  alg: number;
  transports?: string[];
}

// ---- Registration (requires an authenticated Sky user) ----

export async function registrationOptions(userId: string, email: string, displayName: string | null) {
  const challenge = await issueChallenge("reg", userId);
  const { data: existing } = await supabaseAdmin().from("sky_credentials").select("data").eq("user_id", userId).eq("method", "passkey");
  const excludeCredentials = (existing ?? []).map((r) => ({ type: "public-key", id: (r.data as PasskeyData).credentialId }));
  return {
    challenge,
    rp: { id: rpId(), name: "Neo Sky" },
    user: { id: b64url(Buffer.from(userId)), name: email, displayName: displayName ?? email },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
    excludeCredentials,
    timeout: 120000,
    attestation: "none",
  };
}

export interface RegisterVerifyInput {
  credentialId: string;
  publicKey: string; // SPKI base64url from browser getPublicKey()
  alg: number;
  transports?: string[];
  clientDataJSON: string; // base64url
  label?: string;
}

export async function verifyAndStoreRegistration(userId: string, input: RegisterVerifyInput): Promise<{ ok: boolean; reason?: string }> {
  const state = await takeChallenge();
  if (!state || state.purpose !== "reg" || state.userId !== userId) return { ok: false, reason: "no_challenge" };

  const reason = verifyRegistrationClientData(fromB64url(input.clientDataJSON), { challenge: state.challenge, origin: origin(), rpId: rpId() });
  if (reason) return { ok: false, reason };
  if (input.alg !== -7 && input.alg !== -257) return { ok: false, reason: "unsupported_alg" };

  const data: PasskeyData = { credentialId: input.credentialId, publicKey: input.publicKey, alg: input.alg, transports: input.transports ?? [] };
  const { error } = await supabaseAdmin().from("sky_credentials").insert({ user_id: userId, method: "passkey", data, label: input.label ?? "Passkey" });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// ---- Login (no session yet) ----

export async function loginOptions(email?: string) {
  let allowCredentials: { type: string; id: string; transports?: string[] }[] = [];
  if (email) {
    const { data: user } = await supabaseAdmin().from("sky_users").select("user_id").ilike("email", email.trim()).maybeSingle();
    if (user) {
      const { data: creds } = await supabaseAdmin().from("sky_credentials").select("data").eq("user_id", user.user_id as string).eq("method", "passkey");
      allowCredentials = (creds ?? []).map((r) => {
        const d = r.data as PasskeyData;
        return { type: "public-key", id: d.credentialId, transports: d.transports };
      });
    }
  }
  const challenge = await issueChallenge("auth");
  return { challenge, rpId: rpId(), allowCredentials, userVerification: "preferred", timeout: 120000 };
}

export interface LoginVerifyInput {
  credentialId: string;
  authenticatorData: string; // base64url
  clientDataJSON: string; // base64url
  signature: string; // base64url
}

export async function verifyLogin(input: LoginVerifyInput): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const state = await takeChallenge();
  if (!state || state.purpose !== "auth") return { ok: false, reason: "no_challenge" };

  const { data: cred } = await supabaseAdmin()
    .from("sky_credentials")
    .select("credential_id, user_id, data")
    .eq("method", "passkey")
    .eq("data->>credentialId", input.credentialId)
    .maybeSingle();
  if (!cred) return { ok: false, reason: "unknown_credential" };

  const d = cred.data as PasskeyData;
  const reason = verifyAssertion(
    {
      spkiDer: fromB64url(d.publicKey),
      alg: d.alg,
      authenticatorData: fromB64url(input.authenticatorData),
      clientDataJSON: fromB64url(input.clientDataJSON),
      signature: fromB64url(input.signature),
    },
    { challenge: state.challenge, origin: origin(), rpId: rpId() },
  );
  if (reason) return { ok: false, reason };

  await supabaseAdmin().from("sky_credentials").update({ last_used_at: new Date().toISOString() }).eq("credential_id", cred.credential_id as string);
  return { ok: true, userId: cred.user_id as string };
}

export async function listPasskeys(userId: string) {
  const { data } = await supabaseAdmin().from("sky_credentials").select("credential_id, label, created_at, last_used_at").eq("user_id", userId).eq("method", "passkey").order("created_at", { ascending: true });
  return data ?? [];
}

export async function deletePasskey(userId: string, credentialRowId: string): Promise<void> {
  await supabaseAdmin().from("sky_credentials").delete().eq("credential_id", credentialRowId).eq("user_id", userId).eq("method", "passkey");
}
