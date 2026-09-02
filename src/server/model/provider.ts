import "server-only";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { planFor } from "@/lib/plans";
import { assumeRole, type AwsCreds } from "@/server/fabric/auth/sigv4";
import { ENGINE_MODELS } from "@/server/methodology/version";

/** A model client is either the direct Anthropic API or Anthropic-on-Bedrock. Both expose `.messages`. */
export type ModelClient = Anthropic | AnthropicBedrock;

/** Anthropic model name → Bedrock model/inference-profile id. Override per id via env. */
function bedrockModelId(model: string): string {
  // Current 4.x Anthropic models on Bedrock use "geo" inference profiles (us.anthropic.<model>),
  // no -v1:0 suffix. Exact ids vary, so each is overridable via env.
  const map: Record<string, string> = {
    [ENGINE_MODELS.deep]: process.env.BEDROCK_MODEL_DEEP ?? `us.anthropic.${ENGINE_MODELS.deep}`,
    [ENGINE_MODELS.fast]: process.env.BEDROCK_MODEL_FAST ?? `us.anthropic.${ENGINE_MODELS.fast}`,
    [ENGINE_MODELS.scaffold]: process.env.BEDROCK_MODEL_SCAFFOLD ?? `us.anthropic.${ENGINE_MODELS.scaffold}`,
  };
  return map[model] ?? model;
}

/** Translate a model id for the given client: Bedrock ids on Bedrock, unchanged on the Anthropic API. */
export function resolveModel(client: ModelClient, model: string): string {
  return client instanceof AnthropicBedrock ? bedrockModelId(model) : model;
}

/**
 * Model-provider seam for BYO-key (Community) vs Neo-managed (paid).
 *
 * getModelClient() defaults to Neo's managed platform key — IDENTICAL to prior
 * behavior — so omitting orgId, or passing a managed/paid org, changes nothing.
 * Only a Community/BYO org that has stored its own key routes model calls to
 * that key (so usage bills to the customer, not Neo).
 */

// --- secret crypto: AES-256-GCM ---
// Master key precedence:
//   1. NEO_BYOK_KEY (64-hex / 32 bytes) if set — explicit override.
//   2. Otherwise derive a stable 32-byte key from SKY_SESSION_SECRET (already
//      required and already persistent). This lets a self-hosted Community Edition
//      store model keys with ZERO extra config. Stored keys stay decryptable across
//      restarts as long as SKY_SESSION_SECRET is unchanged.
function masterKey(): Buffer {
  const hex = process.env.NEO_BYOK_KEY || "";
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  const seed = process.env.SKY_SESSION_SECRET;
  if (seed && seed.length >= 32) return crypto.createHash("sha256").update(seed).digest();
  throw new Error("Set NEO_BYOK_KEY (64-hex) or SKY_SESSION_SECRET to store model keys at rest.");
}

/** Encrypt a plaintext secret for at-rest storage. Returns "v1.iv.tag.cipher" (base64 parts). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/** Decrypt a value produced by encryptSecret(). Throws on tamper / wrong key. */
export function decryptSecret(blob: string): string {
  const [v, ivb, tagb, encb] = String(blob).split(".");
  if (v !== "v1" || !ivb || !tagb || !encb) throw new Error("unrecognized secret format");
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivb, "base64"));
  d.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([d.update(Buffer.from(encb, "base64")), d.final()]).toString("utf8");
}

type OrgModel = {
  plan: string | null;
  provider: string | null;
  secret: string | null;
  meta: Record<string, unknown>;
};

async function loadOrg(orgId: string): Promise<OrgModel | null> {
  const { data } = await supabaseAdmin()
    .from("organizations")
    .select("plan, model_provider, model_secret_encrypted, model_meta")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return null;
  return {
    plan: (data.plan as string | null) ?? null,
    provider: (data.model_provider as string | null) ?? null,
    secret: (data.model_secret_encrypted as string | null) ?? null,
    meta: (data.model_meta as Record<string, unknown>) ?? {},
  };
}

export type ModelAccess = { managed: boolean; ready: boolean; provider: string | null };

