"use client";

/**
 * Browser-side passkey (WebAuthn) helpers. The registration response's getPublicKey()/getPublicKeyAlgorithm()
 * give us the SPKI public key + COSE alg directly, so the server never parses CBOR. All binary is exchanged
 * as base64url JSON.
 */

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/** Register a new passkey for the signed-in user. Returns an error string, or null on success. */
export async function registerPasskey(): Promise<string | null> {
  try {
    const optRes = await fetch("/api/sky/auth/passkey/register/options", { method: "POST" });
    const opt = await optRes.json();
    if (!optRes.ok) return opt.error || "Could not start registration.";

    const publicKey: PublicKeyCredentialCreationOptions = {
      ...opt,
      challenge: b64urlToBuf(opt.challenge),
      user: { ...opt.user, id: b64urlToBuf(opt.user.id) },
      excludeCredentials: (opt.excludeCredentials || []).map((c: { id: string; type: string }) => ({ ...c, id: b64urlToBuf(c.id) })),
    };
    const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
    if (!cred) return "Registration was cancelled.";
    const resp = cred.response as AuthenticatorAttestationResponse & { getPublicKey?: () => ArrayBuffer | null; getPublicKeyAlgorithm?: () => number; getTransports?: () => string[] };

    const spki = resp.getPublicKey?.();
    const alg = resp.getPublicKeyAlgorithm?.();
    if (!spki || typeof alg !== "number") return "This device/browser can't export the passkey public key. Try a different browser.";

    const verifyRes = await fetch("/api/sky/auth/passkey/register/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        credentialId: bufToB64url(cred.rawId),
        publicKey: bufToB64url(spki),
        alg,
        transports: resp.getTransports?.() ?? [],
        clientDataJSON: bufToB64url(resp.clientDataJSON),
      }),
    });
    const vj = await verifyRes.json();
    return verifyRes.ok ? null : vj.error || "Registration failed.";
  } catch (e) {
    return e instanceof Error ? e.message : "Registration failed.";
  }
}

/** Sign in with a passkey. Pass an email for allowCredentials, or omit for usernameless. */
export async function loginWithPasskey(email?: string): Promise<string | null> {
  try {
    const optRes = await fetch("/api/sky/auth/passkey/login/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(email ? { email } : {}),
    });
    const opt = await optRes.json();
    if (!optRes.ok) return opt.error || "Could not start sign-in.";

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: b64urlToBuf(opt.challenge),
      rpId: opt.rpId,
      userVerification: opt.userVerification,
      timeout: opt.timeout,
      allowCredentials: (opt.allowCredentials || []).map((c: { id: string; type: string; transports?: AuthenticatorTransport[] }) => ({ ...c, id: b64urlToBuf(c.id) })),
    };
    const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    if (!assertion) return "Sign-in was cancelled.";
    const r = assertion.response as AuthenticatorAssertionResponse;

    const verifyRes = await fetch("/api/sky/auth/passkey/login/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        credentialId: bufToB64url(assertion.rawId),
        authenticatorData: bufToB64url(r.authenticatorData),
        clientDataJSON: bufToB64url(r.clientDataJSON),
        signature: bufToB64url(r.signature),
      }),
    });
    const vj = await verifyRes.json();
    if (!verifyRes.ok) return vj.error || "Passkey sign-in failed.";
    window.location.href = "/";
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Passkey sign-in failed.";
  }
}
