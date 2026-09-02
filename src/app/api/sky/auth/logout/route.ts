import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/server/sky/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await destroyCurrentSession();
  const base = process.env.SKY_BASE_URL ?? new URL(req.url).origin;
  return NextResponse.json({ ok: true, redirect: `${base}/login` });
}
