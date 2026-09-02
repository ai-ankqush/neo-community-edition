import "server-only";
import { signRequest, type AwsCreds } from "@/server/fabric/auth/sigv4";

/** AWS Marketplace Metering + Entitlement APIs live in us-east-1. */
const MP_REGION = "us-east-1";

function baseCreds(): AwsCreds {
  const accessKeyId = process.env.NEO_AWS_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.NEO_AWS_SECRET_ACCESS_KEY ?? "";
  if (!accessKeyId || !secretAccessKey) throw new Error("Neo AWS base credentials not configured.");
  return { accessKeyId, secretAccessKey };
}

async function callAws(host: string, target: string, body: unknown): Promise<Record<string, unknown>> {
  const url = `https://${host}/`;
  const payload = JSON.stringify(body);
  const headers = { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": target };
  const signed = signRequest({ creds: baseCreds(), region: MP_REGION, service: "aws-marketplace", method: "POST", url, headers, body: payload });
  const res = await fetch(url, { method: "POST", headers: { ...headers, ...signed.headers }, body: payload });
  const text = await res.text();
  if (!res.ok) throw new Error(`${target} failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export type ResolvedCustomer = { customerId: string; productCode: string; awsAccountId: string };

/** Exchange the one-time x-amzn-marketplace-token for the buyer's customer identity. */
export async function resolveCustomer(registrationToken: string): Promise<ResolvedCustomer> {
  const r = await callAws("metering.marketplace.us-east-1.amazonaws.com", "AWSMPMeteringService.ResolveCustomer", { RegistrationToken: registrationToken });
  return {
    customerId: String(r.CustomerIdentifier ?? ""),
    productCode: String(r.ProductCode ?? ""),
    awsAccountId: String(r.CustomerAWSAccountId ?? ""),
  };
}

export type Entitlement = { dimension: string; expirationDate?: string };

/** Current entitlements for a customer under our product (used to set/keep the org's plan). */
export async function getEntitlements(customerId: string): Promise<Entitlement[]> {
  const productCode = process.env.AWS_MARKETPLACE_PRODUCT_CODE ?? "";
  if (!productCode) throw new Error("AWS_MARKETPLACE_PRODUCT_CODE not set.");
  const r = await callAws("entitlement.marketplace.us-east-1.amazonaws.com", "AWSMPEntitlementService.GetEntitlements", {
    ProductCode: productCode,
    Filter: { CUSTOMER_IDENTIFIER: [customerId] },
  });
  const list = (r.Entitlements as Array<{ Dimension?: string; ExpirationDate?: string }>) ?? [];
  return list.map((e) => ({ dimension: String(e.Dimension ?? ""), expirationDate: e.ExpirationDate }));
}

/** Map an AWS Marketplace dimension (pricing tier) to a Neo plan key.
 *  Override precisely via env AWS_MP_DIMENSION_MAP (JSON) once dimensions are named in the listing. */
export function planFromDimension(dimension: string): string {
  try {
    const map = JSON.parse(process.env.AWS_MP_DIMENSION_MAP ?? "{}") as Record<string, string>;
    if (map[dimension]) return map[dimension];
  } catch { /* fall back to heuristic */ }
  const d = dimension.toLowerCase();
  if (d.includes("enterprise")) return "enterprise";
  if (d.includes("starter")) return "starter";
  if (d.includes("practitioner")) return "practitioner";
  return "starter";
}