/**
 * Whether an org can run model-backed stages, and on whose key.
 * managed=true → runs on Neo's key (paid). managed=false → BYO; ready=true only
 * once the customer has configured a provider key. Used by run-guards and the UI.
 */
export async function resolveModelAccess(orgId: string | null | undefined): Promise<ModelAccess> {
  if (!orgId) return { managed: true, ready: true, provider: null };
  const org = await loadOrg(orgId);
  const managed = planFor(org?.plan).managedModelKey;
  if (managed) return { managed: true, ready: true, provider: null };
  const provider = org?.provider ?? null;
  const meta = (org?.meta ?? {}) as { roleArn?: string };
  const ready =
    provider === "anthropic" ? !!org?.secret :
    provider === "bedrock" ? !!meta.roleArn :
    false;
  return { managed: false, ready, provider };
}

/**
 * The Anthropic client for a run. Defaults to the managed platform key.
 * A Community/BYO org with a stored Anthropic key routes to that key instead.
 */
/** Global kill-switch. BYO routing is OFF unless NEO_BYOK_ENABLED === "true".
 *  Flip it off in the environment for an instant rollback to the managed key. */
export function byokEnabled(): boolean {
  return process.env.NEO_BYOK_ENABLED === "true";
}

export async function getModelClient(orgId?: string | null): Promise<ModelClient> {
  // Deployment-level default provider. For self-host / Community Edition this is
  // how you pick a provider once, via env — no per-org config:
  //   MODEL_PROVIDER=bedrock  → Amazon Bedrock over the AMBIENT AWS credential
  //     chain (ECS task role / EC2 instance profile, or AWS_ACCESS_KEY_ID +
  //     AWS_SECRET_ACCESS_KEY env), region from AWS_REGION / BEDROCK_REGION.
  //     No role to assume, no keys to paste. Model ids map to Bedrock inference
  //     profiles (override per id with BEDROCK_MODEL_DEEP/FAST/SCAFFOLD).
  //   anything else          → Anthropic API with ANTHROPIC_API_KEY.
  const platform = (): ModelClient => {
    if ((process.env.MODEL_PROVIDER ?? "").toLowerCase() === "bedrock") {
      return new AnthropicBedrock({
        awsRegion: process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1",
      });
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  };
  const ce = process.env.AUTH_PROVIDER === "builtin";
  // No org context → deployment default. Hosted keeps the BYO kill-switch; Community
  // Edition always honors a per-org stored key (that's the whole point of BYO self-host).
  if (!orgId || (!ce && !byokEnabled())) return platform();
  const org = await loadOrg(orgId);
  // Managed/paid orgs run on the platform key. A non-managed org uses its own stored
  // key if it has configured one; otherwise it falls back to the deployment default
  // (env ANTHROPIC_API_KEY, or MODEL_PROVIDER=bedrock) — so setting a key in the app
  // is an override, not a hard requirement.
  if (!org || planFor(org.plan).managedModelKey) return platform();

  if (org.provider === "anthropic") {
    if (org.secret) return new Anthropic({ apiKey: decryptSecret(org.secret) });
    return platform();
  }

  if (org.provider === "bedrock") {
    // Keyless: assume the customer's cross-account role, then talk to their Bedrock.
    const meta = (org.meta ?? {}) as { roleArn?: string; externalId?: string; region?: string };
    if (!meta.roleArn || !meta.region) throw new Error("Complete your Amazon Bedrock configuration in Settings.");
    const baseCreds: AwsCreds = {
      accessKeyId: process.env.NEO_AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.NEO_AWS_SECRET_ACCESS_KEY ?? "",
    };
    if (!baseCreds.accessKeyId || !baseCreds.secretAccessKey) throw new Error("Neo AWS base credentials not configured.");
    const temp = await assumeRole({ baseCreds, roleArn: meta.roleArn, externalId: meta.externalId ?? orgId, region: meta.region, sessionName: "neo-byok" });
    return new AnthropicBedrock({
      awsAccessKey: temp.accessKeyId,
      awsSecretKey: temp.secretAccessKey,
      awsSessionToken: temp.sessionToken,
      awsRegion: meta.region,
    });
  }

  throw new Error(`Model provider '${org.provider}' is not supported.`);
}
