import crypto from "crypto";

/** Minimal AWS Signature V4 signer (pure Node crypto, no SDK).
 *  Verified against AWS's published test vector in the unit tests. */

export interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

const sha256Hex = (d: string | Buffer) => crypto.createHash("sha256").update(d).digest("hex");
const hmac = (key: crypto.BinaryLike, data: string) => crypto.createHmac("sha256", key).update(data, "utf8").digest();

const encodeRfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export interface SignInput {
  creds: AwsCreds;
  region: string;
  service: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** override the timestamp (test only) — format YYYYMMDDTHHMMSSZ */
  amzDateOverride?: string;
}

export function signRequest(input: SignInput): { headers: Record<string, string> } {
  const { creds, region, service, method } = input;
  const u = new URL(input.url);
  const amzDate = input.amzDateOverride ?? new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const body = input.body ?? "";
  const payloadHash = sha256Hex(body);

  // headers normalised to lowercase keys
  const h: Record<string, string> = { host: u.host, "x-amz-date": amzDate };
  for (const [k, v] of Object.entries(input.headers ?? {})) h[k.toLowerCase()] = v;
  if (creds.sessionToken) h["x-amz-security-token"] = creds.sessionToken;

  const sortedKeys = Object.keys(h).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${h[k].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = sortedKeys.join(";");

  const params = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = params.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join("&");

  const canonicalRequest = [method.toUpperCase(), u.pathname || "/", canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + creds.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `${algorithm} Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      "X-Amz-Date": amzDate,
      ...(creds.sessionToken ? { "X-Amz-Security-Token": creds.sessionToken } : {}),
      Authorization: authorization,
      ...(input.headers ?? {}),
    },
  };
}

/** Cross-account AssumeRole using Neo's base creds (env). Returns temp creds. */
export async function assumeRole(opts: {
  baseCreds: AwsCreds;
  roleArn: string;
  externalId: string;
  region: string;
  sessionName?: string;
}): Promise<AwsCreds> {
  const host = `sts.${opts.region}.amazonaws.com`;
  const form = new URLSearchParams({
    Action: "AssumeRole",
    Version: "2011-06-15",
    RoleArn: opts.roleArn,
    RoleSessionName: opts.sessionName ?? "neo-verify",
    ExternalId: opts.externalId,
    DurationSeconds: "900",
  }).toString();

  const url = `https://${host}/`;
  const { headers } = signRequest({
    creds: opts.baseCreds,
    region: opts.region,
    service: "sts",
    method: "POST",
    url,
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form,
  });

  const res = await fetch(url, { method: "POST", headers, body: form });
  const xml = await res.text();
  if (!res.ok) throw new Error(`STS AssumeRole failed (${res.status}): ${xml.slice(0, 200)}`);
  const pick = (tag: string) => xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
  const accessKeyId = pick("AccessKeyId");
  const secretAccessKey = pick("SecretAccessKey");
  const sessionToken = pick("SessionToken");
  if (!accessKeyId || !secretAccessKey || !sessionToken) throw new Error("STS response missing credentials");
  return { accessKeyId, secretAccessKey, sessionToken };
}
