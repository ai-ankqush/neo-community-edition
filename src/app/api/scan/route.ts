import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/server/scan";

export const maxDuration = 60;

/** Best-effort soft rate limit per warm instance. The real guards are the
 *  honeypot, length caps, and the cheap one-shot model. A hard cross-instance
 *  limit (DB/Upstash) is a fast-follow if abuse shows up. */
const hits = new Map<string, number[]>();
function limited(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

/** Public "Red Team first" scan. No auth — show the exposure first, capture the
 *  email later at the "secure it" CTA (sign-up). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // honeypot — bots fill the hidden "company" field; humans never see it
    if (typeof body.company === "string" && body.company.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 10) return NextResponse.json({ error: "Describe your AI in a sentence or two." }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: "Keep it under 2000 characters." }, { status: 400 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (limited(ip)) return NextResponse.json({ error: "Too many scans — give it a minute and try again." }, { status: 429 });

    const name = typeof body.name === "string" ? body.name : undefined;
    const result = await runScan(text, name);
    return NextResponse.json(result);
  } catch (err) {
    console.error("scan failed", err);
    return NextResponse.json({ error: "Scan couldn't finish — please try again." }, { status: 500 });
  }
}
